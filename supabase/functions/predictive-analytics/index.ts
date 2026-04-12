import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { workspace_id, prediction_type } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather historical data
    const [{ data: conversions }, { data: touches }, { data: events }] = await Promise.all([
      supabase.from("conversions").select("*").eq("workspace_id", workspace_id).order("happened_at", { ascending: false }).limit(1000),
      supabase.from("attribution_touches").select("*").eq("workspace_id", workspace_id).limit(2000),
      supabase.from("events").select("event_name, event_time, custom_data_json, source").eq("workspace_id", workspace_id).order("event_time", { ascending: false }).limit(2000),
    ]);

    if (!conversions?.length) {
      return new Response(JSON.stringify({ error: "No conversion data for predictions", predictions: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build features by channel
    const channelStats = new Map<string, { spend: number; conversions: number; revenue: number; touches: number; firstSeen: string; lastSeen: string }>();

    for (const conv of conversions) {
      const ch = conv.attributed_source || "Direct";
      const s = channelStats.get(ch) || { spend: 0, conversions: 0, revenue: 0, touches: 0, firstSeen: conv.happened_at, lastSeen: conv.happened_at };
      s.conversions++;
      s.revenue += Number(conv.value || 0);
      s.lastSeen = conv.happened_at > s.lastSeen ? conv.happened_at : s.lastSeen;
      s.firstSeen = conv.happened_at < s.firstSeen ? conv.happened_at : s.firstSeen;
      channelStats.set(ch, s);
    }

    for (const t of (touches || [])) {
      const ch = t.source || "Direct";
      const s = channelStats.get(ch) || { spend: 0, conversions: 0, revenue: 0, touches: 0, firstSeen: t.touch_time, lastSeen: t.touch_time };
      s.touches++;
      channelStats.set(ch, s);
    }

    // Compute predictions using statistical models
    const predictions: any[] = [];
    const totalRevenue = conversions.reduce((a, c) => a + Number(c.value || 0), 0);
    const totalConversions = conversions.length;
    const avgOrderValue = totalRevenue / totalConversions;

    // Compute daily revenue trend
    const dailyRevenue = new Map<string, number>();
    for (const conv of conversions) {
      const day = conv.happened_at.substring(0, 10);
      dailyRevenue.set(day, (dailyRevenue.get(day) || 0) + Number(conv.value || 0));
    }
    const days = [...dailyRevenue.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const recentDays = days.slice(-7);
    const avgDailyRevenue = recentDays.reduce((a, [, v]) => a + v, 0) / Math.max(recentDays.length, 1);

    // Trend: linear regression on daily revenue
    let trend = 0;
    if (recentDays.length >= 3) {
      const n = recentDays.length;
      const xMean = (n - 1) / 2;
      const yMean = recentDays.reduce((a, [, v]) => a + v, 0) / n;
      let num = 0, den = 0;
      recentDays.forEach(([, v], i) => {
        num += (i - xMean) * (v - yMean);
        den += (i - xMean) ** 2;
      });
      trend = den > 0 ? num / den : 0;
    }

    // ROAS predictions per channel
    for (const [channel, stats] of channelStats) {
      const convRate = stats.touches > 0 ? stats.conversions / stats.touches : 0;
      const channelAOV = stats.conversions > 0 ? stats.revenue / stats.conversions : avgOrderValue;

      // Predict ROAS at different horizons
      for (const horizon of [1, 7, 30]) {
        const projectedConversions = convRate * stats.touches * (horizon / 7);
        const projectedRevenue = projectedConversions * channelAOV * (1 + trend * horizon / avgDailyRevenue / 100);
        const confidence = Math.min(0.95, 0.5 + (stats.conversions / 100) + (stats.touches / 500));

        predictions.push({
          workspace_id,
          prediction_type: `roas_${horizon === 1 ? '24h' : horizon + 'd'}`,
          channel,
          predicted_value: Math.max(0, projectedRevenue),
          confidence: Math.round(confidence * 100) / 100,
          horizon_days: horizon,
          features_json: { conv_rate: convRate, aov: channelAOV, touches: stats.touches, trend, conversions: stats.conversions },
        });
      }

      // LTV prediction
      const daysSinceFirst = stats.firstSeen ? (Date.now() - new Date(stats.firstSeen).getTime()) / 86400000 : 30;
      const revenuePerDay = daysSinceFirst > 0 ? stats.revenue / daysSinceFirst : 0;
      const predictedLTV = revenuePerDay * 365;

      predictions.push({
        workspace_id,
        prediction_type: "ltv",
        channel,
        predicted_value: Math.max(0, predictedLTV),
        confidence: Math.min(0.9, 0.3 + (stats.conversions / 50)),
        horizon_days: 365,
        features_json: { revenue_per_day: revenuePerDay, total_revenue: stats.revenue, days_active: daysSinceFirst },
      });
    }

    // Channel optimization suggestions
    const optimizations: any[] = [];
    const channelEntries = [...channelStats.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
    for (const [channel, stats] of channelEntries) {
      const convRate = stats.touches > 0 ? stats.conversions / stats.touches : 0;
      const avgConvRate = totalConversions / (touches?.length || 1);
      if (convRate > avgConvRate * 1.5) {
        optimizations.push({ channel, action: "increase_budget", reason: `Conv rate ${(convRate * 100).toFixed(1)}% is ${((convRate / avgConvRate - 1) * 100).toFixed(0)}% above average` });
      } else if (convRate < avgConvRate * 0.5 && stats.touches > 10) {
        optimizations.push({ channel, action: "decrease_budget", reason: `Conv rate ${(convRate * 100).toFixed(1)}% is ${((1 - convRate / avgConvRate) * 100).toFixed(0)}% below average` });
      }
    }

    // Save predictions
    if (predictions.length) {
      // Delete old predictions for this workspace
      await supabase.from("prediction_results").delete().eq("workspace_id", workspace_id);
      await supabase.from("prediction_results").insert(predictions);
    }

    return new Response(JSON.stringify({
      status: "ok",
      predictions: predictions.length,
      optimizations,
      summary: {
        total_revenue: totalRevenue,
        avg_daily_revenue: avgDailyRevenue,
        trend_direction: trend > 0 ? "up" : trend < 0 ? "down" : "flat",
        channels_analyzed: channelStats.size,
      },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Predictive Analytics error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
