/**
 * Backtest an automation rule WITHOUT executing actions.
 *
 * Body: either { rule_id } (existing rule) or { rule_draft } with the same
 * shape that would be saved (workspace_id, customer_id, campaign_id,
 * condition_json, action_json) — supports validating BEFORE creation.
 *
 * Optional: backtest_days (default 30) — extends the lookback window so we
 * can show how many items WOULD have matched in the past period.
 *
 * Returns: { matched, sample, total_items, condition_summary, action_preview }
 *
 * IMPORTANT: This function NEVER calls google-ads-mutate. It only reads.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface RuleShape {
  workspace_id: string;
  customer_id: string;
  campaign_id: string;
  condition_json: any;
  action_json: any;
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

    const body = await req.json();
    const backtestDays = Math.min(Math.max(Number(body.backtest_days) || 30, 1), 90);

    // Resolve rule shape (existing or draft)
    let rule: RuleShape | null = null;
    if (body.rule_id) {
      const { data } = await service.from("automation_rules").select("*").eq("id", body.rule_id).single();
      if (!data) return json({ error: "rule not found" }, 404);
      rule = data as RuleShape;
    } else if (body.rule_draft) {
      rule = body.rule_draft as RuleShape;
    } else {
      return json({ error: "rule_id or rule_draft required" }, 400);
    }

    if (!rule.customer_id || !rule.campaign_id) {
      return json({ error: "Regra precisa ter customer_id e campaign_id" }, 400);
    }

    const cond = rule.condition_json || {};
    const action = rule.action_json || {};
    const minClicks = Number(cond.min_clicks) || 0;
    const scope = (cond.scope || (action.scope || "keyword")) as "keyword" | "ad_group" | "search_term";
    const metric = String(cond.metric);
    const op = String(cond.operator);
    const threshold = Number(cond.threshold);

    // Use backtestDays (NOT cond.window_days) for the backtest lookback.
    const since = new Date(Date.now() - backtestDays * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const dateClause = `segments.date BETWEEN '${since}' AND '${today}'`;
    const campClause = `campaign.id = ${rule.campaign_id}`;

    let gaql = "";
    if (scope === "keyword") {
      gaql = `SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
        metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr
        FROM keyword_view WHERE ${campClause} AND ${dateClause}
          AND ad_group_criterion.status = 'ENABLED'`;
    } else if (scope === "ad_group") {
      gaql = `SELECT ad_group.id, ad_group.name,
        metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr
        FROM ad_group WHERE ${campClause} AND ${dateClause} AND ad_group.status = 'ENABLED'`;
    } else if (scope === "search_term") {
      gaql = `SELECT search_term_view.search_term, ad_group.id,
        metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM search_term_view WHERE ${campClause} AND ${dateClause}`;
    } else {
      return json({ error: `unsupported scope: ${scope}` }, 400);
    }

    // Get credentials and refresh token if needed
    const { data: credList } = await service
      .from("google_ads_credentials").select("*")
      .eq("workspace_id", rule.workspace_id).eq("customer_id", rule.customer_id).limit(1);
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

    interface Agg { id: string; ad_group_id: string; name: string; clicks: number; cost: number; conv: number; convVal: number; ctr: number }
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
        case ">": return a > b; case ">=": return a >= b;
        case "<": return a < b; case "<=": return a <= b;
        case "=": return a === b; default: return false;
      }
    };

    const all = [...agg.values()].filter((it) => it.clicks >= minClicks);
    const matched = all.filter((it) => cmp(metricFn(it), threshold));
    // Sample: top 20 sorted by metric value (desc for >, asc for <)
    const sortDir = (op === "<" || op === "<=") ? 1 : -1;
    const sample = matched
      .map((it) => ({
        id: it.id,
        name: it.name,
        ad_group_id: it.ad_group_id,
        clicks: it.clicks,
        cost: Number(it.cost.toFixed(2)),
        conversions: Number(it.conv.toFixed(2)),
        metric_value: Number(metricFn(it).toFixed(2)),
      }))
      .sort((a, b) => sortDir * (a.metric_value - b.metric_value))
      .slice(0, 20);

    // Total cost / conversions impacted (preview of "what would have been paused")
    const impactCost = matched.reduce((s, it) => s + it.cost, 0);
    const impactConv = matched.reduce((s, it) => s + it.conv, 0);

    return json({
      ok: true,
      backtest_days: backtestDays,
      total_items: all.length,
      matched: matched.length,
      sample,
      impact: {
        cost: Number(impactCost.toFixed(2)),
        conversions: Number(impactConv.toFixed(2)),
      },
      condition_summary: { metric, operator: op, threshold, scope, min_clicks: minClicks },
      action_preview: action,
    });
  } catch (e) {
    console.error("backtest error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
