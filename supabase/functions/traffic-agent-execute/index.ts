/**
 * Execute a recommendation = persist a traffic_agent_actions row.
 *
 * SAFETY: This delivery never calls external provider APIs. Even if guardrails
 * + allow_live_mutations + confirm_live=true would allow it, execution_status
 * is set to "blocked_no_adapter" because no Google/Meta/TikTok mutation
 * adapter is wired up here.
 *
 * Body: { workspace_id, recommendation_id, confirm_live? }
 */
import { requireUserJwt } from "../_shared/edge-auth.ts";
import { evaluateGuardrails, type Guardrails } from "../_shared/traffic-agent-guardrails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function buildProposed(rec: any): any {
  const ei = rec.expected_impact ?? {};
  const base: any = {
    action_type: rec.action_type, provider: rec.provider, campaign_id: rec.campaign_id,
    observed_conversions: rec.evidence_json?.conversions ?? 0,
    observed_spend_cents: rec.evidence_json?.spend_cents ?? 0,
  };
  if (typeof ei.suggested_budget_change_pct === "number") base.budget_change_percent = ei.suggested_budget_change_pct;
  if (typeof ei.suggested_bid_change_pct === "number") base.bid_change_percent = ei.suggested_bid_change_pct;
  return base;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const a = await requireUserJwt(req);
  if ("error" in a) return a.error;
  const ctx = a.ctx;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const wid = body?.workspace_id; const recId = body?.recommendation_id;
  if (!wid || !recId) return json({ error: "missing_fields" }, 400);

  const { data: ok } = await ctx.service.rpc("is_workspace_member", {
    _user_id: ctx.user.id, _workspace_id: wid,
  });
  if (ok !== true) return json({ error: "workspace_forbidden" }, 403);

  const { data: rec, error } = await ctx.service.from("traffic_agent_recommendations")
    .select("*").eq("id", recId).eq("workspace_id", wid).single();
  if (error || !rec) return json({ error: "recommendation_not_found" }, 404);

  const { data: g } = await ctx.service.rpc("get_or_create_traffic_agent_guardrails", { _workspace_id: wid });
  const guardrails = g as Guardrails;

  const { data: lastAct } = await ctx.service.from("traffic_agent_actions")
    .select("created_at").eq("workspace_id", wid)
    .eq("provider", rec.provider).eq("entity_id", rec.entity_id ?? "")
    .order("created_at", { ascending: false }).limit(1);
  const { count: actionsToday } = await ctx.service.from("traffic_agent_actions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", wid).gte("created_at", new Date(Date.now() - 86400_000).toISOString());

  const proposed = buildProposed(rec);
  const decision = evaluateGuardrails(guardrails, proposed,
    { last_action_at: lastAct?.[0]?.created_at ?? null, actions_today: actionsToday ?? 0 });

  // Hard-block external mutation regardless of guardrails: no adapter wired.
  const wouldMutate = decision.may_mutate_externally && body?.confirm_live === true;
  const execStatus = wouldMutate ? "blocked_no_adapter" : "dry_run";

  const { data: action, error: insErr } = await ctx.service.from("traffic_agent_actions").insert({
    recommendation_id: rec.id, workspace_id: wid,
    mode: guardrails.mode, action_type: rec.action_type, provider: rec.provider,
    account_id: rec.account_id, campaign_id: rec.campaign_id, entity_id: rec.entity_id,
    proposed_payload: proposed,
    simulated_result: { dry_run: true, would_mutate_if_adapter: wouldMutate },
    approval_status: guardrails.human_approval_required ? "pending_approval" : "auto",
    execution_status: execStatus,
    rollback_payload: { entity_id: rec.entity_id, provider: rec.provider, action_type: rec.action_type },
    guardrail_decision: decision,
    executed_at: new Date().toISOString(),
  }).select().single();
  if (insErr) return json({ error: "insert_action_failed", detail: insErr.message }, 500);

  await ctx.service.from("traffic_agent_action_logs").insert({
    action_id: action.id, workspace_id: wid,
    level: wouldMutate ? "warn" : "info",
    message: wouldMutate
      ? "Live mutation gated: no external adapter wired in this delivery"
      : "Recorded as dry_run; no external call was made",
    metadata: { decision_codes: decision.reasons.map((r: any) => r.code), allowed: decision.allowed },
  });

  // Update recommendation status
  await ctx.service.from("traffic_agent_recommendations")
    .update({ status: "executed_dry_run" }).eq("id", rec.id);

  return json({ ok: true, action, guardrail_decision: decision, mutated_externally: false });
});
