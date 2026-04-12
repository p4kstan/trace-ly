import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Default event mappings
const DEFAULT_MAPPINGS: Record<string, Record<string, string>> = {
  stripe: {
    "checkout.session.completed": "Purchase",
    "payment_intent.succeeded": "Purchase",
    "customer.subscription.created": "Subscribe",
    "customer.subscription.updated": "subscription_renewed",
    "customer.subscription.deleted": "subscription_canceled",
    "charge.refunded": "order_refunded",
    "charge.dispute.created": "order_chargeback",
  },
  mercadopago: {
    "payment.approved": "Purchase",
    "payment.created": "order_created",
    "payment.refunded": "order_refunded",
    "payment.cancelled": "order_refused",
  },
  pagarme: {
    "order.paid": "Purchase",
    "order.created": "order_created",
    "order.refunded": "order_refunded",
    "order.canceled": "order_refused",
    "charge.paid": "order_paid",
  },
  asaas: {
    PAYMENT_CONFIRMED: "Purchase",
    PAYMENT_RECEIVED: "Purchase",
    PAYMENT_CREATED: "order_created",
    PAYMENT_REFUNDED: "order_refunded",
    PAYMENT_OVERDUE: "order_refused",
    PAYMENT_DELETED: "order_refused",
  },
  hotmart: {
    PURCHASE_COMPLETE: "Purchase",
    PURCHASE_APPROVED: "Purchase",
    PURCHASE_REFUNDED: "order_refunded",
    PURCHASE_CHARGEBACK: "order_chargeback",
    PURCHASE_CANCELED: "order_refused",
  },
  generic: {
    order_paid: "Purchase",
    order_created: "InitiateCheckout",
    lead_created: "Lead",
    payment_approved: "Purchase",
    payment_refused: "order_refused",
    payment_refunded: "order_refunded",
  },
};

// Marketing events that should be forwarded to Meta
const META_EVENTS = new Set([
  "PageView","ViewContent","AddToCart","InitiateCheckout","AddPaymentInfo",
  "Purchase","Lead","CompleteRegistration","Search","AddToWishlist",
  "Contact","Subscribe","StartTrial","SubmitApplication","CustomizeProduct",
  "Schedule","Donate","FindLocation",
]);

interface NormalizedOrder {
  gateway: string;
  gateway_order_id: string;
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_document?: string;
  status: string;
  total_value?: number;
  currency?: string;
  payment_method?: string;
  items?: Array<{ product_id?: string; product_name?: string; category?: string; quantity: number; unit_price?: number; total_price?: number }>;
  gateway_payment_id?: string;
  raw_payload: unknown;
}

function normalizeStripe(payload: Record<string, unknown>): NormalizedOrder {
  const obj = (payload.data as Record<string, unknown>)?.object as Record<string, unknown> || {};
  const customer = (obj.customer_details || obj.customer || {}) as Record<string, unknown>;
  return {
    gateway: "stripe",
    gateway_order_id: String(obj.id || obj.payment_intent || ""),
    customer_email: String(customer.email || obj.receipt_email || ""),
    customer_name: String(customer.name || ""),
    status: String(obj.status || obj.payment_status || "unknown"),
    total_value: Number(obj.amount_total || obj.amount || 0) / 100,
    currency: String(obj.currency || "usd").toUpperCase(),
    payment_method: String(obj.payment_method_types?.[0] || "card"),
    gateway_payment_id: String(obj.payment_intent || obj.id || ""),
    raw_payload: payload,
  };
}

function normalizeMercadoPago(payload: Record<string, unknown>): NormalizedOrder {
  const data = (payload.data as Record<string, unknown>) || {};
  return {
    gateway: "mercadopago",
    gateway_order_id: String(data.id || payload.id || ""),
    status: String(payload.action || "unknown"),
    total_value: Number(data.transaction_amount || 0),
    currency: String(data.currency_id || "BRL"),
    payment_method: String((data.payment_method as Record<string, unknown>)?.type || ""),
    gateway_payment_id: String(data.id || ""),
    raw_payload: payload,
  };
}

function normalizeGeneric(provider: string, payload: Record<string, unknown>): NormalizedOrder {
  return {
    gateway: provider,
    gateway_order_id: String(payload.order_id || payload.id || payload.transaction_id || ""),
    customer_email: String(payload.email || (payload.customer as Record<string, unknown>)?.email || ""),
    customer_name: String(payload.name || (payload.customer as Record<string, unknown>)?.name || ""),
    customer_phone: String(payload.phone || (payload.customer as Record<string, unknown>)?.phone || ""),
    status: String(payload.status || payload.event || "unknown"),
    total_value: Number(payload.amount || payload.value || payload.total || 0),
    currency: String(payload.currency || "BRL"),
    payment_method: String(payload.payment_method || payload.method || ""),
    gateway_payment_id: String(payload.payment_id || payload.id || ""),
    raw_payload: payload,
  };
}

function normalizePayload(provider: string, payload: Record<string, unknown>): NormalizedOrder {
  switch (provider) {
    case "stripe": return normalizeStripe(payload);
    case "mercadopago": return normalizeMercadoPago(payload);
    default: return normalizeGeneric(provider, payload);
  }
}

function extractEventType(provider: string, payload: Record<string, unknown>): string {
  switch (provider) {
    case "stripe": return String(payload.type || "unknown");
    case "mercadopago": return String(payload.action || payload.type || "unknown");
    case "asaas": return String(payload.event || "unknown");
    case "hotmart": return String(payload.event || "unknown");
    case "pagarme": return String(payload.type || "unknown");
    default: return String(payload.event || payload.type || payload.action || "unknown");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") || "generic";
    const workspaceId = url.searchParams.get("workspace_id");

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspace_id query param required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = await req.json();
    const eventType = extractEventType(provider, payload);

    // Log webhook
    const { data: webhookLog } = await supabase.from("webhook_logs").insert({
      workspace_id: workspaceId,
      gateway: provider,
      event_type: eventType,
      signature_valid: true, // TODO: per-provider signature validation
      payload_json: payload,
      processing_status: "processing",
    }).select("id").single();

    // Normalize order data
    const order = normalizePayload(provider, payload);

    // Get event mapping (custom or default)
    const { data: customMapping } = await supabase
      .from("event_mappings")
      .select("marketing_event")
      .eq("workspace_id", workspaceId)
      .eq("gateway", provider)
      .eq("gateway_event", eventType)
      .eq("is_active", true)
      .limit(1)
      .single();

    const marketingEvent = customMapping?.marketing_event
      || DEFAULT_MAPPINGS[provider]?.[eventType]
      || DEFAULT_MAPPINGS.generic[eventType]
      || null;

    // Upsert order
    const { data: savedOrder } = await supabase.from("orders").insert({
      workspace_id: workspaceId,
      gateway: order.gateway,
      gateway_order_id: order.gateway_order_id,
      customer_email: order.customer_email,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_document: order.customer_document,
      status: order.status,
      total_value: order.total_value,
      currency: order.currency,
      payment_method: order.payment_method,
    }).select("id").single();

    // Insert payment
    await supabase.from("payments").insert({
      workspace_id: workspaceId,
      order_id: savedOrder?.id,
      gateway: order.gateway,
      gateway_payment_id: order.gateway_payment_id,
      payment_method: order.payment_method,
      status: order.status,
      amount: order.total_value,
      currency: order.currency,
      paid_at: marketingEvent === "Purchase" ? new Date().toISOString() : null,
      raw_payload_json: order.raw_payload,
    });

    // Insert order items
    if (order.items?.length) {
      await supabase.from("order_items").insert(
        order.items.map(item => ({ order_id: savedOrder?.id, ...item }))
      );
    }

    // Reconcile: try to find session by email
    let sessionId: string | null = null;
    let identityId: string | null = null;
    if (order.customer_email) {
      const { data: identity } = await supabase
        .from("identities")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("email", order.customer_email)
        .limit(1)
        .single();

      if (identity) {
        identityId = identity.id;
        const { data: session } = await supabase
          .from("sessions")
          .select("id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, landing_page, referrer")
          .eq("workspace_id", workspaceId)
          .eq("identity_id", identity.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (session) {
          sessionId = session.id;
          // Enrich order with session UTMs
          await supabase.from("orders").update({
            session_id: session.id,
            identity_id: identity.id,
            utm_source: session.utm_source,
            utm_medium: session.utm_medium,
            utm_campaign: session.utm_campaign,
            utm_content: session.utm_content,
            utm_term: session.utm_term,
            fbp: session.fbp,
            fbc: session.fbc,
            landing_page: session.landing_page,
            referrer: session.referrer,
          }).eq("id", savedOrder?.id);
        }
      }
    }

    // Create event if mapped to marketing event
    let eventId: string | null = null;
    if (marketingEvent) {
      const { data: evt } = await supabase.from("events").insert({
        workspace_id: workspaceId,
        event_name: marketingEvent,
        event_id: generateEventId(),
        event_time: new Date().toISOString(),
        event_source_url: order.raw_payload ? undefined : undefined,
        action_source: "system",
        source: `webhook_${provider}`,
        session_id: sessionId,
        identity_id: identityId,
        processing_status: META_EVENTS.has(marketingEvent) ? "pending" : "internal",
        custom_data_json: {
          value: order.total_value,
          currency: order.currency,
          order_id: order.gateway_order_id,
          payment_method: order.payment_method,
        },
      }).select("id").single();
      eventId = evt?.id || null;

      // If it's a conversion event, record it
      if (marketingEvent === "Purchase" || marketingEvent === "Lead" || marketingEvent === "Subscribe") {
        await supabase.from("conversions").insert({
          workspace_id: workspaceId,
          event_id: evt?.id || generateEventId(),
          session_id: sessionId,
          identity_id: identityId,
          conversion_type: marketingEvent.toLowerCase(),
          value: order.total_value,
          currency: order.currency,
          attributed_source: null, // will be filled by reconciliation
        });
      }

      // Send to Meta if applicable
      if (META_EVENTS.has(marketingEvent)) {
        try {
          const { data: pixels } = await supabase
            .from("meta_pixels")
            .select("id, pixel_id, access_token_encrypted, test_event_code")
            .eq("workspace_id", workspaceId)
            .eq("is_active", true);

          if (pixels?.length) {
            for (const pixel of pixels) {
              if (!pixel.access_token_encrypted) continue;

              const metaPayload = {
                data: [{
                  event_name: marketingEvent,
                  event_time: Math.floor(Date.now() / 1000),
                  event_id: evt?.id || generateEventId(),
                  action_source: "website",
                  user_data: {
                    em: order.customer_email ? [await sha256(order.customer_email.toLowerCase().trim())] : undefined,
                    ph: order.customer_phone ? [await sha256(order.customer_phone.trim())] : undefined,
                  },
                  custom_data: {
                    value: order.total_value,
                    currency: order.currency,
                    order_id: order.gateway_order_id,
                  },
                }],
                ...(pixel.test_event_code ? { test_event_code: pixel.test_event_code } : {}),
              };

              const metaRes = await fetch(
                `https://graph.facebook.com/v21.0/${pixel.pixel_id}/events?access_token=${pixel.access_token_encrypted}`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metaPayload) }
              );
              const metaData = await metaRes.json();

              await supabase.from("event_deliveries").insert({
                event_id: evt?.id || generateEventId(),
                workspace_id: workspaceId,
                provider: "meta",
                destination: pixel.pixel_id,
                status: metaRes.ok ? "delivered" : "failed",
                attempt_count: 1,
                last_attempt_at: new Date().toISOString(),
                request_json: metaPayload,
                response_json: metaData,
                error_message: metaRes.ok ? null : JSON.stringify(metaData),
              });
            }
          }
        } catch (metaErr) {
          console.error("Meta send error:", metaErr);
        }
      }
    }

    // Update webhook log
    if (webhookLog?.id) {
      await supabase.from("webhook_logs").update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("id", webhookLog.id);
    }

    return new Response(JSON.stringify({
      status: "ok",
      order_id: savedOrder?.id,
      event_id: eventId,
      marketing_event: marketingEvent,
      provider,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Gateway webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function generateEventId(): string {
  return crypto.randomUUID();
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
