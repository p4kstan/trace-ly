// GA4 Data API v1 — runReport
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
  return await res.json();
}

async function getValidToken(service: any, cred: any) {
  const expiresAt = cred.token_expires_at ? new Date(cred.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 30_000) return cred.access_token;
  if (!cred.refresh_token) throw new Error("No refresh_token available — reconnect GA4");
  const refreshed = await refreshAccessToken(cred.refresh_token);
  if (refreshed.error) throw new Error(`refresh failed: ${refreshed.error}`);
  const newExpires = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
  await service.from("ga4_credentials").update({
    access_token: refreshed.access_token,
    token_expires_at: newExpires,
  }).eq("id", cred.id);
  return refreshed.access_token;
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
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { workspace_id, report_type = "overview", date_range = "last_7_days", property_id } = body;

    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), { status: 400, headers: corsHeaders });
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let credQuery = service.from("ga4_credentials").select("*").eq("workspace_id", workspace_id);
    if (property_id) credQuery = credQuery.eq("property_id", property_id);
    const { data: cred } = await credQuery.maybeSingle();

    if (!cred) {
      return new Response(JSON.stringify({ error: "GA4 not connected" }), { status: 404, headers: corsHeaders });
    }

    // cache lookup
    const cacheKey = `${report_type}:${date_range}`;
    const { data: cached } = await service
      .from("ga4_reports_cache")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("property_id", cred.property_id)
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify({ cached: true, ...(cached.report_json as any) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getValidToken(service, cred);

    // Date range mapping
    const ranges: Record<string, { start: string; end: string }> = {
      today: { start: "today", end: "today" },
      yesterday: { start: "yesterday", end: "yesterday" },
      last_7_days: { start: "7daysAgo", end: "today" },
      last_30_days: { start: "30daysAgo", end: "today" },
      last_90_days: { start: "90daysAgo", end: "today" },
    };
    const dr = ranges[date_range] || ranges.last_7_days;

    // Report templates
    const reports: Record<string, any> = {
      overview: {
        dateRanges: [{ startDate: dr.start, endDate: dr.end }],
        metrics: [
          { name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" },
          { name: "conversions" }, { name: "totalRevenue" }, { name: "engagementRate" },
        ],
      },
      by_channel: {
        dateRanges: [{ startDate: dr.start, endDate: dr.end }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "totalRevenue" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      },
      by_source: {
        dateRanges: [{ startDate: dr.start, endDate: dr.end }],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "totalRevenue" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      },
      by_campaign: {
        dateRanges: [{ startDate: dr.start, endDate: dr.end }],
        dimensions: [{ name: "sessionCampaignName" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "totalRevenue" }],
        orderBys: [{ metric: { metricName: "totalRevenue" }, desc: true }],
        limit: 20,
      },
      by_page: {
        dateRanges: [{ startDate: dr.start, endDate: dr.end }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "averageSessionDuration" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 20,
      },
      events: {
        dateRanges: [{ startDate: dr.start, endDate: dr.end }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }, { name: "totalRevenue" }],
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 50,
      },
      timeseries: {
        dateRanges: [{ startDate: dr.start, endDate: dr.end }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "totalRevenue" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
    };

    const reportBody = reports[report_type] || reports.overview;

    const apiRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${cred.property_id}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(reportBody),
      },
    );

    const apiJson = await apiRes.json();
    if (!apiRes.ok) {
      console.error("GA4 Data API error", apiJson);
      return new Response(JSON.stringify({ error: apiJson.error?.message || "GA4 API error", details: apiJson }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = {
      property_id: cred.property_id,
      property_name: cred.property_name,
      report_type,
      date_range,
      data: apiJson,
    };

    // Cache 15 min
    await service.from("ga4_reports_cache").upsert({
      workspace_id,
      property_id: cred.property_id,
      cache_key: cacheKey,
      report_json: result,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }, { onConflict: "workspace_id,property_id,cache_key" });

    return new Response(JSON.stringify({ cached: false, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ga4-data-reports error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
