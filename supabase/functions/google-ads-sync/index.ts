import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const json = await res.json();
  if (!res.ok) throw new Error(`refresh failed: ${JSON.stringify(json)}`);
  return { access_token: json.access_token as string, expires_in: json.expires_in as number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { workspace_id, customer_id, days = 30 } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), { status: 400, headers: corsHeaders });
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pick specific account if customer_id given, else default, else first
    let credQuery = service.from("google_ads_credentials").select("*").eq("workspace_id", workspace_id);
    if (customer_id) credQuery = credQuery.eq("customer_id", customer_id);
    else credQuery = credQuery.order("is_default", { ascending: false });

    const { data: credList, error: credErr } = await credQuery.limit(1);
    const cred = credList?.[0];

    if (credErr || !cred) {
      return new Response(JSON.stringify({ error: "Google Ads not connected", reconnect: true }), { status: 400, headers: corsHeaders });
    }

    // Refresh if expired
    let accessToken = cred.access_token as string;
    if (!cred.token_expires_at || new Date(cred.token_expires_at).getTime() < Date.now()) {
      if (!cred.refresh_token) {
        await service.from("google_ads_credentials").update({
          status: "error",
          last_error: "No refresh token, reconnect required",
        }).eq("workspace_id", workspace_id).eq("customer_id", cred.customer_id);
        return new Response(JSON.stringify({ error: "No refresh token, reconnect required", reconnect: true, customer_id: cred.customer_id }), { status: 400, headers: corsHeaders });
      }
      try {
        const refreshed = await refreshAccessToken(cred.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
        await service.from("google_ads_credentials").update({
          access_token: accessToken,
          token_expires_at: newExpiry,
        }).eq("workspace_id", workspace_id).eq("customer_id", cred.customer_id);
      } catch (e) {
        await service.from("google_ads_credentials").update({
          status: "error",
          last_error: `Refresh failed: ${String(e).slice(0, 300)}`,
        }).eq("workspace_id", workspace_id).eq("customer_id", cred.customer_id);
        return new Response(JSON.stringify({ error: "Refresh token invalid, reconnect required", reconnect: true, customer_id: cred.customer_id }), { status: 400, headers: corsHeaders });
      }
    }

    const developerToken = cred.developer_token || Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const customerId = cred.customer_id;

    // Google Ads API: search GAQL for last N days
    const gaql = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        segments.date,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions,
        metrics.conversions_value,
        metrics.search_impression_share
      FROM campaign
      WHERE segments.date DURING LAST_${days === 7 ? "7_DAYS" : days === 14 ? "14_DAYS" : "30_DAYS"}
      ORDER BY segments.date DESC
    `;

    const adsRes = await fetch(
      `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: gaql }),
      }
    );

    const adsJson = await adsRes.json();
    if (!adsRes.ok) {
      console.error("ads api error", adsJson);
      await service.from("google_ads_credentials").update({
        last_error: JSON.stringify(adsJson).slice(0, 500),
      }).eq("workspace_id", workspace_id).eq("customer_id", cred.customer_id);
      return new Response(JSON.stringify({ error: "Google Ads API error", detail: adsJson }), { status: 502, headers: corsHeaders });
    }

    const results = adsJson.results || [];
    const rows = results.map((r: any) => ({
      workspace_id,
      campaign_id: String(r.campaign?.id ?? ""),
      campaign_name: r.campaign?.name ?? null,
      status: r.campaign?.status ?? null,
      date: r.segments?.date,
      cost_micros: Number(r.metrics?.costMicros ?? 0),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      ctr: Number(r.metrics?.ctr ?? 0),
      average_cpc_micros: Number(r.metrics?.averageCpc ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
      conversion_value: Number(r.metrics?.conversionsValue ?? 0),
      search_impression_share: r.metrics?.searchImpressionShare ? Number(r.metrics.searchImpressionShare) : null,
      synced_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: upErr } = await service.from("google_ads_campaigns").upsert(rows, {
        onConflict: "workspace_id,campaign_id,date",
      });
      if (upErr) console.error("upsert err", upErr);
    }

    await service.from("google_ads_credentials").update({
      last_sync_at: new Date().toISOString(),
      last_error: null,
      status: "connected",
    }).eq("workspace_id", workspace_id).eq("customer_id", cred.customer_id);

    return new Response(JSON.stringify({ ok: true, synced: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
