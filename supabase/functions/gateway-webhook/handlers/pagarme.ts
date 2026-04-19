// Pagar.me webhook handler.
// Docs: https://docs.pagar.me/docs/webhooks-1
// HMAC: Pagar.me sends `X-Hub-Signature: sha256=<hex>` of HMAC-SHA256(rawBody, secret).

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, hmacSHA256Hex, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "order.created": "order_created",
  "order.paid": "order_paid",
  "order.canceled": "order_canceled",
  "charge.paid": "payment_paid",
  "charge.failed": "payment_failed",
  "charge.refunded": "payment_refunded",
  "subscription.created": "subscription_started",
  "subscription.canceled": "subscription_canceled",
  "subscription.charged": "subscription_renewed",
};

export const pagarmeHandler: GatewayHandler = {
  extractEventType: (p) => str(p.type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const data = p.data || {};
    const cust = data.customer || {};
    const charge = (data.charges || [])[0] || {};
    return {
      gateway: "pagarme",
      external_order_id: str(data.id || data.code),
      external_payment_id: str(charge.id),
      customer: {
        email: str(cust.email),
        name: str(cust.name),
        phone: str(dig(cust, "phones", "mobile_phone", "number")),
        document: str(cust.document),
      },
      status: str(data.status),
      total_value: num(data.amount) / 100,
      currency: str(data.currency || "BRL"),
      payment_method: str(charge.payment_method),
      installments: num(charge.installments) || undefined,
      raw_payload: p,
    };
  },

  validateHMAC: async (rawBody, headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    const sig = headers.get("x-hub-signature") || "";
    const computed = "sha256=" + await hmacSHA256Hex(secret, rawBody);
    return {
      valid: computed === sig,
      reason: computed === sig ? "pagarme_verified" : "pagarme_mismatch",
    };
  },
};
