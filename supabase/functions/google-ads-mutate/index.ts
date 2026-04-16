import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`refresh failed: ${JSON.stringify(j)}`);
  return { access_token: j.access_token as string, expires_in: j.expires_in as number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { workspace_id, customer_id, action, campaign_id, status, budget_micros, budget_resource } = body || {};

    if (!workspace_id || !customer_id || !action) return json({ error: "workspace_id, customer_id, action required" }, 400);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: credList } = await service.from("google_ads_credentials").select("*").eq("workspace_id", workspace_id).eq("customer_id", customer_id).limit(1);
    const cred = credList?.[0];
    if (!cred) return json({ error: "Google Ads not connected", reconnect: true }, 400);

    let accessToken = cred.access_token as string;
    if (!cred.token_expires_at || new Date(cred.token_expires_at).getTime() < Date.now()) {
      if (!cred.refresh_token) return json({ error: "Reconnect required", reconnect: true }, 400);
      try {
        const refreshed = await refreshAccessToken(cred.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
        await service.from("google_ads_credentials").update({ access_token: accessToken, token_expires_at: newExpiry })
          .eq("workspace_id", workspace_id).eq("customer_id", customer_id);
      } catch {
        return json({ error: "Reconnect required", reconnect: true }, 400);
      }
    }

    const developerToken = cred.developer_token || Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };

    // ---- ACTION: update campaign status ----
    if (action === "update_campaign_status") {
      if (!campaign_id || !status) return json({ error: "campaign_id and status required" }, 400);
      const url = `https://googleads.googleapis.com/v21/customers/${customer_id}/campaigns:mutate`;
      const payload = {
        operations: [{
          update: {
            resourceName: `customers/${customer_id}/campaigns/${campaign_id}`,
            status,
          },
          updateMask: "status",
        }],
      };
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      const text = await r.text();
      let resJson: any;
      try { resJson = JSON.parse(text); } catch { return json({ error: "non-JSON response", detail: text.slice(0,500) }, 502); }
      if (!r.ok) return json({ error: "Google Ads mutate error", detail: resJson }, 502);
      return json({ ok: true, result: resJson });
    }

    // ---- ACTION: update campaign budget ----
    if (action === "update_budget") {
      if (!budget_resource || !budget_micros) return json({ error: "budget_resource and budget_micros required" }, 400);
      const url = `https://googleads.googleapis.com/v21/customers/${customer_id}/campaignBudgets:mutate`;
      const payload = {
        operations: [{
          update: {
            resourceName: budget_resource, // e.g. customers/123/campaignBudgets/456
            amountMicros: String(budget_micros),
          },
          updateMask: "amount_micros",
        }],
      };
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      const text = await r.text();
      let resJson: any;
      try { resJson = JSON.parse(text); } catch { return json({ error: "non-JSON response", detail: text.slice(0,500) }, 502); }
      if (!r.ok) return json({ error: "Google Ads mutate error", detail: resJson }, 502);
      return json({ ok: true, result: resJson });
    }

    // ---- ACTION: get campaign budget resource (helper) ----
    if (action === "get_campaign_budget") {
      if (!campaign_id) return json({ error: "campaign_id required" }, 400);
      const query = `SELECT campaign_budget.resource_name, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaign_id}`;
      const r = await fetch(`https://googleads.googleapis.com/v21/customers/${customer_id}/googleAds:search`, {
        method: "POST", headers, body: JSON.stringify({ query }),
      });
      const text = await r.text();
      let resJson: any;
      try { resJson = JSON.parse(text); } catch { return json({ error: "non-JSON", detail: text.slice(0,500) }, 502); }
      if (!r.ok) return json({ error: "search failed", detail: resJson }, 502);
      const row = resJson.results?.[0];
      return json({
        ok: true,
        budget_resource: row?.campaignBudget?.resourceName,
        budget_micros: Number(row?.campaignBudget?.amountMicros ?? 0),
      });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("mutate error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
