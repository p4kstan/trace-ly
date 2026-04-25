// Stripe webhook handler.
// Docs: https://stripe.com/docs/webhooks
// HMAC: Stripe sends `Stripe-Signature: t=<ts>,v1=<hex>` where v1 is HMAC-SHA256 of `${t}.${rawBody}`.
//       We reject signatures older than the configured tolerance to defend against replay.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, extractTrackingFromMetadata, hmacSHA256Hex, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "checkout.session.completed": "order_paid",
  "payment_intent.succeeded": "payment_paid",
  "payment_intent.created": "payment_created",
  "charge.succeeded": "payment_paid",
  "charge.refunded": "payment_refunded",
  "charge.dispute.created": "order_chargeback",
  "customer.subscription.created": "subscription_started",
  "customer.subscription.updated": "subscription_renewed",
  "customer.subscription.deleted": "subscription_canceled",
  "invoice.paid": "payment_paid",
};

// Stripe replay tolerance — 5 minutes is the SDK default.
const STRIPE_TOLERANCE_SECONDS = 300;

export const stripeHandler: GatewayHandler = {
  extractEventType: (p) => str(p.type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const obj = dig(p, "data", "object") || {};
    const cust = obj.customer_details || obj.customer || {};
    const addr = cust.address || obj.shipping?.address || obj.billing_details?.address || {};
    const fullName = str(cust.name || obj.shipping?.name);

    // Tracking metadata can live on multiple Stripe objects depending on
    // the event source: checkout.session, payment_intent, charge, invoice...
    // We merge them all and let extractTrackingFromMetadata flatten nested
    // bracket-keys / custom-fields arrays.
    const trackingBag = {
      ...(obj.metadata || {}),
      ...(obj.payment_intent?.metadata || {}),
      ...(obj.subscription_details?.metadata || {}),
      ...(obj.invoice?.metadata || {}),
      // Stripe Checkout exposes `client_reference_id` at the top of the session
      // — many merchants use it to forward our browser event_id.
      client_reference_id: obj.client_reference_id,
      custom_fields: obj.custom_fields,
    };
    const tracking = extractTrackingFromMetadata(trackingBag);

    return {
      gateway: "stripe",
      external_order_id: str(obj.id || obj.payment_intent),
      external_payment_id: str(obj.payment_intent || obj.id),
      external_subscription_id: str(obj.subscription || ""),
      customer: {
        email: str(cust.email || obj.receipt_email),
        name: fullName,
        phone: str(cust.phone || obj.shipping?.phone),
        first_name: fullName ? fullName.split(" ")[0] : "",
        last_name: fullName ? fullName.split(" ").slice(1).join(" ") : "",
        address: str(addr.line1),
        city: str(addr.city),
        state: str(addr.state),
        zip: str(addr.postal_code),
        country: str(addr.country),
        ip: tracking.ip,
        user_agent: tracking.user_agent,
      },
      status: str(obj.status || obj.payment_status),
      total_value: num(obj.amount_total || obj.amount) / 100,
      currency: str(obj.currency || "usd").toUpperCase(),
      payment_method: str(dig(obj, "payment_method_types", 0) || "card"),
      tracking,
      raw_payload: p,
    };
  },

  validateHMAC: async (rawBody, headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    const sigH = headers.get("stripe-signature") || "";
    if (!sigH) return { valid: false, reason: "missing_stripe_signature_header" };
    const parts: Record<string, string> = {};
    for (const piece of sigH.split(",")) {
      const [k, v] = piece.split("=");
      if (k && v) parts[k] = v;
    }
    if (!parts.t || !parts.v1) return { valid: false, reason: "missing_stripe_signature" };
    // Replay protection — reject signatures older than the tolerance window.
    const ts = Number(parts.t);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > STRIPE_TOLERANCE_SECONDS) {
      return { valid: false, reason: "stripe_signature_outside_tolerance" };
    }
    const expected = await hmacSHA256Hex(secret, `${parts.t}.${rawBody}`);
    return {
      valid: expected === parts.v1,
      reason: expected === parts.v1 ? "stripe_verified" : "stripe_mismatch",
    };
  },
};
