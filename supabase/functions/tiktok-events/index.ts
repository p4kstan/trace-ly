import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

// ── Event name mapping: internal → TikTok standard events ──
const EVENT_TO_TIKTOK: Record<string, string> = {
  Purchase: "CompletePayment",
  Lead: "SubmitForm",
  Subscribe: "Subscribe",
  InitiateCheckout: "InitiateCheckout",
  AddPaymentInfo: "AddPaymentInfo",
  AddToCart: "AddToCart",
  ViewContent: "ViewContent",
  CompleteRegistration: "CompleteRegistration",
  Search: "Search",
  Contact: "Contact",
  AddToWishlist: "AddToWishlist",
  PageView: "Pageview",
};

interface TikTokEvent {
  event: string;
  event_time: number;
  event_id: string;
  user: {
    email?: string[];
    phone?: string[];
    external_id?: string;
    ip?: string;
    user_agent?: string;
    ttp?: string; // TikTok click ID cookie
    ttclid?: string; // TikTok click ID from URL
  };
  properties: {
    contents?: Array<{ content_id?: string; quantity?: number; price?: number }>;
    value?: number;
    currency?: string;
    order_id?: string;
    content_type?: string;
  };
  page?: {
    url?: string;
    referrer?: string;
  };
}

/** Build TikTok event from queue item */
function buildTikTokEvent(item: any): TikTokEvent | null {
  const p = item.payload_json;
  const customer = p.customer || {};
  const session = p.session || {};
  const order = p.order || {};
  const marketingEvent = p.marketing_event || "Purchase";

  const tiktokEvent = EVENT_TO_TIKTOK[marketingEvent];
  if (!tiktokEvent) return null;

  const user: TikTokEvent["user"] = {};
  if (customer.email_hash) user.email = [customer.email_hash];
  if (customer.phone_hash) user.phone = [customer.phone_hash];
  if (p.identity_id) user.external_id = p.identity_id;
  if (session.ip_hash) user.ip = session.ip_hash;
  if (session.user_agent) user.user_agent = session.user_agent;
  if (session.ttp) user.ttp = session.ttp;
  if (session.ttclid) user.ttclid = session.ttclid;

  return {
    event: tiktokEvent,
    event_time: Math.floor(new Date(item.created_at).getTime() / 1000),
    event_id: item.event_id || crypto.randomUUID(),
    user,
    properties: {
      value: order.total_value,
      currency: order.currency || "BRL",
      order_id: order.external_order_id,
      content_type: "product",
      contents: order.items?.map((i: any) => ({
        content_id: String(i.product_id || i.product_name || "item"),
        quantity: i.quantity || 1,
        price: i.unit_price,
      })),
    },
    page: {
      url: session.landing_page,
      referrer: session.referrer,
    },
  };
}

/** Send events batch to TikTok Events API */
async function sendToTikTok(
  pixelCode: string,
  accessToken: string,
  events: TikTokEvent[],
  testEventCode?: string
): Promise<{ ok: boolean; response: any }> {
  const url = `${TIKTOK_API_BASE}/event/track/`;

  const body: Record<string, unknown> = {
    pixel_code: pixelCode,
    event_source: "web",
    event_source_id: pixelCode,
    data: events,
  };
  if (testEventCode) body.test_event_code = testEventCode;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Token": accessToken,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { ok: res.ok && data.code === 0, response: data };
}

/**
 * TikTok Events API Dispatcher
 * POST /tiktok-events
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

    const pixelCode = destination.destination_id;
    const accessToken = destination.access_token_encrypted;
    const testEventCode = destination.test_event_code;

    if (!pixelCode || !accessToken) {
      return new Response(JSON.stringify({ error: "Missing TikTok credentials" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build events
    const tiktokEvents: TikTokEvent[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      const evt = buildTikTokEvent(item);
      if (evt) {
        tiktokEvents.push(evt);
      } else {
        skipped.push(item.id);
      }
    }

    if (tiktokEvents.length === 0) {
      return new Response(JSON.stringify({
        status: "ok", delivered: 0, skipped: skipped.length,
        message: "No events mapped to TikTok standard events",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // TikTok allows up to 1000 events per batch
    const BATCH_SIZE = 1000;
    let totalDelivered = 0;
    let totalFailed = 0;

    for (let i = 0; i < tiktokEvents.length; i += BATCH_SIZE) {
      const batch = tiktokEvents.slice(i, i + BATCH_SIZE);
      const result = await sendToTikTok(pixelCode, accessToken, batch, testEventCode);

      await supabase.from("event_deliveries").insert({
        event_id: items[i]?.event_id || crypto.randomUUID(),
        workspace_id: items[0]?.workspace_id,
        provider: "tiktok",
        destination: pixelCode,
        status: result.ok ? "delivered" : "failed",
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        request_json: { pixel_code: pixelCode, batch_size: batch.length },
        response_json: result.response,
        error_message: result.ok ? null : JSON.stringify(result.response),
      });

      if (result.ok) totalDelivered += batch.length;
      else totalFailed += batch.length;
    }

    return new Response(JSON.stringify({
      status: totalFailed === 0 ? "ok" : "partial",
      delivered: totalDelivered,
      failed: totalFailed,
      skipped: skipped.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("TikTok Events API error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
