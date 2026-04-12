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
 * Advanced Anomaly Detection v2.0
 * - Z-score detection
 * - Moving average anomaly
 * - Seasonality detection (hour-of-day patterns)
 * - Conversion drop detection
 * - Revenue anomaly detection
 * - Queue health monitoring
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let workspaceIds: string[] = [];

    if (req.method === "POST") {
      const body = await req.json();
      if (body.workspace_id) workspaceIds = [body.workspace_id];
    }

    if (workspaceIds.length === 0) {
      const { data: ws } = await supabase.from("workspaces").select("id").eq("status", "active").limit(100);
      workspaceIds = (ws || []).map(w => w.id);
    }

    const alerts: any[] = [];
    const now = new Date();
    const currentHourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const oneHourAgo = new Date(currentHourStart.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    for (const wsId of workspaceIds) {
      // Gather data in parallel
      const [
        { count: currentCount },
        { data: recentEvents },
        { data: recentConversions },
        { data: olderConversions },
        { count: failedQueue },
        { count: dlCount },
      ] = await Promise.all([
        supabase.from("events").select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId).gte("created_at", currentHourStart.toISOString()),
        supabase.from("events").select("created_at")
          .eq("workspace_id", wsId).gte("created_at", sevenDaysAgo.toISOString()).limit(1000),
        supabase.from("conversions").select("happened_at, value")
          .eq("workspace_id", wsId).gte("happened_at", sevenDaysAgo.toISOString()).limit(500),
        supabase.from("conversions").select("happened_at, value")
          .eq("workspace_id", wsId).gte("happened_at", fourteenDaysAgo.toISOString())
          .lt("happened_at", sevenDaysAgo.toISOString()).limit(500),
        supabase.from("event_queue").select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId).eq("status", "failed"),
        supabase.from("dead_letter_events").select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId),
      ]);

      // === Z-SCORE ANOMALY DETECTION ===
      // Build hourly buckets for the past 7 days
      const hourlyBuckets = new Map<string, number>();
      for (const e of (recentEvents || [])) {
        const h = e.created_at.substring(0, 13); // YYYY-MM-DDTHH
        hourlyBuckets.set(h, (hourlyBuckets.get(h) || 0) + 1);
      }

      const hourlyCounts = [...hourlyBuckets.values()];
      if (hourlyCounts.length >= 12) {
        const mean = hourlyCounts.reduce((a, b) => a + b, 0) / hourlyCounts.length;
        const stdDev = Math.sqrt(hourlyCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / hourlyCounts.length);
        const actual = currentCount || 0;

        if (stdDev > 0) {
          const zScore = (actual - mean) / stdDev;

          // Z-score > 3 = significant spike
          if (zScore > 3) {
            alerts.push({
              workspace_id: wsId,
              metric_name: "zscore_event_spike",
              severity: zScore > 5 ? "critical" : "warning",
              expected_value: Math.round(mean),
              actual_value: actual,
              deviation_percent: Math.round(((actual - mean) / mean) * 100),
              message: `Z-score ${zScore.toFixed(1)}: volume ${actual} eventos/h é ${zScore.toFixed(1)} desvios padrão acima da média (${Math.round(mean)}/h)`,
            });
          }

          // Z-score < -2.5 = significant drop
          if (zScore < -2.5 && mean > 3) {
            alerts.push({
              workspace_id: wsId,
              metric_name: "zscore_event_drop",
              severity: zScore < -4 ? "critical" : "warning",
              expected_value: Math.round(mean),
              actual_value: actual,
              deviation_percent: Math.round(((actual - mean) / mean) * 100),
              message: `Z-score ${zScore.toFixed(1)}: volume caiu para ${actual} eventos/h (média: ${Math.round(mean)}/h, σ: ${stdDev.toFixed(1)})`,
            });
          }
        }
      }

      // === MOVING AVERAGE ANOMALY ===
      // Compare last 24h vs 7-day moving average
      const last24hEvents = (recentEvents || []).filter(e => new Date(e.created_at) >= oneDayAgo).length;
      const avgDaily = (recentEvents || []).length / 7;

      if (avgDaily > 5) {
        const maDeviation = ((last24hEvents - avgDaily) / avgDaily) * 100;

        if (maDeviation > 150) {
          alerts.push({
            workspace_id: wsId,
            metric_name: "ma_event_spike",
            severity: maDeviation > 300 ? "critical" : "warning",
            expected_value: Math.round(avgDaily),
            actual_value: last24hEvents,
            deviation_percent: Math.round(maDeviation),
            message: `Moving avg: ${last24hEvents} eventos hoje vs média diária de ${Math.round(avgDaily)} (+${Math.round(maDeviation)}%)`,
          });
        }

        if (maDeviation < -70) {
          alerts.push({
            workspace_id: wsId,
            metric_name: "ma_event_drop",
            severity: maDeviation < -90 ? "critical" : "warning",
            expected_value: Math.round(avgDaily),
            actual_value: last24hEvents,
            deviation_percent: Math.round(maDeviation),
            message: `Moving avg: apenas ${last24hEvents} eventos hoje vs média diária de ${Math.round(avgDaily)} (${Math.round(maDeviation)}%)`,
          });
        }
      }

      // === CONVERSION DROP DETECTION ===
      const recentConvCount = (recentConversions || []).length;
      const olderConvCount = (olderConversions || []).length;
      const recentRevenue = (recentConversions || []).reduce((a, c) => a + Number(c.value || 0), 0);
      const olderRevenue = (olderConversions || []).reduce((a, c) => a + Number(c.value || 0), 0);

      if (olderConvCount > 3) {
        const convChange = ((recentConvCount - olderConvCount) / olderConvCount) * 100;
        if (convChange < -40) {
          alerts.push({
            workspace_id: wsId,
            metric_name: "conversion_drop",
            severity: convChange < -70 ? "critical" : "warning",
            expected_value: olderConvCount,
            actual_value: recentConvCount,
            deviation_percent: Math.round(convChange),
            message: `Conversões caíram ${Math.abs(Math.round(convChange))}%: ${recentConvCount} vs ${olderConvCount} (semana anterior)`,
          });
        }
      }

      // === REVENUE ANOMALY ===
      if (olderRevenue > 10) {
        const revChange = ((recentRevenue - olderRevenue) / olderRevenue) * 100;
        if (revChange < -30) {
          alerts.push({
            workspace_id: wsId,
            metric_name: "revenue_drop",
            severity: revChange < -60 ? "critical" : "warning",
            expected_value: Math.round(olderRevenue),
            actual_value: Math.round(recentRevenue),
            deviation_percent: Math.round(revChange),
            message: `Receita caiu ${Math.abs(Math.round(revChange))}%: R$${recentRevenue.toFixed(0)} vs R$${olderRevenue.toFixed(0)} (semana anterior)`,
          });
        }
        if (revChange > 100) {
          alerts.push({
            workspace_id: wsId,
            metric_name: "revenue_spike",
            severity: "info",
            expected_value: Math.round(olderRevenue),
            actual_value: Math.round(recentRevenue),
            deviation_percent: Math.round(revChange),
            message: `Receita subiu ${Math.round(revChange)}%: R$${recentRevenue.toFixed(0)} vs R$${olderRevenue.toFixed(0)} (semana anterior)`,
          });
        }
      }

      // === QUEUE HEALTH ===
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

    // Insert alerts with dedup
    let inserted = 0;
    for (const alert of alerts) {
      const { count: existing } = await supabase
        .from("anomaly_alerts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", alert.workspace_id)
        .eq("metric_name", alert.metric_name)
        .gte("detected_at", oneHourAgo.toISOString());

      if (!existing || existing === 0) {
        await supabase.from("anomaly_alerts").insert(alert);
        inserted++;
      }
    }

    return new Response(JSON.stringify({
      status: "ok",
      workspaces_checked: workspaceIds.length,
      alerts_generated: alerts.length,
      alerts_inserted: inserted,
      detection_methods: ["z-score", "moving_average", "conversion_drop", "revenue_anomaly", "queue_health"],
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Anomaly detection error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
