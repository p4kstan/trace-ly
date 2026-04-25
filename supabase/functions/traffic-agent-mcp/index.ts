/**
 * Traffic Agent MCP-like tool router.
 *
 * Endpoints (JSON HTTP, single function):
 *   POST { method: "tools/list" }
 *   POST { method: "tools/call", params: { name, arguments } }
 *
 * - Validates auth via JWT and workspace membership when arguments include workspace_id.
 * - Persists every call to traffic_agent_mcp_tool_calls with REDACTED arguments.
 * - apply_campaign_action / rollback_campaign_action: dry-run by default.
 *   Live mutation is HARD-BLOCKED in this delivery (no external HTTP to Google/Meta/TikTok).
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { requireMcpAuth, hasScope } from "../_shared/mcpAuth.ts";
import { redactValue } from "../_shared/traffic-agent-redact.ts";
import { evaluateGuardrails, type Guardrails } from "../_shared/traffic-agent-guardrails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface ToolDef {
  name: string;
  description: string;
  workspace_required: boolean;
}

const TOOLS: ToolDef[] = [
  { name: "get_workspace_metrics", description: "Aggregated metrics for last N days (events, conversions, dispatch).", workspace_required: true },
  { name: "get_campaign_performance", description: "Campaign performance snapshots over a window.", workspace_required: true },
  { name: "get_conversion_health", description: "Conversion-health signals (dedup, failures, dead-letter).", workspace_required: true },
  { name: "get_tracking_quality", description: "Identifier coverage and purchase-without-dispatch rate.", workspace_required: true },
  { name: "search_traffic_knowledge", description: "RAG search across workspace knowledge base.", workspace_required: true },
  { name: "create_optimization_plan", description: "Persist a list of recommendations as a plan.", workspace_required: true },
  { name: "simulate_campaign_action", description: "Simulate applying a recommendation (never mutates).", workspace_required: true },
  { name: "apply_campaign_action", description: "Apply an action. Stays in dry-run unless guardrails allow.", workspace_required: true },
  { name: "rollback_campaign_action", description: "Rollback an executed action. Interface/dry-run unless confirmed.", workspace_required: true },
  { name: "log_agent_decision", description: "Append a PII-redacted decision/log entry.", workspace_required: true },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const method = body?.method;

  // Auth: derive workspace_id from arguments when present (JWT path needs it).
  const argsWorkspaceId: string | undefined =
    body?.params?.arguments?.workspace_id ?? undefined;

  const authResult = await requireMcpAuth(req, { workspaceId: argsWorkspaceId });
  if ("error" in authResult) return authResult.error;
  const ctx = authResult.ctx;

  if (method === "tools/list") {
    return json({ tools: TOOLS, auth_method: ctx.authMethod });
  }
  if (method !== "tools/call") return json({ error: "unknown_method" }, 400);

  const name: string = body?.params?.name;
  const args = body?.params?.arguments ?? {};
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return json({ error: "unknown_tool", name }, 404);

  // For MCP tokens, force workspace_id to the token's workspace.
  if (ctx.authMethod === "mcp_token") {
    args.workspace_id = ctx.workspaceId;
  }
  const workspaceId: string | undefined = args.workspace_id;
  if (tool.workspace_required && !workspaceId) {
    return json({ error: "missing_workspace_id" }, 400);
  }

  // Scope checks for MCP tokens.
  if (ctx.authMethod === "mcp_token") {
    const scopeMap: Record<string, string> = {
      get_workspace_metrics: "traffic-agent:read",
      get_campaign_performance: "traffic-agent:read",
      get_conversion_health: "traffic-agent:read",
      get_tracking_quality: "traffic-agent:read",
      search_traffic_knowledge: "rag:read",
      create_optimization_plan: "traffic-agent:evaluate",
      simulate_campaign_action: "traffic-agent:simulate",
      apply_campaign_action: "traffic-agent:dry_run",
      rollback_campaign_action: "traffic-agent:dry_run",
      log_agent_decision: "traffic-agent:read",
    };
    const need = scopeMap[name];
    if (need && !hasScope(ctx, need)) {
      return json({ error: "missing_scope", required: need }, 403);
    }
  }

  const t0 = Date.now();
  let status = "ok";
  let result: any = {};
  try {
    result = await dispatchTool(ctx.service, name, args, ctx.user.id ?? "mcp_token");
  } catch (e: any) {
    status = "error";
    result = { error: String(e?.message ?? e) };
  }
  const duration = Date.now() - t0;

  // Persist tool call with REDACTED args + summarized result.
  await ctx.service.from("traffic_agent_mcp_tool_calls").insert({
    workspace_id: workspaceId ?? null,
    run_id: args.run_id ?? null,
    tool_name: name,
    arguments_redacted: redactValue(args) as any,
    result_summary: redactValue(summarize(result)) as any,
    status,
    duration_ms: duration,
  });

  return json({ ok: status === "ok", result, auth_method: ctx.authMethod });
});

function summarize(r: unknown): unknown {
  if (r == null) return r;
  if (typeof r !== "object") return r;
  const s = JSON.stringify(r);
  if (s.length <= 4000) return r;
  return { __truncated__: true, preview: s.slice(0, 2000) };
}

async function dispatchTool(svc: SupabaseClient, name: string, args: any, userId: string): Promise<any> {
  switch (name) {
    case "get_workspace_metrics":     return await getWorkspaceMetrics(svc, args);
    case "get_campaign_performance":  return await getCampaignPerformance(svc, args);
    case "get_conversion_health":     return await getConversionHealth(svc, args);
    case "get_tracking_quality":      return await getTrackingQuality(svc, args);
    case "search_traffic_knowledge":  return await searchKnowledge(svc, args);
    case "create_optimization_plan":  return await createPlan(svc, args, userId);
    case "simulate_campaign_action":  return await simulateAction(svc, args);
    case "apply_campaign_action":     return await applyAction(svc, args, userId);
    case "rollback_campaign_action":  return await rollbackAction(svc, args, userId);
    case "log_agent_decision":        return await logDecision(svc, args);
    default: throw new Error("unknown_tool");
  }
}

// ---- Tool handlers --------------------------------------------------------

async function getWorkspaceMetrics(svc: SupabaseClient, args: any) {
  const days = clamp(args.window_days ?? 7, 1, 90);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const wid = args.workspace_id;

  const [{ count: events }, { count: convs }, { count: queueFailed }, { count: dead }] = await Promise.all([
    svc.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", wid).gte("event_time", since),
    svc.from("conversions").select("id", { count: "exact", head: true }).eq("workspace_id", wid).gte("happened_at", since),
    svc.from("event_queue").select("id", { count: "exact", head: true }).eq("workspace_id", wid).eq("status", "failed").gte("created_at", since),
    svc.from("dead_letter_events").select("id", { count: "exact", head: true }).eq("workspace_id", wid).gte("created_at", since),
  ]);

  return {
    window_days: days,
    events_count: events ?? 0,
    conversions_count: convs ?? 0,
    queue_failed: queueFailed ?? 0,
    dead_letter: dead ?? 0,
  };
}

async function getCampaignPerformance(svc: SupabaseClient, args: any) {
  const days = clamp(args.window_days ?? 14, 1, 90);
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  let q = svc.from("campaign_metrics_snapshots")
    .select("provider, account_id, campaign_id, date_start, date_end, impressions, clicks, spend_cents, conversions, revenue_cents, cpa_cents, roas, ctr, cvr")
    .eq("workspace_id", args.workspace_id)
    .gte("date_end", since)
    .order("date_end", { ascending: false })
    .limit(200);
  if (args.provider) q = q.eq("provider", args.provider);
  if (args.account_id) q = q.eq("account_id", args.account_id);
  if (args.campaign_id) q = q.eq("campaign_id", args.campaign_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { window_days: days, rows: data ?? [] };
}

async function getConversionHealth(svc: SupabaseClient, args: any) {
  const days = clamp(args.window_days ?? 7, 1, 30);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const wid = args.workspace_id;
  const [{ count: dups }, { count: failed }, { count: dead }] = await Promise.all([
    svc.from("duplicate_detections").select("id", { count: "exact", head: true }).eq("workspace_id", wid).gte("first_seen_at", since),
    svc.from("event_deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", wid).eq("status", "failed").gte("created_at", since),
    svc.from("dead_letter_events").select("id", { count: "exact", head: true }).eq("workspace_id", wid).gte("created_at", since),
  ]);
  return { window_days: days, duplicates: dups ?? 0, deliveries_failed: failed ?? 0, dead_letter: dead ?? 0 };
}

async function getTrackingQuality(svc: SupabaseClient, args: any) {
  const days = clamp(args.window_days ?? 7, 1, 30);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const wid = args.workspace_id;

  const { data: orders } = await svc
    .from("orders")
    .select("gclid, gbraid, wbraid, fbclid, ttclid, msclkid, status, created_at")
    .eq("workspace_id", wid)
    .gte("created_at", since)
    .limit(2000);

  const list = orders ?? [];
  const total = list.length;
  const has = (k: keyof typeof list[0]) => list.filter((o: any) => o[k] && String(o[k]).length > 0).length;

  const coverage = total > 0 ? {
    gclid: has("gclid") / total,
    gbraid: has("gbraid") / total,
    wbraid: has("wbraid") / total,
    fbp: 0, fbc: has("fbclid") / total,
    ttclid: has("ttclid") / total,
    msclkid: has("msclkid") / total,
  } : { gclid: 0, gbraid: 0, wbraid: 0, fbp: 0, fbc: 0, ttclid: 0, msclkid: 0 };

  const purchases = list.filter((o: any) => ["paid", "approved"].includes(String(o.status ?? "").toLowerCase())).length;
  const { count: dispatched } = await svc.from("event_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", wid).eq("status", "success").gte("created_at", since);

  const purchase_without_dispatch = Math.max(0, purchases - (dispatched ?? 0));

  return {
    window_days: days, sample_orders: total, total_purchases: purchases,
    purchase_without_dispatch, identifier_coverage: coverage,
  };
}

async function searchKnowledge(svc: SupabaseClient, args: any) {
  const q = String(args.query ?? "").trim().slice(0, 500);
  if (q.length < 2) return { results: [] };
  const limit = clamp(args.limit ?? 5, 1, 20);

  // tsvector full-text search; fallback to ILIKE for edge cases.
  const { data: vec, error } = await svc
    .from("traffic_agent_knowledge_chunks")
    .select("id, document_id, chunk_index, content, metadata")
    .eq("workspace_id", args.workspace_id)
    .textSearch("search_vector", q.split(/\s+/).join(" & "), { type: "websearch" })
    .limit(limit);

  let rows = vec ?? [];
  if (error || rows.length === 0) {
    const { data: fall } = await svc
      .from("traffic_agent_knowledge_chunks")
      .select("id, document_id, chunk_index, content, metadata")
      .eq("workspace_id", args.workspace_id)
      .ilike("content", `%${q}%`)
      .limit(limit);
    rows = fall ?? [];
  }
  return {
    results: rows.map((r: any) => ({
      chunk_id: r.id, document_id: r.document_id, chunk_index: r.chunk_index,
      snippet: String(r.content ?? "").slice(0, 280), metadata: r.metadata ?? {},
    })),
  };
}

async function createPlan(svc: SupabaseClient, args: any, userId: string) {
  const recs = (args.recommendations ?? []) as any[];
  if (!Array.isArray(recs) || recs.length === 0) throw new Error("no_recommendations");
  const rows = recs.slice(0, 50).map((r) => ({
    workspace_id: args.workspace_id,
    run_id: args.run_id ?? null,
    provider: r.provider, account_id: r.account_id ?? null, campaign_id: r.campaign_id ?? null,
    entity_type: r.entity_type, entity_id: r.entity_id ?? null,
    action_type: r.action_type, priority: r.priority ?? 3,
    confidence: r.confidence ?? 0.5, expected_impact: r.expected_impact ?? {},
    rationale: r.rationale ?? "", evidence_json: r.evidence_json ?? {},
    rag_refs: r.rag_refs ?? [], status: "pending",
  }));
  const { data, error } = await svc.from("traffic_agent_recommendations").insert(rows).select("id");
  if (error) throw new Error(error.message);
  return { inserted: data?.length ?? 0, ids: data?.map((d: any) => d.id) ?? [] };
}

async function simulateAction(svc: SupabaseClient, args: any) {
  const { data: rec, error } = await svc.from("traffic_agent_recommendations")
    .select("*").eq("id", args.recommendation_id).eq("workspace_id", args.workspace_id).single();
  if (error || !rec) throw new Error("recommendation_not_found");

  const g = await loadGuardrails(svc, args.workspace_id);
  const proposed = buildProposed(rec, args.override_payload);
  const decision = evaluateGuardrails(g, proposed);

  return { recommendation: rec, proposed, guardrail_decision: decision };
}

async function applyAction(svc: SupabaseClient, args: any, userId: string) {
  const { data: rec, error } = await svc.from("traffic_agent_recommendations")
    .select("*").eq("id", args.action_id).eq("workspace_id", args.workspace_id).single();
  // action_id here may be a recommendation id (delivery 1); we accept both
  let recommendation = rec;
  if (error || !rec) {
    const { data: act } = await svc.from("traffic_agent_actions")
      .select("*, traffic_agent_recommendations!inner(*)")
      .eq("id", args.action_id).eq("workspace_id", args.workspace_id).maybeSingle();
    if (!act) throw new Error("not_found");
    recommendation = act.traffic_agent_recommendations;
  }

  const g = await loadGuardrails(svc, args.workspace_id);
  const proposed = buildProposed(recommendation, null);
  const decision = evaluateGuardrails(g, proposed);

  // HARD BLOCK external mutation in this delivery.
  const confirmLive = args.confirm_live === true;
  const wouldMutate = decision.may_mutate_externally && confirmLive;
  // Even if would mutate, this delivery does NOT call provider APIs.
  const execStatus = wouldMutate ? "blocked_no_adapter" : "dry_run";

  const { data: action, error: insErr } = await svc.from("traffic_agent_actions").insert({
    recommendation_id: recommendation.id,
    workspace_id: args.workspace_id,
    mode: g.mode, action_type: recommendation.action_type, provider: recommendation.provider,
    account_id: recommendation.account_id, campaign_id: recommendation.campaign_id,
    entity_id: recommendation.entity_id,
    proposed_payload: proposed as any,
    simulated_result: { dry_run: true, would_mutate: wouldMutate } as any,
    approval_status: g.human_approval_required ? "pending_approval" : "auto",
    execution_status: execStatus,
    rollback_payload: { entity_id: recommendation.entity_id, provider: recommendation.provider } as any,
    guardrail_decision: decision as any,
  }).select().single();
  if (insErr) throw new Error(insErr.message);

  await svc.from("traffic_agent_action_logs").insert({
    action_id: action.id, workspace_id: args.workspace_id,
    level: wouldMutate ? "warn" : "info",
    message: wouldMutate
      ? "Live mutation gated: no external adapter wired in this delivery"
      : "Recorded as dry_run; no external call was made",
    metadata: { decision_codes: decision.reasons.map((r: any) => r.code) },
  });

  return { action, guardrail_decision: decision, mutated_externally: false };
}

async function rollbackAction(svc: SupabaseClient, args: any, userId: string) {
  const { data: act, error } = await svc.from("traffic_agent_actions")
    .select("*").eq("id", args.action_id).eq("workspace_id", args.workspace_id).single();
  if (error || !act) throw new Error("action_not_found");

  await svc.from("traffic_agent_actions").update({
    execution_status: "rolled_back_dry_run",
  }).eq("id", act.id);

  await svc.from("traffic_agent_action_logs").insert({
    action_id: act.id, workspace_id: args.workspace_id, level: "info",
    message: "Rollback recorded as dry_run; no external call was made",
    metadata: { confirm_live: !!args.confirm_live },
  });
  return { action_id: act.id, mutated_externally: false };
}

async function logDecision(svc: SupabaseClient, args: any) {
  await svc.from("traffic_agent_action_logs").insert({
    action_id: null,
    workspace_id: args.workspace_id,
    level: args.level ?? "info",
    message: String(args.message ?? "").slice(0, 2000),
    metadata: redactValue(args.metadata ?? {}) as any,
  });
  return { logged: true };
}

// ---- helpers --------------------------------------------------------------

function clamp(n: any, lo: number, hi: number): number {
  const x = Number(n); if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

async function loadGuardrails(svc: SupabaseClient, workspaceId: string): Promise<Guardrails> {
  const { data, error } = await svc.rpc("get_or_create_traffic_agent_guardrails", { _workspace_id: workspaceId });
  if (error || !data) throw new Error("guardrails_load_failed");
  return data as Guardrails;
}

function buildProposed(rec: any, override: any): any {
  const ei = rec.expected_impact ?? {};
  const base: any = {
    action_type: rec.action_type,
    provider: rec.provider,
    campaign_id: rec.campaign_id,
    observed_conversions: (rec.evidence_json?.conversions ?? 0),
    observed_spend_cents: (rec.evidence_json?.spend_cents ?? 0),
  };
  if (typeof ei.suggested_budget_change_pct === "number") base.budget_change_percent = ei.suggested_budget_change_pct;
  if (typeof ei.suggested_bid_change_pct === "number") base.bid_change_percent = ei.suggested_bid_change_pct;
  return { ...base, ...(override ?? {}) };
}
