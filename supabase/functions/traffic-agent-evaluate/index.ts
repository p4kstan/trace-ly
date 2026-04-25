/**
 * Evaluate workspace signals and produce recommendations (no external mutation).
 * Body: { workspace_id, window_days?, mode? }
 *
 * - Reuses pure recommend() engine.
 * - Saves run + recommendations.
 * - No PII in logs/prompts.
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { requireUserJwt } from "../_shared/edge-auth.ts";
import { buildRecommendations, type CampaignSignal } from "../_shared/traffic-agent-recommend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Allow CRON_SECRET path-through OR JWT.
  const cronSecret = req.headers.get("x-cron-secret");
  let userId: string | null = null;
  let svc: SupabaseClient;
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
    const url = Deno.env.get("SUPABASE_URL")!;
    const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    svc = createClient(url, sk);
  } else {
    const a = await requireUserJwt(req);
    if ("error" in a) return a.error;
    svc = a.ctx.service;
    userId = a.ctx.user.id;
    const wid = body?.workspace_id;
    if (!wid) return json({ error: "missing_workspace_id" }, 400);
    const { data: ok } = await svc.rpc("is_workspace_member", { _user_id: userId, _workspace_id: wid });
    if (ok !== true) return json({ error: "workspace_forbidden" }, 403);
  }

  const wid = body?.workspace_id;
  if (!wid) return json({ error: "missing_workspace_id" }, 400);
  const days = Math.max(1, Math.min(Number(body?.window_days ?? 7), 30));
  const mode = String(body?.mode ?? "recommendation");
  const since = new Date(Date.now() - days * 86400_000);

  const { data: g } = await svc.rpc("get_or_create_traffic_agent_guardrails", { _workspace_id: wid });
  const guardrails = g as any;

  // Create run
  const { data: run, error: runErr } = await svc.from("traffic_agent_runs").insert({
    workspace_id: wid, status: "running", mode, started_at: new Date().toISOString(),
    input_window: { days, since: since.toISOString() }, created_by: userId,
  }).select().single();
  if (runErr) return json({ error: "run_insert_failed", detail: runErr.message }, 500);

  try {
    // Tracking signals
    const { data: orders } = await svc.from("orders")
      .select("gclid, gbraid, wbraid, fbclid, ttclid, msclkid, status, created_at")
      .eq("workspace_id", wid).gte("created_at", since.toISOString()).limit(2000);
    const list = orders ?? [];
    const total = list.length;
    const has = (k: string) => list.filter((o: any) => o[k] && String(o[k]).length > 0).length;
    const coverage = total > 0 ? {
      gclid: has("gclid") / total, gbraid: has("gbraid") / total, wbraid: has("wbraid") / total,
      fbp: 0, fbc: has("fbclid") / total, ttclid: has("ttclid") / total, msclkid: has("msclkid") / total,
    } : { gclid: 0, gbraid: 0, wbraid: 0, fbp: 0, fbc: 0, ttclid: 0, msclkid: 0 };
    const purchases = list.filter((o: any) => ["paid","approved"].includes(String(o.status ?? "").toLowerCase())).length;
    const { count: dispatched } = await svc.from("event_deliveries")
      .select("id", { count: "exact", head: true }).eq("workspace_id", wid).eq("status","success").gte("created_at", since.toISOString());

    // Queue
    const [{ count: pending }, { count: failed }, { count: dead }] = await Promise.all([
      svc.from("event_queue").select("id", { count: "exact", head: true }).eq("workspace_id", wid).eq("status","pending"),
      svc.from("event_queue").select("id", { count: "exact", head: true }).eq("workspace_id", wid).eq("status","failed"),
      svc.from("dead_letter_events").select("id", { count: "exact", head: true }).eq("workspace_id", wid).gte("created_at", since.toISOString()),
    ]);
    const { data: oldestRow } = await svc.from("event_queue")
      .select("created_at").eq("workspace_id", wid).eq("status","pending").order("created_at", { ascending: true }).limit(1);
    const oldestMin = oldestRow?.[0]?.created_at
      ? Math.floor((Date.now() - new Date(oldestRow[0].created_at).getTime()) / 60000) : 0;

    // Destinations
    const { data: dests } = await svc.from("ad_conversion_destinations")
      .select("status, send_enabled, last_error_at").eq("workspace_id", wid);
    const destList = dests ?? [];
    const dest = {
      total: destList.length,
      with_recent_error: destList.filter((d: any) => d.last_error_at && new Date(d.last_error_at) >= since).length,
      disabled: destList.filter((d: any) => d.send_enabled === false).length,
    };

    // Campaigns
    const { data: snaps } = await svc.from("campaign_metrics_snapshots")
      .select("provider, account_id, campaign_id, spend_cents, conversions, cpa_cents, roas, cvr")
      .eq("workspace_id", wid).gte("date_end", since.toISOString().slice(0,10)).limit(200);
    const campaigns: CampaignSignal[] = (snaps ?? []).map((s: any) => ({
      provider: s.provider, account_id: s.account_id, campaign_id: s.campaign_id,
      spend_cents: s.spend_cents ?? 0, conversions: s.conversions ?? 0,
      cpa_cents: s.cpa_cents ?? null, roas: s.roas ?? null, cvr: s.cvr ?? null,
    }));

    const recs = buildRecommendations({
      window_days: days,
      tracking: { total_purchases: purchases, purchase_without_dispatch: Math.max(0, purchases - (dispatched ?? 0)), identifier_coverage: coverage },
      queue: { pending: pending ?? 0, failed: failed ?? 0, dead_letter: dead ?? 0, oldest_pending_minutes: oldestMin },
      destinations: dest,
      campaigns,
      guardrails: { min_conversions: guardrails.min_conversions, min_spend_cents: guardrails.min_spend_cents },
    });

    if (recs.length > 0) {
      const rows = recs.map((r) => ({
        workspace_id: wid, run_id: run.id,
        provider: r.provider, account_id: r.account_id ?? null, campaign_id: r.campaign_id ?? null,
        entity_type: r.entity_type, entity_id: r.entity_id ?? null,
        action_type: r.action_type, priority: r.priority, confidence: r.confidence,
        expected_impact: r.expected_impact, rationale: r.rationale, evidence_json: r.evidence_json,
        rag_refs: [], status: "pending",
      }));
      await svc.from("traffic_agent_recommendations").insert(rows);
    }

    await svc.from("traffic_agent_runs").update({
      status: "completed", finished_at: new Date().toISOString(),
      summary: { recommendation_count: recs.length, sample_orders: total, purchases, dispatched: dispatched ?? 0 },
    }).eq("id", run.id);

    return json({ ok: true, run_id: run.id, recommendations: recs.length });
  } catch (e: any) {
    await svc.from("traffic_agent_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: String(e?.message ?? e).slice(0, 1000),
    }).eq("id", run.id);
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});
