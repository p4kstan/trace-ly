import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GA4_MP_URL = "https://www.google-analytics.com/mp/collect";
const GA4_MP_DEBUG_URL = "https://www.google-analytics.com/debug/mp/collect";

// ── Event name mapping: internal → GA4 recommended events ──
const EVENT_TO_GA4: Record<string, string> = {
  Purchase: "purchase",
  Lead: "generate_lead",
  Subscribe: "sign_up",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  AddToCart: "add_to_cart",
  ViewContent: "view_item",
  CompleteRegistration: "sign_up",
  Search: "search",
  Contact: "generate_lead",
  AddToWishlist: "add_to_wishlist",
  PageView: "page_view",
};

interface GA4Event {
  name: string;
  params: Record<string, unknown>;
}

/** Build GA4 event from queue item */
function buildGA4Event(item: any): GA4Event | null {
  const p = item.payload_json;
  const order = p.order || {};
  const session = p.session || {};
  const marketingEvent = p.marketing_event || "Purchase";

  const ga4Event = EVENT_TO_GA4[marketingEvent];
  if (!ga4Event) return null;

  const params: Record<string, unknown> = {
    engagement_time_msec: 100,
    session_id: item.event_id || crypto.randomUUID(),
  };

  // Purchase-specific params
  if (ga4Event === "purchase") {
    params.transaction_id = order.external_order_id || crypto.randomUUID();
    params.value = order.total_value || 0;
    params.currency = order.currency || "BRL";
    params.items = order.items?.map((i: any, idx: number) => ({
      item_id: String(i.product_id || i.product_name || `item_${idx}`),
      item_name: i.product_name || `Item ${idx + 1}`,
      quantity: i.quantity || 1,
      price: i.unit_price || 0,
    })) || [];
  }

  // Lead/sign_up params
  if (ga4Event === "generate_lead" || ga4Event === "sign_up") {
    params.value = order.total_value || 0;
    params.currency = order.currency || "BRL";
  }

  // Checkout params
  if (ga4Event === "begin_checkout" || ga4Event === "add_to_cart") {
    params.value = order.total_value || 0;
    params.currency = order.currency || "BRL";
    params.items = order.items?.map((i: any, idx: number) => ({
      item_id: String(i.product_id || i.product_name || `item_${idx}`),
      item_name: i.product_name || `Item ${idx + 1}`,
      quantity: i.quantity || 1,
      price: i.unit_price || 0,
    })) || [];
  }

  // UTM params
  if (session.utm_source) params.source = session.utm_source;
  if (session.utm_medium) params.medium = session.utm_medium;
  if (session.utm_campaign) params.campaign = session.utm_campaign;

  return { name: ga4Event, params };
}

/** Send events to GA4 Measurement Protocol */
async function sendToGA4(
  measurementId: string,
  apiSecret: string,
  clientId: string,
  events: GA4Event[],
  debug = false
): Promise<{ ok: boolean; response: any }> {
  const baseUrl = debug ? GA4_MP_DEBUG_URL : GA4_MP_URL;
  const url = `${baseUrl}?measurement_id=${measurementId}&api_secret=${apiSecret}`;

  const body = {
    client_id: clientId,
    events,
    timestamp_micros: String(Date.now() * 1000),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // GA4 MP returns 204 on success (no body) or 200 with validation in debug mode
  if (debug) {
    const data = await res.json();
    return { ok: res.ok, response: data };
  }

  const text = await res.text();
  return { ok: res.status === 204 || res.ok, response: { status: res.status, body: text } };
}

/**
 * GA4 Measurement Protocol Dispatcher
 * POST /ga4-events
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

    const measurementId = destination.destination_id; // G-XXXXXXXXXX
    const apiSecret = destination.access_token_encrypted;
    const config = destination.config_json || {};
    const debug = !!config.debug_mode;

    if (!measurementId || !apiSecret) {
      return new Response(JSON.stringify({ error: "Missing GA4 credentials" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GA4 MP supports max 25 events per request
    const MAX_BATCH = 25;
    let totalDelivered = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    // Group events by client_id (identity_id or fallback)
    const eventsByClient = new Map<string, { ga4Events: GA4Event[]; queueItems: any[] }>();

    for (const item of items) {
      const evt = buildGA4Event(item);
      if (!evt) { totalSkipped++; continue; }

      const clientId = item.payload_json?.identity_id || 
                       item.payload_json?.session?.client_id || 
                       crypto.randomUUID();
      
      if (!eventsByClient.has(clientId)) {
        eventsByClient.set(clientId, { ga4Events: [], queueItems: [] });
      }
      eventsByClient.get(clientId)!.ga4Events.push(evt);
      eventsByClient.get(clientId)!.queueItems.push(item);
    }

    // Send per client_id in batches of 25
    for (const [clientId, { ga4Events, queueItems }] of eventsByClient) {
      for (let i = 0; i < ga4Events.length; i += MAX_BATCH) {
        const batch = ga4Events.slice(i, i + MAX_BATCH);
        const batchItems = queueItems.slice(i, i + MAX_BATCH);

        const result = await sendToGA4(measurementId, apiSecret, clientId, batch, debug);

        await supabase.from("event_deliveries").insert({
          event_id: batchItems[0]?.event_id || crypto.randomUUID(),
          workspace_id: batchItems[0]?.workspace_id,
          provider: "ga4",
          destination: measurementId,
          status: result.ok ? "delivered" : "failed",
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
          request_json: { measurement_id: measurementId, batch_size: batch.length, client_id: clientId },
          response_json: result.response,
          error_message: result.ok ? null : JSON.stringify(result.response),
        });

        if (result.ok) totalDelivered += batch.length;
        else totalFailed += batch.length;
      }
    }

    return new Response(JSON.stringify({
      status: totalFailed === 0 ? "ok" : "partial",
      delivered: totalDelivered,
      failed: totalFailed,
      skipped: totalSkipped,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("GA4 Measurement Protocol error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
