/**
 * Evaluates a single automation rule on demand.
 *
 * Body: { rule_id: string, force_dry_run?: boolean }
 *
 * Execution modes (column automation_rules.execution_mode):
 *   - "disabled"        → never executes, never logs side-effects
 *   - "recommendation"  → ALWAYS dry-run (audit only, never mutates)
 *   - "auto"            → mutates only when guardrails allow
 *   - (legacy "dry_run" / "live" still accepted as aliases)
 *
 * Guardrails (automation_rules.guardrails_json):
 *   - cooldown_hours          (default 4)   — block re-trigger within N hours
 *   - max_items_per_run       (default 25)  — hard cap per evaluation
 *   - min_conversions         (default 0)   — only act on items with ≥ N conv
 *   - min_bid_factor          (default 0.5) — clamp decrease floor (0.5 = -50%)
 *   - max_bid_factor          (default 1.5) — clamp increase ceiling
 *   - allow_pause             (default false) — required for pause_keyword/ad_group
 *   - allow_negative_keyword  (default false) — required for negate_search_term
 *   - bid_min_brl / bid_max_brl / bid_change_max_pct (kept from old contract)
 *
 * Audit: every action is logged in automation_actions with execution_mode,
 * guardrails snapshot, blocked_reason, dry_run flag, before/after.
 *
 * last_triggered_at is only updated when at least one item was actually executed
 * (executed > 0). Recommendation/dry-run runs do NOT touch last_triggered_at.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { installSafeConsole } from "../_shared/install-safe-console.ts";

installSafeConsole("automation-rule-evaluate");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Rule {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  campaign_id: string | null;
  enabled: boolean;
  condition_json: any;
  action_json: any;
  execution_mode?: string | null;
  guardrails_json?: any;
  last_triggered_at?: string | null;
}

type Mode = "disabled" | "recommendation" | "auto";

interface Guardrails {
  mode: Mode;
  cooldown_hours: number;
  max_items_per_run: number;
  min_conversions: number;
  min_bid_factor: number;
  max_bid_factor: number;
  allow_pause: boolean;
  allow_negative_keyword: boolean;
  // Legacy/extra absolute bid clamps
  bid_min_brl: number;
  bid_max_brl: number;
  bid_change_max_pct: number;
}

const DEFAULTS: Omit<Guardrails, "mode"> = {
  cooldown_hours: 4,
  max_items_per_run: 25,
  min_conversions: 0,
  min_bid_factor: 0.5,
  max_bid_factor: 1.5,
  allow_pause: false,
  allow_negative_keyword: false,
  bid_min_brl: 0.10,
  bid_max_brl: 50.0,
  bid_change_max_pct: 0.50,
};
const HARD_MAX_ITEMS = 100;

function resolveMode(rule: Rule): Mode {
  const raw = (rule.execution_mode || "").toLowerCase().trim();
  if (raw === "disabled" || raw === "off") return "disabled";
  if (raw === "auto" || raw === "live") return "auto";
  // Default: anything else (including "recommendation", "dry_run", "", null) is dry-run
  return "recommendation";
}

function resolveGuardrails(rule: Rule): Guardrails {
  const g = (rule.guardrails_json || {}) as Record<string, unknown>;
  const num = (k: string, d: number, max?: number) => {
    const v = Number(g[k]);
    if (!Number.isFinite(v) || v < 0) return d;
    return max != null ? Math.min(v, max) : v;
  };
  const bool = (k: string, d: boolean) => (g[k] === true ? true : g[k] === false ? false : d);
  return {
    mode: resolveMode(rule),
    cooldown_hours: num("cooldown_hours", DEFAULTS.cooldown_hours),
    max_items_per_run: Math.min(num("max_items_per_run", DEFAULTS.max_items_per_run), HARD_MAX_ITEMS),
    min_conversions: num("min_conversions", DEFAULTS.min_conversions),
    min_bid_factor: Math.max(0.05, num("min_bid_factor", DEFAULTS.min_bid_factor)),
    max_bid_factor: Math.min(5.0, Math.max(1.0, num("max_bid_factor", DEFAULTS.max_bid_factor))),
    allow_pause: bool("allow_pause", DEFAULTS.allow_pause),
    allow_negative_keyword: bool("allow_negative_keyword", DEFAULTS.allow_negative_keyword),
    bid_min_brl: num("bid_min_brl", DEFAULTS.bid_min_brl),
    bid_max_brl: num("bid_max_brl", DEFAULTS.bid_max_brl),
    bid_change_max_pct: num("bid_change_max_pct", DEFAULTS.bid_change_max_pct, 1.0),
  };
}

function clampBidMicros(currentMicros: number, factor: number, g: Guardrails) {
  // 1) clamp factor to [min_bid_factor, max_bid_factor] AND to ±bid_change_max_pct
  const factorFloor = Math.max(g.min_bid_factor, 1 - g.bid_change_max_pct);
  const factorCeil = Math.min(g.max_bid_factor, 1 + g.bid_change_max_pct);
  const safeFactor = Math.max(factorFloor, Math.min(factorCeil, factor));
  let next = currentMicros * safeFactor;
  // 2) clamp to absolute min/max
  const minMicros = g.bid_min_brl * 1_000_000;
  const maxMicros = g.bid_max_brl * 1_000_000;
  next = Math.max(minMicros, Math.min(maxMicros, next));
  return { micros: Math.round(next), applied_factor: safeFactor };
}

/** Decide whether an action type is allowed under current guardrails. */
function actionPermission(actionType: string, g: Guardrails): { allowed: boolean; reason?: string } {
  if (actionType === "pause_keyword" || actionType === "pause_ad_group") {
    if (!g.allow_pause) return { allowed: false, reason: "guardrails.allow_pause=false" };
  }
  if (actionType === "negate_search_term") {
    if (!g.allow_negative_keyword) return { allowed: false, reason: "guardrails.allow_negative_keyword=false" };
  }
  return { allowed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const reqBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const rule_id = reqBody.rule_id as string | undefined;
    const forceDryRunReq = reqBody.force_dry_run === true;
    if (!rule_id) return json({ error: "rule_id required" }, 400);

    const { data: rule } = await service
      .from("automation_rules")
      .select("*")
      .eq("id", rule_id)
      .single<Rule>();
    if (!rule) return json({ error: "rule not found" }, 404);

    const guard = resolveGuardrails(rule);

    // ── DISABLED: never executes, never logs ──
    if (guard.mode === "disabled") {
      return json({
        matched: 0, evaluated: 0, executed: 0, skipped: 0, dry_run: 0,
        mode: "disabled", guardrails: guard, items: [],
        message: "Rule is disabled (execution_mode=disabled).",
      });
    }

    if (!rule.customer_id || !rule.campaign_id) {
      return json({ error: "Regra precisa ter customer_id e campaign_id" }, 400);
    }

    // ── COOLDOWN check (applies to auto mode only — recommendation always runs) ──
    if (guard.mode === "auto" && rule.last_triggered_at && guard.cooldown_hours > 0) {
      const lastMs = new Date(rule.last_triggered_at).getTime();
      const sinceHrs = (Date.now() - lastMs) / 3_600_000;
      if (sinceHrs < guard.cooldown_hours) {
        return json({
          matched: 0, evaluated: 0, executed: 0, skipped: 0, dry_run: 0,
          mode: guard.mode, guardrails: guard, items: [],
          blocked_reason: `cooldown: last_triggered ${sinceHrs.toFixed(2)}h ago, requires ${guard.cooldown_hours}h`,
        });
      }
    }

    const cond = rule.condition_json || {};
    const action = rule.action_json || {};
    const days = Number(cond.window_days) || 7;
    const minClicks = Number(cond.min_clicks) || 0;
    const scope = cond.scope as "keyword" | "ad_group" | "search_term";
    const metric = cond.metric as string;
    const op = cond.operator as string;
    const threshold = Number(cond.threshold);

    // Build GAQL based on scope
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const dateClause = `segments.date BETWEEN '${since}' AND '${today}'`;
    const campClause = `campaign.id = ${rule.campaign_id}`;

    let gaql = "";
    if (scope === "keyword") {
      gaql = `
        SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
               metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value,
               metrics.ctr
        FROM keyword_view
        WHERE ${campClause} AND ${dateClause}
          AND ad_group_criterion.status = 'ENABLED'
      `.trim();
    } else if (scope === "ad_group") {
      gaql = `
        SELECT ad_group.id, ad_group.name,
               metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value,
               metrics.ctr
        FROM ad_group
        WHERE ${campClause} AND ${dateClause}
          AND ad_group.status = 'ENABLED'
      `.trim();
    } else if (scope === "search_term") {
      gaql = `
        SELECT search_term_view.search_term, ad_group.id,
               metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM search_term_view
        WHERE ${campClause} AND ${dateClause}
      `.trim();
    } else {
      return json({ error: `unsupported scope: ${scope}` }, 400);
    }

    // Get credentials and call Google Ads search
    const { data: credList } = await service
      .from("google_ads_credentials")
      .select("*")
      .eq("workspace_id", rule.workspace_id)
      .eq("customer_id", rule.customer_id)
      .limit(1);
    const cred = credList?.[0];
    if (!cred) return json({ error: "Google Ads não conectado" }, 400);

    let accessToken = cred.access_token as string;
    if (!cred.token_expires_at || new Date(cred.token_expires_at).getTime() < Date.now()) {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
          client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
          refresh_token: cred.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const tj = await r.json();
      if (!r.ok) return json({ error: "refresh failed", detail: tj }, 502);
      accessToken = tj.access_token;
      await service.from("google_ads_credentials")
        .update({ access_token: accessToken, token_expires_at: new Date(Date.now() + (tj.expires_in - 60) * 1000).toISOString() })
        .eq("workspace_id", rule.workspace_id).eq("customer_id", rule.customer_id);
    }

    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": cred.developer_token || Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!,
      "Content-Type": "application/json",
    };
    const apiBase = `https://googleads.googleapis.com/v21/customers/${rule.customer_id}`;

    const sr = await fetch(`${apiBase}/googleAds:search`, {
      method: "POST", headers, body: JSON.stringify({ query: gaql, pageSize: 1000 }),
    });
    const sj = await sr.json();
    if (!sr.ok) return json({ error: "search failed", detail: sj }, 502);
    const rows = (sj.results || []) as any[];

    interface Agg { id: string; ad_group_id: string; name?: string; clicks: number; cost: number; conv: number; convVal: number; ctr: number }
    const agg = new Map<string, Agg>();
    for (const r of rows) {
      const m = r.metrics || {};
      const clicks = Number(m.clicks || 0);
      const cost = Number(m.costMicros || 0) / 1_000_000;
      const conv = Number(m.conversions || 0);
      const convVal = Number(m.conversionsValue || 0);
      const ctr = Number(m.ctr || 0);

      let key = "", name = "", agId = "";
      if (scope === "keyword") {
        agId = String(r.adGroup?.id || "");
        key = `${agId}:${r.adGroupCriterion?.criterionId}`;
        name = r.adGroupCriterion?.keyword?.text || "";
      } else if (scope === "ad_group") {
        agId = String(r.adGroup?.id || "");
        key = agId;
        name = r.adGroup?.name || "";
      } else {
        agId = String(r.adGroup?.id || "");
        const term = r.searchTermView?.searchTerm || "";
        key = `${agId}:${term}`;
        name = term;
      }
      if (!key) continue;
      const cur = agg.get(key) || { id: key, ad_group_id: agId, name, clicks: 0, cost: 0, conv: 0, convVal: 0, ctr: 0 };
      cur.clicks += clicks; cur.cost += cost; cur.conv += conv; cur.convVal += convVal;
      cur.ctr = Math.max(cur.ctr, ctr);
      agg.set(key, cur);
    }

    const metricFn = (it: Agg): number => {
      switch (metric) {
        case "cpa": return it.conv > 0 ? it.cost / it.conv : Infinity;
        case "roas": return it.cost > 0 ? it.convVal / it.cost : 0;
        case "ctr": return it.ctr;
        case "cost": return it.cost;
        case "conversions": return it.conv;
        case "clicks": return it.clicks;
        default: return 0;
      }
    };
    const cmp = (a: number, b: number): boolean => {
      switch (op) {
        case ">": return a > b;
        case ">=": return a >= b;
        case "<": return a < b;
        case "<=": return a <= b;
        case "=": return a === b;
        default: return false;
      }
    };

    // First filter: condition + min_clicks
    const matchedAll = [...agg.values()].filter(
      (it) => it.clicks >= minClicks && cmp(metricFn(it), threshold),
    );
    // Guardrail: min_conversions
    const matchedAfterMinConv = matchedAll.filter((it) => it.conv >= guard.min_conversions);
    const droppedByMinConv = matchedAll.length - matchedAfterMinConv.length;
    // Guardrail: max_items_per_run cap
    const matched = matchedAfterMinConv.slice(0, guard.max_items_per_run);
    const cappedBy = matchedAfterMinConv.length - matched.length;

    // ── Mode resolution: recommendation always = dry-run; auto only with action permission ──
    const isDryRun = forceDryRunReq || guard.mode === "recommendation";

    let executed = 0, skipped = 0, dryRunCount = 0;
    const log: any[] = [];

    for (const it of matched) {
      const [agId, critOrTerm] = it.id.split(":");
      const baseAudit = {
        workspace_id: rule.workspace_id,
        customer_id: rule.customer_id,
        trigger: "automation_rule",
        action: action.type,
        target_type: scope,
        target_id: it.id,
      };
      try {
        // Permission check (auto only — recommendation always logs as dry_run, no mutation)
        const perm = actionPermission(action.type, guard);
        if (!isDryRun && !perm.allowed) {
          skipped++;
          await service.from("automation_actions").insert({
            ...baseAudit,
            status: "blocked",
            metadata_json: {
              rule_id, metric, value: metricFn(it), threshold,
              execution_mode: guard.mode, guardrails: guard, dry_run: false,
              blocked_reason: perm.reason,
            },
          } as never);
          log.push({ id: it.id, name: it.name, blocked: perm.reason });
          continue;
        }

        let body: Record<string, unknown> | null = null;
        let safeNote: Record<string, unknown> = {};

        if (action.type === "pause_keyword" && scope === "keyword") {
          body = { action: "update_keyword_status", workspace_id: rule.workspace_id, customer_id: rule.customer_id, ad_group_criterion_id: critOrTerm, ad_group_id: agId, status: "PAUSED" };
        } else if (action.type === "pause_ad_group" && (scope === "ad_group" || scope === "keyword")) {
          body = { action: "update_ad_group_status", workspace_id: rule.workspace_id, customer_id: rule.customer_id, ad_group_id: agId, status: "PAUSED" };
        } else if ((action.type === "decrease_bid" || action.type === "increase_bid") && scope === "keyword") {
          const rawFactor = Number(action.factor) || (action.type === "decrease_bid" ? 0.8 : 1.2);
          const q = `SELECT ad_group_criterion.cpc_bid_micros FROM ad_group_criterion WHERE ad_group_criterion.criterion_id = ${critOrTerm} AND ad_group.id = ${agId}`;
          const br = await fetch(`${apiBase}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: q }) });
          const bj = await br.json();
          const cur = Number(bj.results?.[0]?.adGroupCriterion?.cpcBidMicros || 0);
          if (!cur) { skipped++; log.push({ id: it.id, name: it.name, skipped: "no current bid" }); continue; }

          const { micros: nextMicros, applied_factor } = clampBidMicros(cur, rawFactor, guard);
          if (nextMicros === cur) {
            skipped++;
            log.push({ id: it.id, name: it.name, skipped: "guardrail: no-op after clamp", current_bid: cur / 1e6 });
            continue;
          }
          safeNote = {
            requested_factor: rawFactor,
            applied_factor,
            current_bid_brl: cur / 1e6,
            new_bid_brl: nextMicros / 1e6,
            clamps: {
              bid_min: guard.bid_min_brl, bid_max: guard.bid_max_brl,
              min_factor: guard.min_bid_factor, max_factor: guard.max_bid_factor,
              max_pct: guard.bid_change_max_pct,
            },
          };
          body = { action: "update_keyword_bid", workspace_id: rule.workspace_id, customer_id: rule.customer_id, ad_group_criterion_id: critOrTerm, ad_group_id: agId, cpc_bid_micros: nextMicros };
        } else if (action.type === "negate_search_term" && scope === "search_term") {
          body = { action: "add_negative_keyword", workspace_id: rule.workspace_id, customer_id: rule.customer_id, campaign_id: rule.campaign_id, keyword_text: it.name, match_type: action.match_type || "PHRASE", level: "campaign" };
        }
        if (!body) { skipped++; log.push({ id: it.id, name: it.name, skipped: "scope/action mismatch" }); continue; }

        // ── DRY RUN PATH (recommendation OR forced) ──
        if (isDryRun) {
          dryRunCount++;
          await service.from("automation_actions").insert({
            ...baseAudit,
            status: "dry_run",
            metadata_json: {
              rule_id, metric, value: metricFn(it), threshold,
              execution_mode: guard.mode, guardrails: guard, dry_run: true,
              would_send: body, ...safeNote,
            },
          } as never);
          log.push({ id: it.id, name: it.name, value: metricFn(it), dry_run: action.type, ...safeNote });
          continue;
        }

        const ar = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-ads-mutate`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "x-internal-source": "automation",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const ok = ar.ok;
        if (ok) {
          executed++;
          log.push({ id: it.id, name: it.name, value: metricFn(it), executed: action.type, ...safeNote });
          await service.from("automation_actions").insert({
            ...baseAudit,
            status: "success",
            metadata_json: {
              rule_id, metric, value: metricFn(it), threshold,
              execution_mode: guard.mode, guardrails: guard, dry_run: false,
              ...safeNote,
            },
          } as never);
        } else {
          const errJ = await ar.json().catch(() => ({}));
          skipped++;
          await service.from("automation_actions").insert({
            ...baseAudit,
            status: "error",
            error_message: String(errJ.error || ar.statusText).slice(0, 500),
            metadata_json: {
              rule_id, metric, value: metricFn(it), threshold,
              execution_mode: guard.mode, guardrails: guard, dry_run: false,
              ...safeNote,
            },
          } as never);
          log.push({ id: it.id, name: it.name, error: errJ.error || ar.statusText });
        }
      } catch (e) {
        skipped++;
        log.push({ id: it.id, name: it.name, error: String(e) });
      }
    }

    // Update rule stats — last_triggered_at ONLY when executed > 0 (real mutations)
    const updates: Record<string, unknown> = {
      last_evaluated_at: new Date().toISOString(),
    };
    if (executed > 0) {
      updates.last_triggered_at = new Date().toISOString();
      updates.trigger_count = (await service
        .from("automation_rules")
        .select("trigger_count")
        .eq("id", rule_id)
        .single()).data?.trigger_count + executed || executed;
    }
    await service.from("automation_rules").update(updates as never).eq("id", rule_id);

    const notifyPayload = {
      matched: matchedAll.length,
      evaluated: matched.length,
      executed,
      skipped,
      dry_run: dryRunCount,
      capped_by_max_items: cappedBy,
      dropped_by_min_conversions: droppedByMinConv,
      mode: guard.mode,
      effective_dry_run: isDryRun,
      guardrails: guard,
      items: log,
    };
    try {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/automation-rule-notify`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rule_id, payload: notifyPayload }),
      }).catch((e) => console.error("notify dispatch failed", e));
    } catch (e) { console.error("notify dispatch error", e); }

    return json(notifyPayload);
  } catch (e) {
    console.error("evaluate rule error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
