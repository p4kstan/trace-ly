// GA4 Admin API — list properties/streams, manage custom events, conversions, audiences
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
  if (!cred.refresh_token) throw new Error("No refresh_token — reconnect GA4");
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
    const { workspace_id, action, property_id: bodyPropertyId, payload } = body;

    if (!workspace_id || !action) {
      return new Response(JSON.stringify({ error: "workspace_id and action required" }), { status: 400, headers: corsHeaders });
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let credQuery = service.from("ga4_credentials").select("*").eq("workspace_id", workspace_id);
    if (bodyPropertyId) credQuery = credQuery.eq("property_id", bodyPropertyId);
    const { data: cred } = await credQuery.maybeSingle();
    if (!cred) {
      return new Response(JSON.stringify({ error: "GA4 not connected" }), { status: 404, headers: corsHeaders });
    }

    const token = await getValidToken(service, cred);
    const propertyId = bodyPropertyId || cred.property_id;
    const baseUrl = "https://analyticsadmin.googleapis.com/v1beta";

    let endpoint = "";
    let method: "GET" | "POST" | "PATCH" | "DELETE" = "GET";
    let bodyJson: any = undefined;

    switch (action) {
      case "list_account_summaries":
        endpoint = `${baseUrl}/accountSummaries`;
        break;
      case "list_data_streams":
        endpoint = `${baseUrl}/properties/${propertyId}/dataStreams`;
        break;
      case "list_custom_events":
        endpoint = `${baseUrl}/properties/${propertyId}/customDimensions`;
        break;
      case "list_conversion_events":
        endpoint = `${baseUrl}/properties/${propertyId}/conversionEvents`;
        break;
      case "create_conversion_event":
        endpoint = `${baseUrl}/properties/${propertyId}/conversionEvents`;
        method = "POST";
        bodyJson = { eventName: payload?.event_name };
        break;
      case "delete_conversion_event":
        endpoint = `${baseUrl}/properties/${propertyId}/conversionEvents/${payload?.id}`;
        method = "DELETE";
        break;
      case "list_custom_dimensions":
        endpoint = `${baseUrl}/properties/${propertyId}/customDimensions`;
        break;
      case "create_custom_dimension":
        endpoint = `${baseUrl}/properties/${propertyId}/customDimensions`;
        method = "POST";
        bodyJson = {
          parameterName: payload?.parameter_name,
          displayName: payload?.display_name,
          description: payload?.description || "",
          scope: payload?.scope || "EVENT",
        };
        break;
      case "select_property":
        // change current selected property in DB
        await service.from("ga4_credentials").update({
          property_id: payload?.property_id,
          property_name: payload?.property_name,
          measurement_id: payload?.measurement_id,
          status: "connected",
        }).eq("id", cred.id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: corsHeaders });
    }

    const apiRes = await fetch(endpoint, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(bodyJson ? { body: JSON.stringify(bodyJson) } : {}),
    });

    const responseText = await apiRes.text();
    let apiJson: any = {};
    try { apiJson = responseText ? JSON.parse(responseText) : {}; } catch { apiJson = { raw: responseText }; }

    if (!apiRes.ok) {
      console.error("GA4 Admin API error", apiJson);
      return new Response(JSON.stringify({ error: apiJson.error?.message || "Admin API error", details: apiJson }), {
        status: apiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, data: apiJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ga4-admin error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
