/**
 * meta-ads-multi-account — agrega métricas de TODAS as contas Meta Ads
 * conectadas no workspace via Meta Marketing API v22.0.
 *
 * Body: { workspace_id, period: "7d"|"14d"|"30d"|"90d" }
 *
 * Retorna: { totals, accounts[], top_campaigns[] }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PERIOD_PRESET: Record<string, string> = {
  "7d": "last_7d",
  "14d": "last_14d",
  "30d": "last_30d",
  "90d": "last_90d",
};

const META_API = "https://graph.facebook.com/v22.0";
const PURCHASE_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "web_in_store_purchase",
]);

interface Totals {
  spend: number; clicks: number; impressions: number; conversions: number; conv_value: number;
  ctr: number; cpc: number; cpa: number; roas: number;
}
const empty = (): Totals => ({ spend: 0, clicks: 0, impressions: 0, conversions: 0, conv_value: 0, ctr: 0, cpc: 0, cpa: 0, roas: 0 });
function finalize(t: Totals): Totals {
  t.ctr = t.impressions > 0 ? t.clicks / t.impressions : 0;
  t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
  t.cpa = t.conversions > 0 ? t.spend / t.conversions : 0;
  t.roas = t.spend > 0 ? t.conv_value / t.spend : 0;
  return t;
}

function sumActions(actions: any[] | undefined): number {
  if (!Array.isArray(actions)) return 0;
  let s = 0;
  for (const a of actions) {
    if (PURCHASE_TYPES.has(a?.action_type)) s += Number(a?.value || 0);
  }
  return s;
}
function applyInsight(t: Totals, ins: any) {
  if (!ins) return;
  t.spend += Number(ins.spend || 0);
  t.clicks += Number(ins.clicks || 0);
  t.impressions += Number(ins.impressions || 0);
  t.conversions += sumActions(ins.actions);
  t.conv_value += sumActions(ins.action_values);
}

// in-memory cache (5 min) per workspace+period (per cold container)
const cache = new Map<string, { ts: number; data: any }>();
const TTL_MS = 5 * 60_000;

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
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { workspace_id, period = "30d" } = await req.json();
    if (!workspace_id) return json({ error: "workspace_id required" }, 400);
    const preset = PERIOD_PRESET[period] || "last_30d";

    const cacheKey = `${workspace_id}:${period}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < TTL_MS) return json(cached.data);

    const { data: accs } = await service.from("meta_ad_accounts")
      .select("*").eq("workspace_id", workspace_id);
    if (!accs || accs.length === 0) {
      return json({ ok: true, period, totals: finalize(empty()), accounts: [], top_campaigns: [] });
    }

    const fetchAccount = async (acc: any) => {
      const accountId = String(acc.ad_account_id || "").replace(/^act_/, "");
      const name = acc.account_label || `act_${accountId}`;
      const out = {
        account_id: accountId,
        name,
        currency: "BRL",
        status: "ok" as "ok" | "error",
        error: undefined as string | undefined,
        totals: empty(),
        campaigns: [] as any[],
      };
      try {
        if (!acc.access_token) throw new Error("no_access_token");

        // Account-level insights
        const insUrl = `${META_API}/act_${accountId}/insights?fields=spend,clicks,impressions,actions,action_values,account_currency&date_preset=${preset}&level=account&access_token=${encodeURIComponent(acc.access_token)}`;
        const insRes = await fetch(insUrl);
        const insJson = await insRes.json();
        if (!insRes.ok) {
          const code = insJson?.error?.code;
          if (code === 80004) throw new Error("rate_limited");
          if (code === 190) throw new Error("token_expired");
          if (code === 200 || code === 100) throw new Error("permission_denied");
          throw new Error(insJson?.error?.message || "meta_api_error");
        }
        const row = (insJson.data || [])[0];
        if (row?.account_currency) out.currency = row.account_currency;
        applyInsight(out.totals, row);
        finalize(out.totals);

        // Campaigns with insights (top 50)
        const campUrl = `${META_API}/act_${accountId}/campaigns?fields=name,status,objective,insights.date_preset(${preset}){spend,clicks,impressions,actions,action_values}&limit=50&access_token=${encodeURIComponent(acc.access_token)}`;
        const campRes = await fetch(campUrl);
        const campJson = await campRes.json();
        if (campRes.ok) {
          for (const c of (campJson.data || [])) {
            const ins = (c.insights?.data || [])[0];
            const t = empty();
            applyInsight(t, ins);
            finalize(t);
            out.campaigns.push({
              campaign_id: String(c.id),
              name: c.name,
              status: c.status,
              objective: c.objective,
              account_id: accountId,
              account_name: name,
              spend: t.spend,
              clicks: t.clicks,
              impressions: t.impressions,
              conversions: t.conversions,
              conv_value: t.conv_value,
              roas: t.roas,
              cpa: t.cpa,
            });
          }
        }

        // mark connected
        await service.from("meta_ad_accounts")
          .update({ last_sync_at: new Date().toISOString(), last_error: null, status: "connected" })
          .eq("workspace_id", workspace_id).eq("ad_account_id", acc.ad_account_id);
      } catch (e) {
        out.status = "error";
        out.error = String(e instanceof Error ? e.message : e).slice(0, 200);
        await service.from("meta_ad_accounts")
          .update({ last_error: out.error, status: out.error === "token_expired" ? "error" : acc.status })
          .eq("workspace_id", workspace_id).eq("ad_account_id", acc.ad_account_id);
      }
      return out;
    };

    const accounts = await Promise.all(accs.map(fetchAccount));

    const totals = empty();
    for (const a of accounts) {
      totals.spend += a.totals.spend;
      totals.clicks += a.totals.clicks;
      totals.impressions += a.totals.impressions;
      totals.conversions += a.totals.conversions;
      totals.conv_value += a.totals.conv_value;
    }
    finalize(totals);

    const top_campaigns = accounts.flatMap((a) => a.campaigns)
      .sort((a, b) => b.spend - a.spend).slice(0, 10);

    const accountsLite = accounts.map(({ campaigns: _c, ...rest }) => rest);

    const payload = { ok: true, period, totals, accounts: accountsLite, top_campaigns };
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return json(payload);
  } catch (e) {
    console.error("meta-ads-multi-account error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
