// GTM Server-Side bridge: receives events from sGTM and forwards to /track
// Validates with public API key (X-Api-Key) and normalizes payloads from GA4/gtag format.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// GA4 → CapiTrack mapping (server-side equivalent)
const GA4_MAP: Record<string, string> = {
  page_view: "PageView",
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "Purchase",
  generate_lead: "Lead",
  sign_up: "CompleteRegistration",
  login: "Login",
  search: "Search",
};

function mapEvent(name: string, params: any) {
  const ctName = GA4_MAP[name] || name;
  const data: any = {};
  if (params) {
    if (params.value != null) data.value = Number(params.value);
    if (params.currency) data.currency = String(params.currency);
    if (params.transaction_id) data.order_id = params.transaction_id;
    if (params.email) data.email = params.email;
    if (params.phone_number || params.phone) data.phone = params.phone_number || params.phone;
    if (Array.isArray(params.items)) {
      data.num_items = params.items.length;
      data.content_ids = params.items.map((i: any) => i.item_id || i.id).filter(Boolean);
      if (params.items[0]) data.content_name = params.items[0].item_name || params.items[0].name;
    }
    for (const k in params) {
      if (!(k in data) && !["items", "send_to", "event_name"].includes(k)) data[k] = params[k];
    }
  }
  return { event_name: ctName, ...data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing x-api-key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Accept both GA4-style ({ event_name, params }) and CapiTrack-style payloads
    const eventName = body.event_name || body.name;
    if (!eventName) {
      return new Response(JSON.stringify({ error: "event_name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = body.params || body.event_params || body;
    const mapped = mapEvent(eventName, params);

    // Forward to /track
    const trackPayload = {
      ...mapped,
      event_id: body.event_id || body.eventId || crypto.randomUUID(),
      source: "gtm-server",
      action_source: body.action_source || "website",
      url: body.page_location || body.url,
      page_path: body.page_path,
      referrer: body.page_referrer || body.referrer,
      utm_source: body.utm_source || params?.campaign_source,
      utm_medium: body.utm_medium || params?.campaign_medium,
      utm_campaign: body.utm_campaign || params?.campaign_name,
      utm_content: body.utm_content,
      utm_term: body.utm_term,
      gclid: body.gclid != null ? String(body.gclid).trim() : (params?.gclid != null ? String(params.gclid).trim() : undefined),
      gbraid: body.gbraid != null ? String(body.gbraid).trim() : (params?.gbraid != null ? String(params.gbraid).trim() : undefined),
      wbraid: body.wbraid != null ? String(body.wbraid).trim() : (params?.wbraid != null ? String(params.wbraid).trim() : undefined),
      fbclid: body.fbclid,
      fbp: body.fbp || body._fbp,
      fbc: body.fbc || body._fbc,
      ga_client_id: body.client_id || body.ga_client_id,
      user_data: body.user_data || (body.user_properties ? body.user_properties : undefined),
      user_data_hashed: body.user_data_hashed,
    };

    const trackUrl = `${SUPABASE_URL}/functions/v1/track`;
    const upstream = await fetch(trackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        // Forward IP/UA so /track sees the real client
        "x-forwarded-for": req.headers.get("x-forwarded-for") || "",
        "user-agent": req.headers.get("user-agent") || "",
      },
      body: JSON.stringify(trackPayload),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("gtm-server-events error:", err);
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
