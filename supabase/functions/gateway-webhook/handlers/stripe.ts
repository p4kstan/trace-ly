// Stripe webhook handler.
// Docs: https://stripe.com/docs/webhooks
// HMAC: Stripe sends `Stripe-Signature: t=<ts>,v1=<hex>` where v1 is HMAC-SHA256 of `${t}.${rawBody}`.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, hmacSHA256Hex, num, str } from "./_helpers.ts";

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

export const stripeHandler: GatewayHandler = {
  extractEventType: (p) => str(p.type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const obj = dig(p, "data", "object") || {};
    const cust = obj.customer_details || obj.customer || {};
    const addr = cust.address || obj.shipping?.address || obj.billing_details?.address || {};
    const fullName = str(cust.name || obj.shipping?.name);
    return {
      gateway: "stripe",
      external_order_id: str(obj.id || obj.payment_intent),
      external_payment_id: str(obj.payment_intent || obj.id),
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
      },
      status: str(obj.status || obj.payment_status),
      total_value: num(obj.amount_total || obj.amount) / 100,
      currency: str(obj.currency || "usd").toUpperCase(),
      payment_method: str(dig(obj, "payment_method_types", 0) || "card"),
      raw_payload: p,
    };
  },

  validateHMAC: async (rawBody, headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    const sigH = headers.get("stripe-signature") || "";
    const parts: Record<string, string> = {};
    for (const piece of sigH.split(",")) {
      const [k, v] = piece.split("=");
      if (k && v) parts[k] = v;
    }
    if (!parts.t || !parts.v1) return { valid: false, reason: "missing_stripe_signature" };
    const expected = await hmacSHA256Hex(secret, `${parts.t}.${rawBody}`);
    return {
      valid: expected === parts.v1,
      reason: expected === parts.v1 ? "stripe_verified" : "stripe_mismatch",
    };
  },
};
