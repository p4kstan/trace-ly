/**
 * Daily AI Optimizer
 *
 * Aggregates the last 7 days of REAL data from `conversions`, `attribution_hybrid`,
 * `events`, `attribution_touches` and `automation_actions`, then asks Lovable AI
 * Gateway to surface concrete optimization opportunities (budget shifts, paused
 * underperformers, scaling winners). Recommendations are persisted to
 * `ai_insights` and `optimization_recommendations` for human review — this
 * function NEVER calls google-ads-mutate or changes any campaign.
 *
 * Auth model:
 *   - verify_jwt = false (so pg_cron / scheduler can hit it)
 *   - protected by the `X-Cron-Secret` header (CRON_SECRET env var) OR
 *     a service-role bearer token + `x-internal-source: cron|scheduler|ui`.
 *
 * Body: { workspace_id?: string }   // if omitted, runs for every active workspace
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-source",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVICE_BEARER = `Bearer ${SERVICE_KEY}`;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

// ─── auth: cron-secret OR (service-role + x-internal-source) ──────────
function authorize(req: Request): { ok: true } | { ok: false; reason: string } {
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (CRON_SECRET && cronHeader && cronHeader === CRON_SECRET) return { ok: true };

  const auth = req.headers.get("authorization") || "";
  const internal = (req.headers.get("x-internal-source") || "").toLowerCase();
  if (auth === SERVICE_BEARER && ["cron", "scheduler", "ui", "manual"].includes(internal)) {
    return { ok: true };
  }
  return { ok: false, reason: "missing CRON_SECRET or service-role+x-internal-source" };
}

// ─── core ────────────────────────────────────────────────────────────
interface ChannelStat {
  channel: string;
  conversions: number;
  revenue: number;
  hybrid_value: number;
  touches: number;
  conv_rate: number;
}

async function aggregateForWorkspace(supabase: any, workspaceId: string) {
  const sinceISO = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [{ data: conversions }, { data: hybrid }, { data: touches }, { data: recentActions }] =
    await Promise.all([
      supabase.from("conversions")
        .select("attributed_source, attributed_campaign, value, happened_at")
        .eq("workspace_id", workspaceId).gte("happened_at", sinceISO).limit(2000),
      supabase.from("attribution_hybrid")
        .select("source, medium, campaign, hybrid_credit, hybrid_value, conversion_value")
        .eq("workspace_id", workspaceId).limit(500),
      supabase.from("attribution_touches")
        .select("source, medium, campaign, touch_time")
        .eq("workspace_id", workspaceId).gte("touch_time", sinceISO).limit(5000),
      supabase.from("automation_actions")
        .select("action, status, target_type, created_at")
        .eq("workspace_id", workspaceId).gte("created_at", sinceISO).limit(200),
    ]);

  // build channel stats from conversions + touches
  const stats = new Map<string, ChannelStat>();
  for (const c of (conversions || [])) {
    const ch = (c as any).attributed_source || "Direct";
    const s = stats.get(ch) || { channel: ch, conversions: 0, revenue: 0, hybrid_value: 0, touches: 0, conv_rate: 0 };
    s.conversions += 1;
    s.revenue += Number((c as any).value || 0);
    stats.set(ch, s);
  }
  for (const t of (touches || [])) {
    const ch = (t as any).source || "Direct";
    const s = stats.get(ch) || { channel: ch, conversions: 0, revenue: 0, hybrid_value: 0, touches: 0, conv_rate: 0 };
    s.touches += 1;
    stats.set(ch, s);
  }
  for (const h of (hybrid || [])) {
    const ch = (h as any).source || "Direct";
    const s = stats.get(ch);
    if (s) s.hybrid_value += Number((h as any).hybrid_value || 0);
  }
  for (const s of stats.values()) {
    s.conv_rate = s.touches > 0 ? s.conversions / s.touches : 0;
  }

  return {
    window_days: 7,
    channels: [...stats.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    totals: {
      conversions: (conversions || []).length,
      revenue: (conversions || []).reduce((a, c) => a + Number((c as any).value || 0), 0),
      touches: (touches || []).length,
    },
    recent_automation: (recentActions || []).slice(0, 50),
  };
}

async function callLovableAi(prompt: string): Promise<unknown> {
  if (!LOVABLE_API_KEY) return { _skipped: "no LOVABLE_API_KEY" };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a paid-media optimization analyst. You only suggest changes that " +
            "are supported by the aggregated data provided. You NEVER apply changes — " +
            "every recommendation will be queued for human review. Respond as JSON " +
            "with shape { recommendations: Array<{ channel: string, action: " +
            "'increase_budget'|'decrease_budget'|'pause_channel'|'investigate'|'maintain', " +
            "priority: 'high'|'medium'|'low', reason: string, estimated_impact_brl: number }> }",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (r.status === 429) return { _error: "rate_limited" };
  if (r.status === 402) return { _error: "credits_exhausted" };
  if (!r.ok) return { _error: `gateway ${r.status}`, detail: await r.text().catch(() => "") };
  const j = await r.json();
  try {
    return JSON.parse(j.choices?.[0]?.message?.content || "{}");
  } catch {
    return { _error: "non_json_ai_response", raw: j.choices?.[0]?.message?.content };
  }
}

async function processWorkspace(supabase: ReturnType<typeof createClient>, workspaceId: string) {
  const agg = await aggregateForWorkspace(supabase, workspaceId);
  if (agg.totals.conversions === 0 && agg.totals.touches === 0) {
    return { workspace_id: workspaceId, skipped: "no_data" };
  }

  const aiPrompt =
    `Workspace 7-day aggregate (real data, no estimates):\n` +
    JSON.stringify(agg, null, 2) +
    `\n\nReturn 1–6 high-confidence recommendations. Cite the channel revenue / ` +
    `conv_rate / hybrid_value that supports each one. If data is too sparse for ` +
    `confident calls, output { recommendations: [] }.`;

  const aiResult = (await callLovableAi(aiPrompt)) as Record<string, any>;
  if (aiResult?._error) {
    return { workspace_id: workspaceId, ai_error: aiResult._error };
  }
  const recs = Array.isArray(aiResult?.recommendations) ? aiResult.recommendations : [];

  // ── Persist to optimization_recommendations (status: pending) ──
  const recRows = recs
    .filter((r: any) => typeof r?.channel === "string" && typeof r?.action === "string")
    .slice(0, 25)  // hard cap
    .map((r: any) => ({
      workspace_id: workspaceId,
      channel: String(r.channel).slice(0, 100),
      action: String(r.action).slice(0, 50),
      reason: String(r.reason || "").slice(0, 1000),
      priority: ["high", "medium", "low"].includes(r.priority) ? r.priority : "medium",
      estimated_impact: Number(r.estimated_impact_brl) || 0,
      current_value: 0,
      status: "pending",
    }));

  if (recRows.length) {
    // replace prior pending recommendations from the same automated source
    await supabase.from("optimization_recommendations")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("status", "pending");
    await supabase.from("optimization_recommendations").insert(recRows);
  }

  // ── Mirror as ai_insights so the UI can surface them ──
  const insightRows = recRows.map((r) => ({
    workspace_id: workspaceId,
    type: "optimization",
    severity: r.priority === "high" ? "warning" : "info",
    title: `[${r.channel}] ${r.action}`,
    description: r.reason,
    channel: r.channel,
    action: r.action,
    metric: null,
    value_change: null,
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
  }));
  if (insightRows.length) {
    await supabase.from("ai_insights").insert(insightRows);
  }

  // ── Audit log ──
  await supabase.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor_user_id: null,
    action: "daily_ai_optimizer.run",
    entity_type: "workspace",
    entity_id: workspaceId,
    metadata_json: {
      aggregate: agg.totals,
      channels_seen: agg.channels.length,
      recommendations_persisted: recRows.length,
    },
  });

  return {
    workspace_id: workspaceId,
    channels: agg.channels.length,
    recommendations: recRows.length,
    totals: agg.totals,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authResult = authorize(req);
  if (!authResult.ok) return json({ error: "Unauthorized", reason: authResult.reason }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const targetWorkspace: string | undefined = body.workspace_id;

    let workspaceIds: string[] = [];
    if (targetWorkspace) {
      workspaceIds = [targetWorkspace];
    } else {
      const { data } = await supabase
        .from("workspaces")
        .select("id, status")
        .eq("status", "active")
        .limit(500);
      workspaceIds = (data || []).map((w: any) => w.id);
    }

    const results: unknown[] = [];
    for (const wid of workspaceIds) {
      try {
        results.push(await processWorkspace(supabase, wid));
      } catch (e) {
        results.push({ workspace_id: wid, error: String(e instanceof Error ? e.message : e) });
      }
    }

    return json({
      ok: true,
      processed: results.length,
      mode: targetWorkspace ? "single" : "all_active",
      results,
    });
  } catch (e) {
    console.error("daily-ai-optimizer error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
