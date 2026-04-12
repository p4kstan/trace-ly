import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface HourlyCount { hour: string; count: number }

/**
 * Anomaly Detection — compares current hour event volume vs 7-day avg
 * POST /anomaly-detection { workspace_id } or GET (runs for all workspaces)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let workspaceIds: string[] = [];

    if (req.method === "POST") {
      const body = await req.json();
      if (body.workspace_id) workspaceIds = [body.workspace_id];
    }

    // If no specific workspace, get all active
    if (workspaceIds.length === 0) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .eq("status", "active")
        .limit(100);
      workspaceIds = (ws || []).map(w => w.id);
    }

    const alerts: any[] = [];
    const now = new Date();
    const currentHourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const oneHourAgo = new Date(currentHourStart.getTime() - 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const wsId of workspaceIds) {
      // Current hour event count
      const { count: currentCount } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .gte("created_at", currentHourStart.toISOString());

      // Same hour over last 7 days average
      const { count: historicalTotal } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .gte("created_at", sevenDaysAgo.toISOString())
        .lt("created_at", currentHourStart.toISOString());

      // Rough hourly average over 7 days (168 hours)
      const hoursInPeriod = Math.max(
        (currentHourStart.getTime() - sevenDaysAgo.getTime()) / (60 * 60 * 1000),
        1
      );
      const avgPerHour = (historicalTotal || 0) / hoursInPeriod;
      const actual = currentCount || 0;

      if (avgPerHour < 1 && actual < 5) continue; // Too little data

      const deviation = avgPerHour > 0
        ? ((actual - avgPerHour) / avgPerHour) * 100
        : actual > 0 ? 100 : 0;

      // Spike: >200% above average
      if (deviation > 200) {
        const alert = {
          workspace_id: wsId,
          metric_name: "event_volume_spike",
          severity: deviation > 500 ? "critical" : "warning",
          expected_value: Math.round(avgPerHour),
          actual_value: actual,
          deviation_percent: Math.round(deviation),
          message: `Volume de eventos ${Math.round(deviation)}% acima da média (${actual} vs ~${Math.round(avgPerHour)}/h)`,
        };
        alerts.push(alert);
      }

      // Drop: >80% below average (only if avg is significant)
      if (deviation < -80 && avgPerHour > 5) {
        const alert = {
          workspace_id: wsId,
          metric_name: "event_volume_drop",
          severity: deviation < -95 ? "critical" : "warning",
          expected_value: Math.round(avgPerHour),
          actual_value: actual,
          deviation_percent: Math.round(deviation),
          message: `Volume de eventos ${Math.abs(Math.round(deviation))}% abaixo da média (${actual} vs ~${Math.round(avgPerHour)}/h)`,
        };
        alerts.push(alert);
      }

      // Queue health: failed items
      const { count: failedQueue } = await supabase
        .from("event_queue")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("status", "failed");

      if ((failedQueue || 0) > 10) {
        alerts.push({
          workspace_id: wsId,
          metric_name: "queue_failures",
          severity: (failedQueue || 0) > 50 ? "critical" : "warning",
          expected_value: 0,
          actual_value: failedQueue,
          deviation_percent: 100,
          message: `${failedQueue} eventos falharam na fila de processamento`,
        });
      }

      // Dead letter accumulation
      const { count: dlCount } = await supabase
        .from("dead_letter_events")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId);

      if ((dlCount || 0) > 20) {
        alerts.push({
          workspace_id: wsId,
          metric_name: "dead_letter_accumulation",
          severity: (dlCount || 0) > 100 ? "critical" : "warning",
          expected_value: 0,
          actual_value: dlCount,
          deviation_percent: 100,
          message: `${dlCount} eventos na dead letter queue aguardando replay`,
        });
      }
    }

    // Insert alerts (dedup by workspace + metric in last hour)
    for (const alert of alerts) {
      const { count: existing } = await supabase
        .from("anomaly_alerts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", alert.workspace_id)
        .eq("metric_name", alert.metric_name)
        .gte("detected_at", oneHourAgo.toISOString());

      if (!existing || existing === 0) {
        await supabase.from("anomaly_alerts").insert(alert);
      }
    }

    return new Response(JSON.stringify({
      status: "ok",
      workspaces_checked: workspaceIds.length,
      alerts_generated: alerts.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Anomaly detection error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
