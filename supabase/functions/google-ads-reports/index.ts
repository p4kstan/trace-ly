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

function dateRangeClause(period: string, customFrom?: string, customTo?: string) {
  switch (period) {
    case "today": return "segments.date DURING TODAY";
    case "yesterday": return "segments.date DURING YESTERDAY";
    case "7d": return "segments.date DURING LAST_7_DAYS";
    case "14d": return "segments.date DURING LAST_14_DAYS";
    case "30d": return "segments.date DURING LAST_30_DAYS";
    case "90d": {
      const today = new Date();
      const past = new Date(); past.setDate(today.getDate() - 90);
      return `segments.date BETWEEN '${past.toISOString().slice(0,10)}' AND '${today.toISOString().slice(0,10)}'`;
    }
    case "custom": {
      if (!customFrom || !customTo) return "segments.date DURING LAST_7_DAYS";
      return `segments.date BETWEEN '${customFrom}' AND '${customTo}'`;
    }
    default: return "segments.date DURING LAST_7_DAYS";
  }
}

function buildQuery(level: string, period: string, customFrom?: string, customTo?: string, parentId?: string) {
  const dateClause = dateRangeClause(period, customFrom, customTo);

  if (level === "campaigns") {
    return `
      SELECT
        campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.cost_per_conversion, metrics.search_impression_share
      FROM campaign
      WHERE ${dateClause}
      ORDER BY metrics.cost_micros DESC
    `;
  }

  if (level === "ad_groups") {
    const filter = parentId ? `AND campaign.id = ${parentId}` : "";
    return `
      SELECT
        ad_group.id, ad_group.name, ad_group.status, ad_group.type,
        campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.cost_per_conversion
      FROM ad_group
      WHERE ${dateClause} ${filter}
      ORDER BY metrics.cost_micros DESC
    `;
  }

  if (level === "ads") {
    const filter = parentId ? `AND ad_group.id = ${parentId}` : "";
    return `
      SELECT
        ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
        ad_group_ad.status, ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group.id, ad_group.name, campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.cost_per_conversion
      FROM ad_group_ad
      WHERE ${dateClause} ${filter}
      ORDER BY metrics.cost_micros DESC
    `;
  }

  throw new Error(`unknown level: ${level}`);
}

function mapRow(level: string, r: any) {
  const m = r.metrics || {};
  const base = {
    impressions: Number(m.impressions ?? 0),
    clicks: Number(m.clicks ?? 0),
    ctr: Number(m.ctr ?? 0),
    average_cpc_micros: Number(m.averageCpc ?? 0),
    cost_micros: Number(m.costMicros ?? 0),
    conversions: Number(m.conversions ?? 0),
    conversions_value: Number(m.conversionsValue ?? 0),
    cost_per_conversion_micros: Number(m.costPerConversion ?? 0),
  };

  if (level === "campaigns") {
    return {
      id: String(r.campaign?.id ?? ""),
      name: r.campaign?.name ?? "",
      status: r.campaign?.status ?? null,
      channel_type: r.campaign?.advertisingChannelType ?? null,
      search_impression_share: m.searchImpressionShare != null ? Number(m.searchImpressionShare) : null,
      ...base,
    };
  }

  if (level === "ad_groups") {
    return {
      id: String(r.adGroup?.id ?? ""),
      name: r.adGroup?.name ?? "",
      status: r.adGroup?.status ?? null,
      type: r.adGroup?.type ?? null,
      campaign_id: String(r.campaign?.id ?? ""),
      campaign_name: r.campaign?.name ?? "",
      ...base,
    };
  }

  if (level === "ads") {
    const ad = r.adGroupAd?.ad ?? {};
    const rsa = ad.responsiveSearchAd ?? {};
    return {
      id: String(ad.id ?? ""),
      name: ad.name || (rsa.headlines?.[0]?.text ?? `Anúncio ${ad.id}`),
      type: ad.type ?? null,
      status: r.adGroupAd?.status ?? null,
      final_urls: ad.finalUrls ?? [],
      headlines: (rsa.headlines || []).map((h: any) => h.text).filter(Boolean),
      descriptions: (rsa.descriptions || []).map((d: any) => d.text).filter(Boolean),
      ad_group_id: String(r.adGroup?.id ?? ""),
      ad_group_name: r.adGroup?.name ?? "",
      campaign_id: String(r.campaign?.id ?? ""),
      campaign_name: r.campaign?.name ?? "",
      ...base,
    };
  }

  return base;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const {
      workspace_id,
      customer_id,
      level = "campaigns",
      period = "7d",
      from: customFrom,
      to: customTo,
      parent_id,
    } = body || {};

    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let credQuery = service.from("google_ads_credentials").select("*").eq("workspace_id", workspace_id);
    if (customer_id) credQuery = credQuery.eq("customer_id", customer_id);
    else credQuery = credQuery.order("is_default", { ascending: false });

    const { data: credList } = await credQuery.limit(1);
    const cred = credList?.[0];
    if (!cred) {
      return new Response(JSON.stringify({ error: "Google Ads not connected", reconnect: true }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let accessToken = cred.access_token as string;
    if (!cred.token_expires_at || new Date(cred.token_expires_at).getTime() < Date.now()) {
      if (!cred.refresh_token) {
        return new Response(JSON.stringify({ error: "No refresh token, reconnect required", reconnect: true, customer_id: cred.customer_id }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        return new Response(JSON.stringify({ error: "Refresh token invalid, reconnect required", reconnect: true, customer_id: cred.customer_id }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const developerToken = cred.developer_token || Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const customerId = cred.customer_id;

    const query = buildQuery(level, period, customFrom, customTo, parent_id);

    const adsRes = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      }
    );

    const adsJson = await adsRes.json();
    if (!adsRes.ok) {
      console.error("ads api error", adsJson);
      return new Response(JSON.stringify({ error: "Google Ads API error", detail: adsJson }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results = adsJson.results || [];
    // Aggregate by entity id (since results are per-row; here we don't segment by date so should be one row per entity, but be safe)
    const map = new Map<string, any>();
    for (const r of results) {
      const mapped = mapRow(level, r);
      if (!mapped.id) continue;
      const existing = map.get(mapped.id);
      if (!existing) {
        map.set(mapped.id, mapped);
      } else {
        existing.impressions += mapped.impressions;
        existing.clicks += mapped.clicks;
        existing.cost_micros += mapped.cost_micros;
        existing.conversions += mapped.conversions;
        existing.conversions_value += mapped.conversions_value;
      }
    }
    const rows = Array.from(map.values()).map((row) => {
      const cost = row.cost_micros / 1_000_000;
      const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
      const cpc = row.clicks > 0 ? cost / row.clicks : 0;
      const cpa = row.conversions > 0 ? cost / row.conversions : 0;
      const roas = cost > 0 ? row.conversions_value / cost : 0;
      const conv_rate = row.clicks > 0 ? row.conversions / row.clicks : 0;
      return { ...row, cost, ctr, cpc, cpa, roas, conv_rate };
    });

    // Totals row
    const totals = rows.reduce((acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      cost: acc.cost + r.cost,
      conversions: acc.conversions + r.conversions,
      conversions_value: acc.conversions_value + r.conversions_value,
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 });
    const totalsExt = {
      ...totals,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      cpc: totals.clicks > 0 ? totals.cost / totals.clicks : 0,
      cpa: totals.conversions > 0 ? totals.cost / totals.conversions : 0,
      roas: totals.cost > 0 ? totals.conversions_value / totals.cost : 0,
      conv_rate: totals.clicks > 0 ? totals.conversions / totals.clicks : 0,
    };

    return new Response(JSON.stringify({ ok: true, rows, totals: totalsExt, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reports error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
