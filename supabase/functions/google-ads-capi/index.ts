import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GOOGLE_ADS_API_VERSION = "v21";
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;

interface GoogleUserAddressInfo {
  hashed_first_name?: string;
  hashed_last_name?: string;
  hashed_street_address?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country_code?: string;
}

interface GoogleUserIdentifier {
  hashed_email?: string;
  hashed_phone_number?: string;
  address_info?: GoogleUserAddressInfo;
}

interface GoogleConversionPayload {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  conversion_action: string;
  conversion_date_time: string;
  conversion_value?: number;
  currency_code?: string;
  order_id?: string;
  user_identifiers?: GoogleUserIdentifier[];
  user_agent?: string;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Refresh Google OAuth access token using refresh_token */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("[google-ads-capi] refresh failed:", res.status, txt.slice(0, 300));
    return null;
  }
  const data = await res.json();
  return data.access_token || null;
}

/** Build Google Ads offline conversion from queue item (normalized payload).
 * Enhanced Conversions: combines email + phone + full address_info for max match-rate. */
async function buildGoogleConversion(
  item: any,
  customerId: string,
  conversionLabel: string,
): Promise<GoogleConversionPayload | null> {
  const p = item.payload_json || {};
  const customer = p.customer || {};
  const session = p.session || {};
  const order = p.order || {};

  const gclid = session.gclid || p.gclid;
  const gbraid = session.gbraid;
  const wbraid = session.wbraid;

  // Prefer pre-hashed PII; fallback to raw with on-the-fly hashing
  const emailHash: string | undefined =
    customer.email_hash
    || (customer.email ? await sha256Hex(String(customer.email)) : undefined);
  const phoneHash: string | undefined =
    customer.phone_hash
    || (customer.phone ? await sha256Hex(String(customer.phone).replace(/[^\d+]/g, "")) : undefined);
  const firstNameHash: string | undefined =
    customer.first_name_hash
    || (customer.first_name ? await sha256Hex(String(customer.first_name)) : undefined);
  const lastNameHash: string | undefined =
    customer.last_name_hash
    || (customer.last_name ? await sha256Hex(String(customer.last_name)) : undefined);
  const streetHash: string | undefined =
    customer.address ? await sha256Hex(String(customer.address)) : undefined;

  // Build address_info block — Google requires either hashed_first_name+hashed_last_name
  // OR hashed_street_address along with city/region/postal/country to count as a match.
  const addressInfo: GoogleUserAddressInfo = {};
  if (firstNameHash) addressInfo.hashed_first_name = firstNameHash;
  if (lastNameHash) addressInfo.hashed_last_name = lastNameHash;
  if (streetHash) addressInfo.hashed_street_address = streetHash;
  if (customer.city) addressInfo.city = String(customer.city).toLowerCase().trim();
  if (customer.state) addressInfo.region = String(customer.state).toLowerCase().trim();
  if (customer.zip) addressInfo.postal_code = String(customer.zip).replace(/\s+/g, "").toLowerCase();
  if (customer.country) addressInfo.country_code = String(customer.country).toUpperCase().slice(0, 2);

  const userIdentifiers: GoogleUserIdentifier[] = [];
  if (emailHash) userIdentifiers.push({ hashed_email: emailHash });
  if (phoneHash) userIdentifiers.push({ hashed_phone_number: phoneHash });
  if (Object.keys(addressInfo).length > 0) userIdentifiers.push({ address_info: addressInfo });

  if (!gclid && !gbraid && !wbraid && userIdentifiers.length === 0) {
    return null;
  }

  const eventTime = new Date(p.event_time || item.created_at || Date.now());
  const formattedDate = eventTime.toISOString().replace("T", " ").replace("Z", "+00:00");

  return {
    gclid,
    gbraid,
    wbraid,
    conversion_action: `customers/${customerId}/conversionActions/${conversionLabel}`,
    conversion_date_time: formattedDate,
    conversion_value: order.total_value || 0,
    currency_code: order.currency || "BRL",
    order_id: order.external_order_id,
    user_identifiers: userIdentifiers.length > 0 ? userIdentifiers : undefined,
  };
}

async function sendToGoogleAds(
  customerId: string,
  loginCustomerId: string | null,
  accessToken: string,
  developerToken: string,
  conversions: GoogleConversionPayload[]
): Promise<{ ok: boolean; status: number; response: any }> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  console.log(`[google-ads-capi] POST ${url} | login-customer-id=${loginCustomerId || "none"} | dev-token-len=${developerToken.length} | token-prefix=${accessToken.slice(0,10)}...`);
  console.log(`[google-ads-capi] body=${JSON.stringify({ conversions, partial_failure: true }).slice(0,500)}`);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ conversions, partial_failure: true }),
  });

  // Read as text first to handle non-JSON error pages
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 500) }; }

  return { ok: res.ok, status: res.status, response: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { items, destination, workspace_id } = body;

    if (!items?.length || !destination) {
      return new Response(JSON.stringify({ error: "Missing items or destination" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wsId = workspace_id || items[0]?.workspace_id;
    if (!wsId) {
      return new Response(JSON.stringify({ error: "Missing workspace_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Resolve credentials: prefer fresh credentials from google_ads_credentials ──
    const config = destination.config_json || {};
    const customerId = String(config.customer_id || "").replace(/\D/g, "");
    // Google Ads expects the conversion action's NUMERIC ID, not the label string.
    // Prefer config.conversion_action_id, fall back to destination.destination_id (which is numeric in our setup).
    const conversionActionId = String(
      config.conversion_action_id || destination.destination_id || ""
    ).replace(/\D/g, "");
    const conversionLabel = conversionActionId; // keep var name used downstream

    const { data: creds, error: credsErr } = await supabase
      .from("google_ads_credentials")
      .select("refresh_token, access_token, token_expires_at, customer_id, login_customer_id, developer_token")
      .eq("workspace_id", wsId)
      .eq("status", "connected")
      .or(`is_default.eq.true,customer_id.eq.${customerId}`)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsErr || !creds || !creds.refresh_token) {
      console.error("[google-ads-capi] no credentials:", credsErr, creds);
      return new Response(JSON.stringify({ error: "No Google Ads credentials connected for this workspace" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh access token (always — they expire in 1h and we don't track expiry reliably)
    const accessToken = await refreshAccessToken(creds.refresh_token);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Failed to refresh Google Ads access token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const developerToken = creds.developer_token || GOOGLE_ADS_DEVELOPER_TOKEN;
    const finalCustomerId = customerId || String(creds.customer_id || "").replace(/\D/g, "");
    const loginCustomerId = creds.login_customer_id ? String(creds.login_customer_id).replace(/\D/g, "") : null;

    if (!finalCustomerId || !developerToken || !conversionLabel) {
      return new Response(JSON.stringify({
        error: "Missing required: customer_id, developer_token, conversion_label",
        debug: { customerId: !!finalCustomerId, developerToken: !!developerToken, conversionLabel: !!conversionLabel },
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build conversions
    const conversions: GoogleConversionPayload[] = [];
    const skipped: string[] = [];
    for (const item of items) {
      const conv = await buildGoogleConversion(item, finalCustomerId, conversionLabel);
      if (conv) conversions.push(conv);
      else skipped.push(item.id || item.event_id || "unknown");
    }

    if (conversions.length === 0) {
      // Não-erro: simplesmente não há identifier suficiente (gclid/email/phone/address).
      // Sinalizamos `skipped: true` + status 200 para o worker NÃO retentar nem mover
      // para dead_letter. Esses eventos ficam visíveis em event_deliveries com
      // status="skipped_no_identity" para análise.
      await supabase.from("event_deliveries").insert({
        event_id: items[0]?.event_id || crypto.randomUUID(),
        workspace_id: wsId,
        provider: "google_ads",
        destination: `customers/${finalCustomerId}/conversionActions/${conversionLabel}`,
        status: "skipped_no_identity",
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        request_json: { batch_size: items.length, reason: "no_gclid_or_pii" },
        response_json: { skipped_ids: skipped },
        error_message: null,
      });
      return new Response(JSON.stringify({
        status: "ok", skipped: true, delivered: 0, skipped_count: skipped.length,
        message: "No conversions with valid identifiers (gclid/gbraid/wbraid/email/phone). Marked as skipped_no_identity (no retry).",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await sendToGoogleAds(finalCustomerId, loginCustomerId, accessToken, developerToken, conversions);

    // Log delivery
    await supabase.from("event_deliveries").insert({
      event_id: items[0]?.event_id || crypto.randomUUID(),
      workspace_id: wsId,
      provider: "google_ads",
      destination: `customers/${finalCustomerId}/conversionActions/${conversionLabel}`,
      status: result.ok ? "delivered" : "failed",
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
      request_json: { customer_id: finalCustomerId, batch_size: conversions.length, conversion_label: conversionLabel },
      response_json: result.response,
      error_message: result.ok ? null : JSON.stringify(result.response).slice(0, 1000),
    });

    return new Response(JSON.stringify({
      status: result.ok ? "ok" : "error",
      http_status: result.status,
      delivered: result.ok ? conversions.length : 0,
      failed: result.ok ? 0 : conversions.length,
      skipped: skipped.length,
      response: result.response,
    }), { status: result.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Google Ads CAPI error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
