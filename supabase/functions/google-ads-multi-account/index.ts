/**
 * google-ads-multi-account — agrega métricas de TODAS as contas Google Ads
 * conectadas no workspace em uma única chamada.
 *
 * Body: { workspace_id, period: "7d"|"14d"|"30d"|"90d" }
 *
 * Retorna:
 *   - totals: somatório global (cost, clicks, impressions, conversions, conv_value, ctr, cpc, cpa, roas)
 *   - accounts: lista por conta { customer_id, name, totals, status, error? }
 *   - top_campaigns: top 10 campanhas por custo cruzando todas as contas
 *
 * Faz GAQL em paralelo por conta e tolera falhas individuais (retorna error inline).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };

async function refresh(refreshToken: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return { access_token: j.access_token as string, expires_in: j.expires_in as number };
}

interface Totals {
  cost: number; clicks: number; impressions: number; conversions: number; conv_value: number;
  ctr: number; cpc: number; cpa: number; roas: number; conv_rate: number;
}
const empty = (): Totals => ({ cost: 0, clicks: 0, impressions: 0, conversions: 0, conv_value: 0, ctr: 0, cpc: 0, cpa: 0, roas: 0, conv_rate: 0 });

function finalize(t: Totals): Totals {
  t.ctr = t.impressions > 0 ? t.clicks / t.impressions : 0;
  t.cpc = t.clicks > 0 ? t.cost / t.clicks : 0;
  t.cpa = t.conversions > 0 ? t.cost / t.conversions : 0;
  t.roas = t.cost > 0 ? t.conv_value / t.cost : 0;
  t.conv_rate = t.clicks > 0 ? t.conversions / t.clicks : 0;
  return t;
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

    const { workspace_id, period = "30d" } = await req.json();
    if (!workspace_id) return json({ error: "workspace_id required" }, 400);
    const days = PERIOD_DAYS[period] || 30;

    const { data: creds } = await service.from("google_ads_credentials")
      .select("*").eq("workspace_id", workspace_id);
    if (!creds || creds.length === 0) return json({ ok: true, totals: finalize(empty()), accounts: [], top_campaigns: [] });

    const developerToken = creds[0].developer_token || Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const gaqlAccount = `
      SELECT customer.descriptive_name,
             metrics.cost_micros, metrics.clicks, metrics.impressions,
             metrics.conversions, metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${since}' AND '${today}'
    `.trim();
    const gaqlCampaigns = `
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.cost_micros, metrics.clicks, metrics.impressions,
             metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${today}'
        AND campaign.status != 'REMOVED'
    `.trim();

    const fetchAccount = async (cred: any) => {
      try {
        let token = cred.access_token as string;
        if (!cred.token_expires_at || new Date(cred.token_expires_at).getTime() < Date.now()) {
          if (!cred.refresh_token) throw new Error("Reconnect required");
          const r = await refresh(cred.refresh_token);
          token = r.access_token;
          await service.from("google_ads_credentials").update({
            access_token: token,
            token_expires_at: new Date(Date.now() + (r.expires_in - 60) * 1000).toISOString(),
          }).eq("workspace_id", workspace_id).eq("customer_id", cred.customer_id);
        }
        const headers = { "Authorization": `Bearer ${token}`, "developer-token": developerToken, "Content-Type": "application/json" };
        const apiBase = `https://googleads.googleapis.com/v21/customers/${cred.customer_id}`;

        // Aggregate account totals + per-campaign in parallel
        const [accRes, campRes] = await Promise.all([
          fetch(`${apiBase}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: gaqlAccount, pageSize: 1000 }) }),
          fetch(`${apiBase}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: gaqlCampaigns, pageSize: 1000 }) }),
        ]);
        const accJson = await accRes.json();
        const campJson = await campRes.json();
        if (!accRes.ok) throw new Error(JSON.stringify(accJson).slice(0, 200));

        const accTotals = empty();
        let name = cred.account_name || cred.customer_id;
        for (const r of (accJson.results || [])) {
          const m = r.metrics || {};
          accTotals.cost += Number(m.costMicros || 0) / 1_000_000;
          accTotals.clicks += Number(m.clicks || 0);
          accTotals.impressions += Number(m.impressions || 0);
          accTotals.conversions += Number(m.conversions || 0);
          accTotals.conv_value += Number(m.conversionsValue || 0);
          if (r.customer?.descriptiveName) name = r.customer.descriptiveName;
        }

        const campaigns = (campJson.results || []).map((r: any) => {
          const m = r.metrics || {};
          const cost = Number(m.costMicros || 0) / 1_000_000;
          const clicks = Number(m.clicks || 0);
          const conv = Number(m.conversions || 0);
          const cv = Number(m.conversionsValue || 0);
          return {
            customer_id: cred.customer_id,
            account_name: name,
            campaign_id: String(r.campaign?.id || ""),
            campaign_name: r.campaign?.name || "",
            status: r.campaign?.status || "",
            cost, clicks, impressions: Number(m.impressions || 0),
            conversions: conv, conv_value: cv,
            cpa: conv > 0 ? cost / conv : 0,
            roas: cost > 0 ? cv / cost : 0,
          };
        });

        return {
          customer_id: cred.customer_id,
          name,
          status: "ok" as const,
          totals: finalize(accTotals),
          campaigns,
        };
      } catch (e) {
        return {
          customer_id: cred.customer_id,
          name: cred.account_name || cred.customer_id,
          status: "error" as const,
          error: String(e instanceof Error ? e.message : e).slice(0, 200),
          totals: finalize(empty()),
          campaigns: [] as any[],
        };
      }
    };

    const accounts = await Promise.all(creds.map(fetchAccount));

    // Aggregate global totals
    const totals = empty();
    for (const a of accounts) {
      totals.cost += a.totals.cost;
      totals.clicks += a.totals.clicks;
      totals.impressions += a.totals.impressions;
      totals.conversions += a.totals.conversions;
      totals.conv_value += a.totals.conv_value;
    }
    finalize(totals);

    // Top campaigns by cost across all accounts
    const allCampaigns = accounts.flatMap((a) => a.campaigns);
    const top_campaigns = allCampaigns.sort((a, b) => b.cost - a.cost).slice(0, 10);

    // Strip campaigns from per-account payload (keep response light)
    const accountsLite = accounts.map(({ campaigns, ...rest }) => rest);

    return json({ ok: true, period, totals, accounts: accountsLite, top_campaigns });
  } catch (e) {
    console.error("multi-account error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
