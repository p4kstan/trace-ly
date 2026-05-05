/**
 * meta-ads-reports — detalhe por conta Meta:
 *   level = "campaign" | "adset" | "ad"
 *   opcionalmente filtra por parent_id (campaign_id pra adset, adset_id pra ad)
 *
 * Body: { workspace_id, account_id, period, level, parent_id? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PERIOD_PRESET: Record<string, string> = {
  "7d": "last_7d", "14d": "last_14d", "30d": "last_30d", "90d": "last_90d",
};
const META_API = "https://graph.facebook.com/v22.0";
const PURCHASE_TYPES = new Set(["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "web_in_store_purchase"]);

function sumActions(actions: any[] | undefined): number {
  if (!Array.isArray(actions)) return 0;
  let s = 0;
  for (const a of actions) if (PURCHASE_TYPES.has(a?.action_type)) s += Number(a?.value || 0);
  return s;
}

interface T { spend: number; clicks: number; impressions: number; conversions: number; conv_value: number; ctr: number; cpc: number; cpa: number; roas: number; }
const empty = (): T => ({ spend: 0, clicks: 0, impressions: 0, conversions: 0, conv_value: 0, ctr: 0, cpc: 0, cpa: 0, roas: 0 });
function finalize(t: T): T {
  t.ctr = t.impressions > 0 ? t.clicks / t.impressions : 0;
  t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
  t.cpa = t.conversions > 0 ? t.spend / t.conversions : 0;
  t.roas = t.spend > 0 ? t.conv_value / t.spend : 0;
  return t;
}
function fromIns(ins: any): T {
  const t = empty();
  if (!ins) return finalize(t);
  t.spend = Number(ins.spend || 0);
  t.clicks = Number(ins.clicks || 0);
  t.impressions = Number(ins.impressions || 0);
  t.conversions = sumActions(ins.actions);
  t.conv_value = sumActions(ins.action_values);
  return finalize(t);
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
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const { workspace_id, account_id, period = "30d", level = "campaign", parent_id } = body;
    if (!workspace_id || !account_id) return json({ error: "workspace_id and account_id required" }, 400);

    const preset = PERIOD_PRESET[period] || "last_30d";
    const cleanId = String(account_id).replace(/^act_/, "");

    const { data: acc } = await service.from("meta_ad_accounts").select("*")
      .eq("workspace_id", workspace_id).eq("ad_account_id", cleanId).maybeSingle();
    if (!acc) return json({ error: "account_not_found" }, 404);
    if (!acc.access_token) return json({ error: "no_access_token", reconnect: true }, 400);

    let edge = "campaigns";
    let extraFilter = "";
    if (level === "adset") {
      edge = "adsets";
      if (parent_id) extraFilter = `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: parent_id }]))}`;
    } else if (level === "ad") {
      edge = "ads";
      if (parent_id) extraFilter = `&filtering=${encodeURIComponent(JSON.stringify([{ field: "adset.id", operator: "EQUAL", value: parent_id }]))}`;
    }

    const fields = level === "ad"
      ? `name,status,adset_id,campaign_id,creative,insights.date_preset(${preset}){spend,clicks,impressions,actions,action_values}`
      : level === "adset"
      ? `name,status,campaign_id,daily_budget,insights.date_preset(${preset}){spend,clicks,impressions,actions,action_values}`
      : `name,status,objective,daily_budget,insights.date_preset(${preset}){spend,clicks,impressions,actions,action_values}`;

    const url = `${META_API}/act_${cleanId}/${edge}?fields=${fields}&limit=200${extraFilter}&access_token=${encodeURIComponent(acc.access_token)}`;
    const res = await fetch(url);
    const j = await res.json();
    if (!res.ok) {
      const code = j?.error?.code;
      const reconnect = code === 190;
      return json({ error: j?.error?.message || "meta_api_error", reconnect, account_id: cleanId }, reconnect ? 400 : 502);
    }

    const rows = (j.data || []).map((r: any) => {
      const t = fromIns((r.insights?.data || [])[0]);
      return {
        id: String(r.id),
        name: r.name,
        status: r.status,
        objective: r.objective,
        campaign_id: r.campaign_id,
        adset_id: r.adset_id,
        ...t,
      };
    });

    const totals = empty();
    for (const r of rows) {
      totals.spend += r.spend; totals.clicks += r.clicks; totals.impressions += r.impressions;
      totals.conversions += r.conversions; totals.conv_value += r.conv_value;
    }
    finalize(totals);

    return json({ ok: true, period, level, rows, totals, count: rows.length });
  } catch (e) {
    console.error("meta-ads-reports error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
