/**
 * Evaluates a single automation rule on demand.
 *
 * Body: { rule_id: string }
 *
 * Condition schema (condition_json):
 *   { metric: "cpa"|"roas"|"ctr"|"cost"|"conversions",
 *     operator: ">"|">="|"<"|"<="|"=",
 *     threshold: number,
 *     window_days: number,            // 1, 3, 7, 14, 30
 *     scope: "keyword"|"ad_group"|"search_term",
 *     min_clicks?: number             // ignore items with fewer clicks
 *   }
 *
 * Action schema (action_json):
 *   { type: "pause_keyword" | "pause_ad_group" |
 *           "decrease_bid" | "increase_bid" |
 *           "negate_search_term",
 *     factor?: number,                // for bid actions (e.g. 0.8 = -20%)
 *     match_type?: "EXACT"|"PHRASE"|"BROAD" }
 *
 * Returns: { matched, executed, skipped, items: [...] }
 *
 * Call style: invoked from the UI with the user's JWT — we resolve the rule's
 * workspace and re-call google-ads-mutate as the same user (forwarded auth).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    const { rule_id } = await req.json();
    if (!rule_id) return json({ error: "rule_id required" }, 400);

    const { data: rule } = await service
      .from("automation_rules")
      .select("*")
      .eq("id", rule_id)
      .single<Rule>();
    if (!rule) return json({ error: "rule not found" }, 404);
    if (!rule.customer_id || !rule.campaign_id) {
      return json({ error: "Regra precisa ter customer_id e campaign_id" }, 400);
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

    // Search loop with pagination — keep simple: 1 page (≤ 10k rows is plenty)
    const sr = await fetch(`${apiBase}/googleAds:search`, {
      method: "POST", headers, body: JSON.stringify({ query: gaql, pageSize: 1000 }),
    });
    const sj = await sr.json();
    if (!sr.ok) return json({ error: "search failed", detail: sj }, 502);
    const rows = (sj.results || []) as any[];

    // Aggregate metrics per item
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

    // Compute metric value per item
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

    const matched = [...agg.values()].filter((it) => it.clicks >= minClicks && cmp(metricFn(it), threshold));

    // Execute action per matched item
    let executed = 0, skipped = 0;
    const log: any[] = [];
    for (const it of matched) {
      const [agId, critOrTerm] = it.id.split(":");
      try {
        let body: Record<string, unknown> | null = null;
        if (action.type === "pause_keyword" && scope === "keyword") {
          body = { action: "update_keyword_status", workspace_id: rule.workspace_id, customer_id: rule.customer_id, ad_group_criterion_id: critOrTerm, ad_group_id: agId, status: "PAUSED" };
        } else if (action.type === "pause_ad_group" && (scope === "ad_group" || scope === "keyword")) {
          body = { action: "update_ad_group_status", workspace_id: rule.workspace_id, customer_id: rule.customer_id, ad_group_id: agId, status: "PAUSED" };
        } else if ((action.type === "decrease_bid" || action.type === "increase_bid") && scope === "keyword") {
          // Need current bid — for simplicity, use a fixed micros from action.cpc_brl or refuse
          const factor = Number(action.factor) || (action.type === "decrease_bid" ? 0.8 : 1.2);
          // Fetch current bid
          const q = `SELECT ad_group_criterion.cpc_bid_micros FROM ad_group_criterion WHERE ad_group_criterion.criterion_id = ${critOrTerm} AND ad_group.id = ${agId}`;
          const br = await fetch(`${apiBase}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: q }) });
          const bj = await br.json();
          const cur = Number(bj.results?.[0]?.adGroupCriterion?.cpcBidMicros || 0);
          if (!cur) { skipped++; log.push({ id: it.id, name: it.name, skipped: "no current bid" }); continue; }
          body = { action: "update_keyword_bid", workspace_id: rule.workspace_id, customer_id: rule.customer_id, ad_group_criterion_id: critOrTerm, ad_group_id: agId, cpc_bid_micros: Math.round(cur * factor) };
        } else if (action.type === "negate_search_term" && scope === "search_term") {
          body = { action: "add_negative_keyword", workspace_id: rule.workspace_id, customer_id: rule.customer_id, campaign_id: rule.campaign_id, keyword_text: it.name, match_type: action.match_type || "PHRASE", level: "campaign" };
        }
        if (!body) { skipped++; log.push({ id: it.id, name: it.name, skipped: "scope/action mismatch" }); continue; }

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
          log.push({ id: it.id, name: it.name, value: metricFn(it), executed: action.type });
          // Also write to automation_actions audit log
          await service.from("automation_actions").insert({
            workspace_id: rule.workspace_id, customer_id: rule.customer_id,
            trigger: "automation_rule",
            action: action.type,
            target_type: scope,
            target_id: it.id,
            status: "executed",
            metadata_json: { rule_id, metric, value: metricFn(it), threshold },
          } as never);
        } else {
          const errJ = await ar.json().catch(() => ({}));
          skipped++;
          log.push({ id: it.id, name: it.name, error: errJ.error || ar.statusText });
        }
      } catch (e) {
        skipped++;
        log.push({ id: it.id, name: it.name, error: String(e) });
      }
    }

    // Update rule stats
    await service.from("automation_rules").update({
      last_evaluated_at: new Date().toISOString(),
      last_triggered_at: matched.length > 0 ? new Date().toISOString() : (await service.from("automation_rules").select("last_triggered_at").eq("id", rule_id).single()).data?.last_triggered_at,
      trigger_count: matched.length > 0 ? executed : 0,
    } as never).eq("id", rule_id);

    // Fire-and-forget notifications (don't block response)
    const notifyPayload = { matched: matched.length, executed, skipped, items: log };
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
