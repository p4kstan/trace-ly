// Gumroad webhook handler ("ping" notifications).
// Docs: https://help.gumroad.com/article/40-ping
// HMAC: Generic verifier fallback.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "sale": "order_paid",
  "refund": "order_refunded",
  "cancellation": "subscription_canceled",
  "subscription_updated": "subscription_renewed",
  "subscription_ended": "subscription_canceled",
  "subscription_restarted": "subscription_started",
};

export const gumroadHandler: GatewayHandler = {
  extractEventType: (p) => str(p.resource_name || "sale"),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => ({
    gateway: "gumroad",
    external_order_id: str(p.sale_id || p.subscription_id || p.id),
    external_payment_id: str(p.sale_id || p.id),
    customer: {
      email: str(p.email || p.purchaser_id),
      name: str(p.full_name),
    },
    status: str(p.resource_name || "paid"),
    total_value: num(String(p.price || 0).replace(/[^0-9.]/g, "")),
    currency: str(p.currency || "usd").toUpperCase(),
    raw_payload: p,
  }),
};
