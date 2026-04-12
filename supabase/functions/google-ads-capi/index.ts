import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GOOGLE_ADS_API_VERSION = "v17";

// ── Event name mapping: internal → Google Ads conversion action ──
const EVENT_TO_GOOGLE: Record<string, string> = {
  Purchase: "purchase",
  Lead: "lead",
  Subscribe: "subscribe",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  AddToCart: "add_to_cart",
  ViewContent: "page_view",
  CompleteRegistration: "sign_up",
  Search: "search",
  Contact: "contact",
};

interface GoogleConversionPayload {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  conversion_action: string;
  conversion_date_time: string;
  conversion_value?: number;
  currency_code?: string;
  order_id?: string;
  user_identifiers?: Array<{
    hashed_email?: string;
    hashed_phone_number?: string;
  }>;
}

/** Build Google Ads offline conversion from queue item */
function buildGoogleConversion(item: any, conversionActionId: string): GoogleConversionPayload | null {
  const p = item.payload_json;
  const customer = p.customer || {};
  const session = p.session || {};
  const order = p.order || {};

  // Google Ads requires at least gclid OR user identifiers
  const gclid = session.gclid || p.gclid;
  const gbraid = session.gbraid;
  const wbraid = session.wbraid;

  const userIdentifiers: Array<{ hashed_email?: string; hashed_phone_number?: string }> = [];
  if (customer.email_hash) userIdentifiers.push({ hashed_email: customer.email_hash });
  if (customer.phone_hash) userIdentifiers.push({ hashed_phone_number: customer.phone_hash });

  if (!gclid && !gbraid && !wbraid && userIdentifiers.length === 0) {
    return null; // Can't match without identifiers
  }

  const eventTime = new Date(item.created_at);
  const tzOffset = "+00:00";
  const formattedDate = eventTime.toISOString().replace("T", " ").replace("Z", tzOffset);

  return {
    gclid,
    gbraid,
    wbraid,
    conversion_action: `customers/${conversionActionId}`,
    conversion_date_time: formattedDate,
    conversion_value: order.total_value || 0,
    currency_code: order.currency || "BRL",
    order_id: order.external_order_id,
    user_identifiers: userIdentifiers.length > 0 ? userIdentifiers : undefined,
  };
}

/** Send conversions to Google Ads API */
async function sendToGoogleAds(
  customerId: string,
  accessToken: string,
  developerToken: string,
  conversions: GoogleConversionPayload[]
): Promise<{ ok: boolean; response: any }> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`;

  const body = {
    conversions,
    partial_failure: true, // Don't fail entire batch on individual errors
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { ok: res.ok, response: data };
}

/**
 * Google Ads Offline Conversions Dispatcher
 * POST /google-ads-capi
 * Body: { items: QueueItem[], destination: IntegrationDestination }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { items, destination } = await req.json();

    if (!items?.length || !destination) {
      return new Response(JSON.stringify({ error: "Missing items or destination" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = destination.config_json || {};
    const customerId = config.customer_id;
    const developerToken = config.developer_token;
    const accessToken = destination.access_token_encrypted;
    const conversionActionId = destination.destination_id;

    if (!customerId || !accessToken || !developerToken) {
      return new Response(JSON.stringify({ error: "Missing Google Ads credentials" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build conversions
    const conversions: GoogleConversionPayload[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      const conv = buildGoogleConversion(item, conversionActionId);
      if (conv) {
        conversions.push(conv);
      } else {
        skipped.push(item.id);
      }
    }

    if (conversions.length === 0) {
      return new Response(JSON.stringify({
        status: "ok", delivered: 0, skipped: skipped.length,
        message: "No conversions with valid identifiers (gclid/email/phone)",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Send batch (Google Ads supports up to 2000 per request)
    const result = await sendToGoogleAds(customerId, accessToken, developerToken, conversions);

    // Log delivery
    await supabase.from("event_deliveries").insert({
      event_id: items[0]?.event_id || crypto.randomUUID(),
      workspace_id: items[0]?.workspace_id,
      provider: "google_ads",
      destination: conversionActionId,
      status: result.ok ? "delivered" : "failed",
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
      request_json: { customer_id: customerId, batch_size: conversions.length },
      response_json: result.response,
      error_message: result.ok ? null : JSON.stringify(result.response),
    });

    return new Response(JSON.stringify({
      status: result.ok ? "ok" : "error",
      delivered: result.ok ? conversions.length : 0,
      failed: result.ok ? 0 : conversions.length,
      skipped: skipped.length,
      response: result.response,
    }), { status: result.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Google Ads CAPI error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
