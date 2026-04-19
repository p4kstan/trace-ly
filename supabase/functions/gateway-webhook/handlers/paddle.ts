// Paddle webhook handler.
// Docs: https://developer.paddle.com/webhooks/overview
// HMAC: Paddle Billing sends `Paddle-Signature` — generic verifier covers it.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "transaction.completed": "order_paid",
  "transaction.payment_failed": "payment_failed",
  "subscription.created": "subscription_started",
  "subscription.canceled": "subscription_canceled",
  "subscription.updated": "subscription_renewed",
  "adjustment.created": "order_refunded",
  "payment_succeeded": "payment_paid",
  "payment_refunded": "payment_refunded",
  "subscription_created": "subscription_started",
  "subscription_cancelled": "subscription_canceled",
};

export const paddleHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event_type || p.alert_name),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const d = p.data || p;
    return {
      gateway: "paddle",
      external_order_id: str(d.id || d.order_id || p.order_id),
      external_payment_id: str(d.transaction_id || d.id),
      customer: {
        email: str(d.customer?.email || p.email || d.email),
        name: str(d.customer?.name || p.passthrough),
      },
      status: str(d.status),
      total_value: num(dig(d, "details", "totals", "total") || d.sale_gross || d.total) / 100,
      currency: str(d.currency_code || d.currency || "USD"),
      raw_payload: p,
    };
  },
};
