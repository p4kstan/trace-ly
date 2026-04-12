import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Optimization Engine — analyzes channels and generates budget recommendations
 * Also runs hybrid attribution combining Markov + Shapley + Time Decay + Linear
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Gather attribution results from all models
    const [
      { data: attrResults },
      { data: conversions },
      { data: touches },
    ] = await Promise.all([
      supabase.from("attribution_results").select("*")
        .eq("workspace_id", workspace_id).gte("created_at", sevenDaysAgo).limit(1000),
      supabase.from("conversions").select("*")
        .eq("workspace_id", workspace_id).gte("happened_at", sevenDaysAgo).limit(500),
      supabase.from("attribution_touches").select("*")
        .eq("workspace_id", workspace_id).gte("touch_time", sevenDaysAgo).limit(1000),
    ]);

    // === HYBRID ATTRIBUTION ===
    // Group attribution results by source+conversion, across models
    const hybridMap = new Map<string, {
      source: string; medium: string; campaign: string;
      markov: number; shapley: number; time_decay: number; linear: number;
      total_value: number; conversion_ids: Set<string>;
    }>();

    for (const ar of (attrResults || [])) {
      const key = `${ar.source || 'Direct'}|${ar.medium || ''}|${ar.campaign || ''}`;
      const entry = hybridMap.get(key) || {
        source: ar.source || 'Direct', medium: ar.medium || '', campaign: ar.campaign || '',
        markov: 0, shapley: 0, time_decay: 0, linear: 0,
        total_value: 0, conversion_ids: new Set<string>(),
      };

      const credit = Number(ar.credit || 0);
      const model = ar.model?.toLowerCase() || '';

      if (model.includes('markov')) entry.markov += credit;
      else if (model.includes('shapley')) entry.shapley += credit;
      else if (model.includes('time_decay')) entry.time_decay += credit;
      else if (model.includes('linear')) entry.linear += credit;

      entry.total_value += Number(ar.attributed_value || 0);
      if (ar.conversion_id) entry.conversion_ids.add(ar.conversion_id);
      hybridMap.set(key, entry);
    }

    // Compute hybrid credit (weighted: Markov 30%, Shapley 30%, Time Decay 25%, Linear 15%)
    const hybridResults: any[] = [];
    for (const [, entry] of hybridMap) {
      const total = entry.markov + entry.shapley + entry.time_decay + entry.linear;
      if (total === 0) continue;

      const hybridCredit = (
        (entry.markov / total) * 0.30 +
        (entry.shapley / total) * 0.30 +
        (entry.time_decay / total) * 0.25 +
        (entry.linear / total) * 0.15
      );

      hybridResults.push({
        workspace_id,
        source: entry.source,
        medium: entry.medium,
        campaign: entry.campaign,
        markov_credit: entry.markov,
        shapley_credit: entry.shapley,
        time_decay_credit: entry.time_decay,
        linear_credit: entry.linear,
        hybrid_credit: Math.round(hybridCredit * 10000) / 10000,
        hybrid_value: Math.round(entry.total_value * hybridCredit * 100) / 100,
        conversion_value: entry.total_value,
      });
    }

    // Save hybrid attribution
    if (hybridResults.length) {
      await supabase.from("attribution_hybrid").delete().eq("workspace_id", workspace_id);
      await supabase.from("attribution_hybrid").insert(hybridResults);
    }

    // === OPTIMIZATION RECOMMENDATIONS ===
    const recommendations: any[] = [];

    // Channel performance analysis
    const channelStats = new Map<string, { revenue: number; conversions: number; touches: number }>();
    for (const c of (conversions || [])) {
      const ch = c.attributed_source || "Direct";
      const s = channelStats.get(ch) || { revenue: 0, conversions: 0, touches: 0 };
      s.conversions++;
      s.revenue += Number(c.value || 0);
      channelStats.set(ch, s);
    }
    for (const t of (touches || [])) {
      const ch = t.source || "Direct";
      const s = channelStats.get(ch) || { revenue: 0, conversions: 0, touches: 0 };
      s.touches++;
      channelStats.set(ch, s);
    }

    const totalConversions = (conversions || []).length;
    const totalTouches = (touches || []).length;
    const avgConvRate = totalTouches > 0 ? totalConversions / totalTouches : 0;
    const totalRevenue = (conversions || []).reduce((a, c) => a + Number(c.value || 0), 0);

    for (const [channel, stats] of channelStats) {
      const convRate = stats.touches > 0 ? stats.conversions / stats.touches : 0;
      const revenueShare = totalRevenue > 0 ? stats.revenue / totalRevenue : 0;

      if (convRate > avgConvRate * 1.5 && stats.conversions >= 3) {
        recommendations.push({
          workspace_id,
          channel,
          action: "increase_budget",
          reason: `Taxa de conversão ${(convRate * 100).toFixed(1)}% é ${((convRate / avgConvRate - 1) * 100).toFixed(0)}% acima da média. Revenue share: ${(revenueShare * 100).toFixed(0)}%.`,
          priority: convRate > avgConvRate * 2 ? "high" : "medium",
          estimated_impact: Math.round(stats.revenue * 0.3),
          current_value: stats.revenue,
        });
      } else if (convRate < avgConvRate * 0.4 && stats.touches > 15) {
        recommendations.push({
          workspace_id,
          channel,
          action: stats.conversions === 0 ? "pause_channel" : "decrease_budget",
          reason: `Taxa de conversão ${(convRate * 100).toFixed(1)}% é ${((1 - convRate / avgConvRate) * 100).toFixed(0)}% abaixo da média com ${stats.touches} touchpoints.`,
          priority: stats.conversions === 0 ? "high" : "medium",
          current_value: stats.revenue,
        });
      }
    }

    // Save recommendations
    if (recommendations.length) {
      await supabase.from("optimization_recommendations").delete()
        .eq("workspace_id", workspace_id).eq("status", "pending");
      await supabase.from("optimization_recommendations").insert(recommendations);
    }

    // === AUTO EVENT DISCOVERY ===
    // Find new/unusual event names
    const { data: recentEvents } = await supabase
      .from("events")
      .select("event_name")
      .eq("workspace_id", workspace_id)
      .gte("created_at", sevenDaysAgo)
      .limit(1000);

    const eventCounts = new Map<string, number>();
    for (const e of (recentEvents || [])) {
      eventCounts.set(e.event_name, (eventCounts.get(e.event_name) || 0) + 1);
    }

    // Check for events not previously discovered
    const { data: existingDiscoveries } = await supabase
      .from("event_discovery")
      .select("event_name")
      .eq("workspace_id", workspace_id);

    const knownEvents = new Set((existingDiscoveries || []).map(d => d.event_name));
    const newDiscoveries: any[] = [];

    for (const [eventName, count] of eventCounts) {
      if (!knownEvents.has(eventName)) {
        newDiscoveries.push({
          workspace_id,
          discovery_type: "new_event",
          event_name: eventName,
          occurrence_count: count,
          status: "new",
        });
      }
    }

    if (newDiscoveries.length) {
      await supabase.from("event_discovery").insert(newDiscoveries);
    }

    return new Response(JSON.stringify({
      status: "ok",
      hybrid_attribution: hybridResults.length,
      recommendations: recommendations.length,
      new_events_discovered: newDiscoveries.length,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Optimization engine error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
