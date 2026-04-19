// Gateway webhook router (thin orchestrator).
//
// Architecture:
//   - All gateway-specific logic (extract / map / normalize / HMAC) lives in
//     ./handlers/<provider>.ts and is registered in ./handlers/_registry.ts.
//   - This file handles HTTP, auto-detection, signature verification dispatch,
//     persistence (orders/payments/items), reconciliation, event mapping
//     (workspace override → default dictionary → hardcoded fallback), and
//     enqueue for downstream providers (Meta CAPI, Google Ads, TikTok, GA4).
//
// Deduplication contract:
//   event_queue has a UNIQUE INDEX on (workspace_id, event_id, provider).
//   All inserts use upsert({ ignoreDuplicates: true }) so reentries are safe.
//
// Browser ↔ Server identity sync:
//   When the merchant's checkout forwards `metadata.event_id` (browser-side
//   event ID emitted by the SDK / pixel), we reuse it as the server event_id.
//   This guarantees perfect dedup between Pixel and CAPI on Meta/Google Ads.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { getRegisteredHandler, getHandler } from "./handlers/_registry.ts";
import type { NormalizedCustomer, NormalizedOrder } from "./handlers/_types.ts";
import { sha256, str } from "./handlers/_helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-test-mode",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ════════════════════════════════════════════════════════════
// Mapping fallback (used only when no DB mapping is found)
// ════════════════════════════════════════════════════════════

const INTERNAL_TO_META: Record<string, string> = {
  checkout_created: "InitiateCheckout",
  checkout_started: "InitiateCheckout",
  payment_created: "AddPaymentInfo",
  payment_authorized: "AddPaymentInfo",
  order_paid: "Purchase",
  order_approved: "Purchase",
  payment_paid: "Purchase",
  pix_paid: "Purchase",
  boleto_paid: "Purchase",
  subscription_started: "Subscribe",
  lead_captured: "Lead",
};

const META_EVENTS = new Set([
  "PageView", "ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo",
  "Purchase", "Lead", "CompleteRegistration", "Search", "AddToWishlist",
  "Contact", "Subscribe", "StartTrial", "SubmitApplication", "CustomizeProduct",
  "Schedule", "Donate", "FindLocation",
]);

// ════════════════════════════════════════════════════════════
// Auto-detection
// ════════════════════════════════════════════════════════════

function detectProvider(req: Request, payload: any): string {
  // Header-based
  if (req.headers.get("stripe-signature")) return "stripe";
  if (req.headers.get("x-hotmart-hottok")) return "hotmart";
  if (req.headers.get("x-yampi-hmac-sha256")) return "yampi";
  if (req.headers.get("x-shopify-hmac-sha256") || req.headers.get("x-shopify-topic")) return "shopify";
  if (req.headers.get("paypal-transmission-id")) return "paypal";
  if (req.headers.get("paddle-signature")) return "paddle";
  if (req.headers.get("quantum-pay-signature")) return "quantumpay";

  // Payload-based
  if (payload?.hottok || payload?.data?.buyer?.hotmart_id) return "hotmart";
  if (payload?.type && payload?.data?.object && payload?.api_version) return "stripe";
  if (payload?.webhook_event_type && (payload?.Customer || payload?.product_type)) return "kiwify";
  if (payload?.event_type && payload?.resource?.id && payload?.summary) return "paypal";
  if (payload?.tipoPostback || payload?.venda?.codigo) return "monetizze";
  if (payload?.sale?.sale_id || payload?.trans_cod) return "eduzz";
  if (payload?.action && payload?.data?.id && (payload?.type === "payment" || payload?.action?.startsWith("payment."))) return "mercadopago";
  if (payload?.event && payload?.payment?.id && payload?.payment?.billingType) return "asaas";
  if (payload?.type && payload?.data?.charges && payload?.data?.customer?.document) return "pagarme";
  if (payload?.notificationType === "transaction" || payload?.transaction?.code) return "pagseguro";
  if (payload?.resource_name && (payload?.sale_id || payload?.seller_id)) return "gumroad";
  if (payload?.line_items && payload?.total_price && payload?.order_number) return "shopify";

  return "generic";
}

// ════════════════════════════════════════════════════════════
// Signature verification (delegates to handler when available)
// ════════════════════════════════════════════════════════════

async function verifySignature(
  provider: string,
  rawBody: string,
  req: Request,
  webhookSecret: string | null,
): Promise<{ valid: boolean; reason: string }> {
  const registered = getRegisteredHandler(provider);
  if (registered?.validateHMAC) {
    return await registered.validateHMAC(rawBody, req.headers, webhookSecret);
  }
  if (!webhookSecret) return { valid: true, reason: "no_secret_configured" };

  // Generic SHA-256 verifier for handlers without their own validateHMAC.
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = req.headers.get("x-webhook-signature")
      || req.headers.get("x-signature")
      || req.headers.get("x-hub-signature-256")
      || "";
    if (!sig) return { valid: true, reason: "no_signature_header" };
    const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
    const computed = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const normalized = sig.replace(/^sha256=/, "");
    return {
      valid: computed === normalized,
      reason: computed === normalized ? "generic_verified" : "generic_mismatch",
    };
  } catch (err) {
    console.error("Signature verification error:", err);
    return { valid: false, reason: "verification_error" };
  }
}

// ════════════════════════════════════════════════════════════
// Reconciler — match webhook customer to existing identity/session
// ════════════════════════════════════════════════════════════

async function reconcile(
  workspaceId: string,
  customer: NormalizedCustomer,
): Promise<{ identityId: string | null; sessionId: string | null; sessionData: any; matchField: string | null }> {
  let identityId: string | null = null;
  let sessionId: string | null = null;
  let matchField: string | null = null;

  if (customer.email) {
    const { data } = await supabase.from("identities").select("id")
      .eq("workspace_id", workspaceId).eq("email", customer.email).limit(1).single();
    if (data) { identityId = data.id; matchField = "email"; }
  }
  if (!identityId && customer.phone) {
    const { data } = await supabase.from("identities").select("id")
      .eq("workspace_id", workspaceId).eq("phone", customer.phone).limit(1).single();
    if (data) { identityId = data.id; matchField = "phone"; }
  }
  if (!identityId && customer.document) {
    const { data } = await supabase.from("identities").select("id")
      .eq("workspace_id", workspaceId).eq("external_id", customer.document).limit(1).single();
    if (data) { identityId = data.id; matchField = "document"; }
  }
  if (!identityId && (customer.email || customer.phone)) {
    let q = supabase.from("leads").select("identity_id, session_id").eq("workspace_id", workspaceId);
    if (customer.email) q = q.eq("email", customer.email);
    else q = q.eq("phone", customer.phone!);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).single();
    if (data?.identity_id) { identityId = data.identity_id; matchField = "lead"; }
    if (data?.session_id) sessionId = data.session_id;
  }
  if (!identityId && customer.email) {
    const { data } = await supabase.from("gateway_customers").select("identity_id")
      .eq("workspace_id", workspaceId).eq("email", customer.email).limit(1).single();
    if (data?.identity_id) { identityId = data.identity_id; matchField = "gateway_customer"; }
  }

  let sessionData: any = null;
  if (identityId) {
    const { data } = await supabase.from("sessions")
      .select("id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, fbclid, gclid, ttclid, landing_page, referrer, ip_hash, user_agent")
      .eq("workspace_id", workspaceId).eq("identity_id", identityId)
      .order("created_at", { ascending: false }).limit(1).single();
    if (data) { sessionId = data.id; sessionData = data; }
  }

  return { identityId, sessionId, sessionData, matchField };
}

// ════════════════════════════════════════════════════════════
// PII enrichment — cross-reference identities + gateway_customers
// to fill in missing fields (email/phone/document) before enqueueing.
// Strategy: identity_id first (richest data), then email/phone fallback.
// ════════════════════════════════════════════════════════════

async function enrichCustomer(
  workspaceId: string,
  customer: NormalizedCustomer,
  identityId: string | null,
): Promise<NormalizedCustomer> {
  const enriched: NormalizedCustomer = { ...customer };

  // Tier 1 — identity_id reconciled
  if (identityId) {
    const { data: ident } = await supabase
      .from("identities")
      .select("name, email, phone, external_id")
      .eq("id", identityId)
      .maybeSingle();
    if (ident) {
      if (!enriched.email && ident.email) enriched.email = ident.email;
      if (!enriched.phone && ident.phone) enriched.phone = ident.phone;
      if (!enriched.name && ident.name) enriched.name = ident.name;
      if (!enriched.document && ident.external_id) enriched.document = ident.external_id;
    }
  }

  // Tier 2 — gateway_customers by email/phone
  if ((!enriched.email || !enriched.phone) && (enriched.email || enriched.phone)) {
    let q = supabase
      .from("gateway_customers")
      .select("name, email, phone, document")
      .eq("workspace_id", workspaceId);
    if (enriched.email) q = q.eq("email", enriched.email);
    else q = q.eq("phone", enriched.phone!);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      if (!enriched.email && data.email) enriched.email = data.email;
      if (!enriched.phone && data.phone) enriched.phone = data.phone;
      if (!enriched.name && data.name) enriched.name = data.name;
      if (!enriched.document && data.document) enriched.document = data.document;
    }
  }

  // Derive first/last name when only `name` is present
  if (!enriched.first_name && enriched.name) {
    const parts = enriched.name.trim().split(/\s+/);
    enriched.first_name = parts[0];
    enriched.last_name = enriched.last_name || parts.slice(1).join(" ") || undefined;
  }

  return enriched;
}

/** Pre-hash all PII fields once — used by both Meta and other-provider enqueue. */
async function buildHashedCustomer(c: NormalizedCustomer) {
  const norm = (v?: string) => (v ? String(v).trim().toLowerCase() : "");
  const digits = (v?: string) => (v ? String(v).replace(/\D/g, "") : "");

  const emailHash = c.email ? await sha256(norm(c.email)) : null;
  const phoneDigits = digits(c.phone);
  const phoneHash = phoneDigits
    ? await sha256(phoneDigits.startsWith("55") ? phoneDigits : "55" + phoneDigits)
    : null;
  const documentHash = c.document ? await sha256(digits(c.document)) : null;
  const firstNameHash = c.first_name ? await sha256(norm(c.first_name)) : null;
  const lastNameHash = c.last_name ? await sha256(norm(c.last_name)) : null;
  const cityHash = c.city ? await sha256(norm(c.city).replace(/\s+/g, "")) : null;
  const stateHash = c.state ? await sha256(norm(c.state).replace(/\s+/g, "")) : null;
  const zipHash = c.zip ? await sha256(digits(c.zip)) : null;
  const countryHash = c.country ? await sha256(norm(c.country)) : null;

  return {
    ...c,
    email_hash: emailHash,
    phone_hash: phoneHash,
    document_hash: documentHash,
    first_name_hash: firstNameHash,
    last_name_hash: lastNameHash,
    city_hash: cityHash,
    state_hash: stateHash,
    zip_hash: zipHash,
    country_hash: countryHash,
  };
}

// ════════════════════════════════════════════════════════════
// Queue dispatch — Meta CAPI + Google Ads / TikTok / GA4
// ════════════════════════════════════════════════════════════

async function enqueueForMeta(
  workspaceId: string, eventId: string, orderId: string | null,
  order: NormalizedOrder, marketingEvent: string,
  sessionData: any, identityId: string | null,
  enrichedCustomer: any,
) {
  const { data: pixels } = await supabase.from("meta_pixels")
    .select("id, pixel_id").eq("workspace_id", workspaceId).eq("is_active", true);
  if (!pixels?.length) return;

  for (const pixel of pixels) {
    await supabase.from("event_queue").upsert({
      workspace_id: workspaceId, event_id: eventId, order_id: orderId,
      provider: "meta", destination: pixel.pixel_id, status: "queued",
      payload_json: {
        marketing_event: marketingEvent,
        order: { total_value: order.total_value, currency: order.currency, external_order_id: order.external_order_id, payment_method: order.payment_method, items: order.items },
        customer: enrichedCustomer,
        session: sessionData ? { fbp: sessionData.fbp, fbc: sessionData.fbc, ip_hash: sessionData.ip_hash, user_agent: sessionData.user_agent, landing_page: sessionData.landing_page, gclid: sessionData.gclid, ttclid: sessionData.ttclid, ttp: sessionData.ttp, referrer: sessionData.referrer, utm_source: sessionData.utm_source, utm_medium: sessionData.utm_medium, utm_campaign: sessionData.utm_campaign } : null,
        // Webhook-provided IP/UA as fallback when no session matched
        webhook_client_ip: order.customer?.ip || null,
        webhook_user_agent: order.customer?.user_agent || null,
        identity_id: identityId,
      },
    }, { onConflict: "workspace_id,event_id,provider", ignoreDuplicates: true });
  }
}

async function enqueueForOtherProviders(
  workspaceId: string, eventId: string, orderId: string | null,
  order: NormalizedOrder, marketingEvent: string,
  sessionData: any, identityId: string | null,
  enrichedCustomer: any,
) {
  const { data: destinations } = await supabase.from("integration_destinations")
    .select("id, provider, destination_id")
    .eq("workspace_id", workspaceId).eq("is_active", true)
    .in("provider", ["google_ads", "tiktok", "ga4"]);
  if (!destinations?.length) return;

  for (const dest of destinations) {
    await supabase.from("event_queue").upsert({
      workspace_id: workspaceId, event_id: eventId, order_id: orderId,
      provider: dest.provider, destination: dest.destination_id, status: "queued",
      payload_json: {
        marketing_event: marketingEvent,
        order: { total_value: order.total_value, currency: order.currency, external_order_id: order.external_order_id, payment_method: order.payment_method, items: order.items },
        customer: enrichedCustomer,
        session: sessionData ? { fbp: sessionData.fbp, fbc: sessionData.fbc, ip_hash: sessionData.ip_hash, user_agent: sessionData.user_agent, landing_page: sessionData.landing_page, gclid: sessionData.gclid, ttclid: sessionData.ttclid, ttp: sessionData.ttp, gbraid: sessionData.gbraid, wbraid: sessionData.wbraid, referrer: sessionData.referrer, utm_source: sessionData.utm_source, utm_medium: sessionData.utm_medium, utm_campaign: sessionData.utm_campaign, client_id: sessionData.ga_client_id } : null,
        webhook_client_ip: order.customer?.ip || null,
        webhook_user_agent: order.customer?.user_agent || null,
        identity_id: identityId,
      },
    }, { onConflict: "workspace_id,event_id,provider", ignoreDuplicates: true });
  }
}

// ════════════════════════════════════════════════════════════
// Main HTTP handler
// ════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    let provider = url.searchParams.get("provider") || "auto";
    const workspaceId = url.searchParams.get("workspace_id");
    const integrationId = url.searchParams.get("integration_id") || null;

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { payload = { raw: rawBody }; }

    if (provider === "auto" || provider === "generic") {
      provider = detectProvider(req, payload);
    }

    // ── Signature ──
    let webhookSecret: string | null = null;
    if (integrationId) {
      const { data } = await supabase.from("gateway_integrations")
        .select("webhook_secret_encrypted").eq("id", integrationId).single();
      webhookSecret = data?.webhook_secret_encrypted || null;
    }

    // Test-mode bypass for authenticated workspace members
    let isTestMode = false;
    if (req.headers.get("x-test-mode") === "1") {
      const authHeader = req.headers.get("authorization") || "";
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const { data: claimsData } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (userId) {
          const { data: isMember } = await supabase.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspaceId });
          if (isMember) isTestMode = true;
        }
      }
    }

    const sigResult = isTestMode
      ? { valid: true, reason: "test_mode_bypass" }
      : await verifySignature(provider, rawBody, req, webhookSecret);
    if (!sigResult.valid) {
      await supabase.from("gateway_webhook_logs").insert({
        workspace_id: workspaceId, gateway_integration_id: integrationId, provider,
        signature_valid: false, processing_status: "rejected",
        error_message: `Signature failed: ${sigResult.reason}`,
        payload_json: { body_length: rawBody.length },
      });
      return new Response(JSON.stringify({ error: "Invalid signature", reason: sigResult.reason }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Normalize via handler registry ──
    const handler = getHandler(provider);
    const eventType = handler.extractEventType(payload);
    const internalEvent = handler.resolveInternalEvent(eventType);
    const order = handler.normalize(payload);

    const externalEventId = str(payload.id || payload.event_id || payload.notification_id || order.external_order_id);
    const dedupKey = `${provider}:${eventType}:${externalEventId}`;

    // ── Webhook log ──
    const headersJson: Record<string, string> = {};
    req.headers.forEach((v, k) => { headersJson[k] = v; });

    const { data: webhookLog } = await supabase.from("gateway_webhook_logs").insert({
      workspace_id: workspaceId, gateway_integration_id: integrationId, provider,
      external_event_id: externalEventId, event_type: eventType,
      signature_valid: true, http_headers_json: headersJson,
      query_params_json: Object.fromEntries(url.searchParams.entries()),
      payload_json: payload, processing_status: "processing",
    }).select("id").single();

    // ── Idempotency ──
    const { data: existingLog } = await supabase.from("gateway_webhook_logs")
      .select("id").eq("workspace_id", workspaceId).eq("external_event_id", externalEventId)
      .eq("provider", provider).eq("processing_status", "processed").limit(1).single();

    if (existingLog) {
      if (webhookLog?.id) {
        await supabase.from("gateway_webhook_logs").update({ processing_status: "duplicate" }).eq("id", webhookLog.id);
      }
      return new Response(JSON.stringify({ status: "duplicate" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Persist order ──
    const isPaid = ["order_paid", "payment_paid", "pix_paid", "boleto_paid", "order_approved"].includes(internalEvent);
    const isRefund = internalEvent.includes("refund");
    const isChargeback = internalEvent.includes("chargeback");
    const isCanceled = internalEvent.includes("cancel");

    const tk = order.tracking || {};
    const orderData: any = {
      workspace_id: workspaceId, gateway: order.gateway, gateway_order_id: order.external_order_id,
      gateway_integration_id: integrationId, customer_email: order.customer.email || null,
      customer_name: order.customer.name || null, customer_phone: order.customer.phone || null,
      customer_document: order.customer.document || null,
      status: isPaid ? "paid" : isRefund ? "refunded" : isChargeback ? "chargeback" : isCanceled ? "canceled" : "pending",
      financial_status: internalEvent, total_value: order.total_value, currency: order.currency,
      payment_method: order.payment_method, installments: order.installments,
      external_checkout_id: order.external_checkout_id, external_subscription_id: order.external_subscription_id,
      gclid: tk.gclid || null, fbclid: tk.fbclid || null, ttclid: tk.ttclid || null,
      fbp: tk.fbp || null, fbc: tk.fbc || null,
      utm_source: tk.utm_source || null, utm_medium: tk.utm_medium || null,
      utm_campaign: tk.utm_campaign || null, utm_content: tk.utm_content || null, utm_term: tk.utm_term || null,
      landing_page: tk.landing_page || null, referrer: tk.referrer || null,
    };
    if (isPaid) orderData.paid_at = new Date().toISOString();
    if (isRefund) orderData.refunded_at = new Date().toISOString();
    if (isCanceled) orderData.canceled_at = new Date().toISOString();

    const { data: savedOrder } = await supabase.from("orders").insert(orderData).select("id").single();

    // ── Payment ──
    const paymentStatus = isPaid ? "paid"
      : isRefund ? "refunded"
      : isChargeback ? "chargeback"
      : (internalEvent.includes("fail") || internalEvent.includes("refused")) ? "failed"
      : "pending";
    await supabase.from("payments").insert({
      workspace_id: workspaceId, order_id: savedOrder?.id, gateway: order.gateway,
      gateway_integration_id: integrationId, gateway_payment_id: order.external_payment_id,
      payment_method: order.payment_method, status: paymentStatus,
      amount: order.total_value, currency: order.currency, installments: order.installments,
      paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
      refunded_at: paymentStatus === "refunded" ? new Date().toISOString() : null,
      chargeback_at: paymentStatus === "chargeback" ? new Date().toISOString() : null,
      raw_payload_json: payload,
    });

    if (order.items?.length && savedOrder?.id) {
      await supabase.from("order_items").insert(order.items.map((i) => ({
        order_id: savedOrder.id, workspace_id: workspaceId, ...i,
      })));
    }

    // ── Reconciliation (fallback fill) ──
    const { identityId, sessionId, sessionData, matchField } = await reconcile(workspaceId, order.customer);

    if (savedOrder?.id && (sessionId || identityId || sessionData)) {
      const fallback: any = { session_id: sessionId, identity_id: identityId };
      if (sessionData) {
        if (!tk.utm_source) fallback.utm_source = sessionData.utm_source;
        if (!tk.utm_medium) fallback.utm_medium = sessionData.utm_medium;
        if (!tk.utm_campaign) fallback.utm_campaign = sessionData.utm_campaign;
        if (!tk.utm_content) fallback.utm_content = sessionData.utm_content;
        if (!tk.utm_term) fallback.utm_term = sessionData.utm_term;
        if (!tk.fbp) fallback.fbp = sessionData.fbp;
        if (!tk.fbc) fallback.fbc = sessionData.fbc;
        if (!tk.fbclid) fallback.fbclid = sessionData.fbclid;
        if (!tk.gclid) fallback.gclid = sessionData.gclid;
        if (!tk.ttclid) fallback.ttclid = sessionData.ttclid;
        if (!tk.landing_page) fallback.landing_page = sessionData.landing_page;
        if (!tk.referrer) fallback.referrer = sessionData.referrer;
      }
      await supabase.from("orders").update(fallback).eq("id", savedOrder.id);
    }

    if (order.customer.email || order.customer.phone) {
      await supabase.from("gateway_customers").upsert({
        workspace_id: workspaceId, provider, gateway_integration_id: integrationId,
        external_customer_id: order.external_order_id, identity_id: identityId,
        name: order.customer.name || null, email: order.customer.email || null,
        phone: order.customer.phone || null, document: order.customer.document || null,
      }, { onConflict: "workspace_id,provider,external_customer_id", ignoreDuplicates: true });
    }

    await supabase.from("reconciliation_logs").insert({
      workspace_id: workspaceId, provider, entity_type: "order",
      entity_id: savedOrder?.id, external_id: order.external_order_id,
      reconciliation_type: sessionId ? "session_matched" : identityId ? "identity_only" : "unmatched",
      status: sessionId ? "success" : identityId ? "partial" : "failed",
      details_json: { identity_id: identityId, session_id: sessionId, match_field: matchField },
    });

    // ── Marketing event resolution: workspace override → DB default → hardcoded ──
    const { data: customMapping } = await supabase.from("event_mappings")
      .select("marketing_event, external_event_name")
      .eq("workspace_id", workspaceId).eq("gateway", provider).eq("gateway_event", eventType)
      .eq("is_active", true).limit(1).maybeSingle();

    let marketingEvent: string | null =
      customMapping?.marketing_event || customMapping?.external_event_name || null;

    if (!marketingEvent) {
      const { data: defaultMapping } = await supabase.from("default_event_mappings")
        .select("external_event_name")
        .eq("gateway", provider).eq("gateway_event", eventType).eq("external_platform", "meta")
        .limit(1).maybeSingle();
      marketingEvent = defaultMapping?.external_event_name || INTERNAL_TO_META[internalEvent] || null;
    }

    // ── Create event (reusing browser event_id when present) ──
    let eventId: string | null = null;
    if (marketingEvent || internalEvent) {
      const evtName = marketingEvent || internalEvent;
      const browserEventId = (order.tracking?.event_id || "").trim();
      const persistedEventId = browserEventId || crypto.randomUUID();
      const { data: evt } = await supabase.from("events").insert({
        workspace_id: workspaceId, event_name: evtName, event_id: persistedEventId,
        event_time: new Date().toISOString(), action_source: "system",
        source: `webhook_${provider}`, session_id: sessionId, identity_id: identityId,
        processing_status: META_EVENTS.has(evtName) ? "queued" : "internal",
        custom_data_json: {
          value: order.total_value, currency: order.currency, order_id: order.external_order_id,
          payment_method: order.payment_method, internal_event: internalEvent,
          browser_event_id: browserEventId || null,
        },
        deduplication_key: dedupKey,
      }).select("id").single();
      eventId = evt?.id || null;

      if (["Purchase", "Lead", "Subscribe"].includes(evtName) || isPaid) {
        await supabase.from("conversions").insert({
          workspace_id: workspaceId, event_id: evt?.id || crypto.randomUUID(),
          session_id: sessionId, identity_id: identityId,
          conversion_type: evtName.toLowerCase(), value: order.total_value, currency: order.currency,
          attributed_source: sessionData?.utm_source || null,
          attributed_campaign: sessionData?.utm_campaign || null,
          attribution_model: "last_touch",
        });
      }

      if (marketingEvent && eventId) {
        if (META_EVENTS.has(marketingEvent)) {
          await enqueueForMeta(workspaceId, eventId, savedOrder?.id || null, order, marketingEvent, sessionData, identityId);
        }
        await enqueueForOtherProviders(workspaceId, eventId, savedOrder?.id || null, order, marketingEvent, sessionData, identityId);
      }
    }

    if (webhookLog?.id) {
      await supabase.from("gateway_webhook_logs").update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        processing_attempts: 1,
      }).eq("id", webhookLog.id);
    }

    return new Response(JSON.stringify({
      status: "ok", provider, internal_event: internalEvent,
      marketing_event: marketingEvent, order_id: savedOrder?.id, event_id: eventId,
      queued_for_delivery: !!marketingEvent,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Gateway webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
