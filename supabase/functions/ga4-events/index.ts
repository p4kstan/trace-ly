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
  // Enhanced e-commerce events
  RemoveFromCart: "remove_from_cart",
  ViewCart: "view_cart",
  SelectItem: "select_item",
  ViewItemList: "view_item_list",
  SelectPromotion: "select_promotion",
  ViewPromotion: "view_promotion",
  Refund: "refund",
  AddShippingInfo: "add_shipping_info",
  // Engagement events
  Login: "login",
  Share: "share",
  EarnVirtualCurrency: "earn_virtual_currency",
  SpendVirtualCurrency: "spend_virtual_currency",
  TutorialBegin: "tutorial_begin",
  TutorialComplete: "tutorial_complete",
  LevelUp: "level_up",
  PostScore: "post_score",
  UnlockAchievement: "unlock_achievement",
  JoinGroup: "join_group",
};

interface GA4Event {
  name: string;
  params: Record<string, unknown>;
}

/** Build GA4 event from queue item */
function buildGA4Event(item: any): GA4Event | null {
  const p = item.payload_json;
  if (!p) return null;

  const order = p.order || {};
  const session = p.session || {};
  const userData = p.user_data || {};
  const customData = p.custom_data || {};
  const marketingEvent = p.marketing_event || p.event_name || "Purchase";

  const ga4Event = EVENT_TO_GA4[marketingEvent] || marketingEvent.toLowerCase().replace(/\s+/g, "_");

  const params: Record<string, unknown> = {
    engagement_time_msec: 100,
    session_id: session.session_id || item.event_id || crypto.randomUUID(),
  };

  // Page info
  if (p.page_path) params.page_location = p.event_source_url || p.page_path;
  if (p.page_path) params.page_title = p.page_path;

  // Build items array helper
  const buildItems = () =>
    order.items?.map((i: any, idx: number) => ({
      item_id: String(i.product_id || i.sku || i.product_name || `item_${idx}`),
      item_name: i.product_name || `Item ${idx + 1}`,
      item_brand: i.brand || undefined,
      item_category: i.category || undefined,
      item_variant: i.variant || undefined,
      quantity: i.quantity || 1,
      price: i.unit_price || i.price || 0,
      coupon: i.coupon || undefined,
      discount: i.discount || undefined,
    })) || [];

  // E-commerce events with items + value
  const ecommerceEvents = [
    "purchase", "refund", "begin_checkout", "add_to_cart",
    "remove_from_cart", "view_cart", "add_shipping_info", "add_payment_info",
  ];

  if (ecommerceEvents.includes(ga4Event)) {
    params.value = order.total_value || p.value || 0;
    params.currency = order.currency || p.currency || "BRL";
    params.items = buildItems();

    if (ga4Event === "purchase" || ga4Event === "refund") {
      params.transaction_id = order.external_order_id || order.order_id || crypto.randomUUID();
      params.tax = order.tax || undefined;
      params.shipping = order.shipping || undefined;
      params.coupon = order.coupon || undefined;
    }
  }

  // Lead/sign_up params
  if (ga4Event === "generate_lead" || ga4Event === "sign_up") {
    params.value = order.total_value || p.value || 0;
    params.currency = order.currency || p.currency || "BRL";
    if (ga4Event === "sign_up") params.method = p.method || "email";
  }

  // View item / select item
  if (ga4Event === "view_item" || ga4Event === "select_item") {
    params.items = buildItems();
    params.value = order.total_value || p.value || undefined;
    params.currency = order.currency || p.currency || "BRL";
  }

  // View item list
  if (ga4Event === "view_item_list") {
    params.item_list_id = customData.list_id || undefined;
    params.item_list_name = customData.list_name || undefined;
    params.items = buildItems();
  }

  // Search
  if (ga4Event === "search") {
    params.search_term = customData.search_term || customData.query || p.value || "";
  }

  // Login / share
  if (ga4Event === "login") params.method = customData.method || "email";
  if (ga4Event === "share") {
    params.method = customData.method || undefined;
    params.content_type = customData.content_type || undefined;
    params.item_id = customData.item_id || undefined;
  }

  // UTM / traffic source params
  if (session.utm_source) params.source = session.utm_source;
  if (session.utm_medium) params.medium = session.utm_medium;
  if (session.utm_campaign) params.campaign = session.utm_campaign;
  if (session.utm_content) params.content = session.utm_content;
  if (session.utm_term) params.term = session.utm_term;

  // Custom dimensions (up to 25 custom params allowed by GA4)
  if (customData && typeof customData === "object") {
    const customKeys = Object.keys(customData).slice(0, 25);
    for (const key of customKeys) {
      if (!(key in params)) {
        params[key] = customData[key];
      }
    }
  }

  return { name: ga4Event, params };
}

/** Send events to GA4 Measurement Protocol */
async function sendToGA4(
  measurementId: string,
  apiSecret: string,
  clientId: string,
  events: GA4Event[],
  debug = false,
  userId?: string
): Promise<{ ok: boolean; response: any }> {
  const baseUrl = debug ? GA4_MP_DEBUG_URL : GA4_MP_URL;
  const url = `${baseUrl}?measurement_id=${measurementId}&api_secret=${apiSecret}`;

  const body: Record<string, unknown> = {
    client_id: clientId,
    events,
    timestamp_micros: String(Date.now() * 1000),
  };

  // User ID for cross-device tracking
  if (userId) body.user_id = userId;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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

    // Support both schemas: legacy (destination_id/access_token_encrypted/config_json)
    // and gateway_integrations (public_config_json.measurement_id + credentials_encrypted + settings_json)
    const publicCfg = destination.public_config_json || {};
    const settings = destination.settings_json || destination.config_json || {};
    const measurementId = publicCfg.measurement_id || destination.destination_id;
    const apiSecret = destination.credentials_encrypted || destination.access_token_encrypted;
    const debug = !!settings.debug_mode;
    const sendFromGatewayOnly = !!settings.send_from_gateway_only;

    // Filter: only send events originating from gateway webhooks if configured
    const filteredItems = sendFromGatewayOnly
      ? items.filter((it: any) => {
          const src = it.payload_json?.source || it.source;
          return src === "gateway" || src === "webhook" || it.payload_json?.gateway;
        })
      : items;

    if (sendFromGatewayOnly && filteredItems.length === 0) {
      return new Response(JSON.stringify({ status: "ok", delivered: 0, skipped: items.length, reason: "no gateway events" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!measurementId || !apiSecret) {
      return new Response(JSON.stringify({ error: "Missing GA4 credentials (measurement_id or api_secret)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate measurement_id format
    if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
      return new Response(JSON.stringify({ error: "Invalid measurement_id format. Expected G-XXXXXXXXXX" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MAX_BATCH = 25;
    let totalDelivered = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const debugValidation: any[] = [];

    // Group events by client_id
    const eventsByClient = new Map<string, { ga4Events: GA4Event[]; queueItems: any[]; userId?: string }>();

    for (const item of filteredItems) {
      const evt = buildGA4Event(item);
      if (!evt) { totalSkipped++; continue; }

      const clientId = item.payload_json?.identity_id ||
                       item.payload_json?.session?.client_id ||
                       item.payload_json?.anonymous_id ||
                       item.payload_json?.fingerprint ||
                       crypto.randomUUID();

      const userId = item.payload_json?.user_data?.external_id ||
                     item.payload_json?.user_data?.email;

      if (!eventsByClient.has(clientId)) {
        eventsByClient.set(clientId, { ga4Events: [], queueItems: [], userId });
      }
      eventsByClient.get(clientId)!.ga4Events.push(evt);
      eventsByClient.get(clientId)!.queueItems.push(item);
    }

    // Send per client_id in batches of 25
    for (const [clientId, { ga4Events, queueItems, userId }] of eventsByClient) {
      for (let i = 0; i < ga4Events.length; i += MAX_BATCH) {
        const batch = ga4Events.slice(i, i + MAX_BATCH);
        const batchItems = queueItems.slice(i, i + MAX_BATCH);

        const result = await sendToGA4(measurementId, apiSecret, clientId, batch, debug, userId);

        if (debug && result.response) {
          debugValidation.push(result.response);
        }

        await supabase.from("event_deliveries").insert({
          event_id: batchItems[0]?.event_id || crypto.randomUUID(),
          workspace_id: batchItems[0]?.workspace_id,
          provider: "ga4",
          destination: measurementId,
          status: result.ok ? "delivered" : "failed",
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
          request_json: {
            measurement_id: measurementId,
            batch_size: batch.length,
            client_id: clientId,
            event_names: batch.map(e => e.name),
          },
          response_json: result.response,
          error_message: result.ok ? null : JSON.stringify(result.response),
        });

        if (result.ok) totalDelivered += batch.length;
        else totalFailed += batch.length;
      }
    }

    const responseBody: Record<string, unknown> = {
      status: totalFailed === 0 ? "ok" : "partial",
      delivered: totalDelivered,
      failed: totalFailed,
      skipped: totalSkipped,
    };

    if (debug && debugValidation.length > 0) {
      responseBody.debug_validation = debugValidation;
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("GA4 Measurement Protocol error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
