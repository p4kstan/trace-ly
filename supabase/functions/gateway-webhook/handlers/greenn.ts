// Greenn webhook handler (also covers PerfectPay-like Greenn events).
// HMAC: Generic verifier fallback.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "purchase_approved": "order_paid",
  "purchase_complete": "order_paid",
  "purchase_refunded": "order_refunded",
  "purchase_canceled": "order_canceled",
  "purchase_chargeback": "order_chargeback",
  "subscription_created": "subscription_started",
  "subscription_canceled": "subscription_canceled",
};

export const greennHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const d = p.data || p;
    const c = d.buyer || d.customer || {};
    return {
      gateway: "greenn",
      external_order_id: str(d.transaction || d.id),
      external_payment_id: str(d.transaction || d.id),
      customer: {
        email: str(c.email),
        name: str(c.name),
        phone: str(c.phone || c.cellphone),
        document: str(c.doc || c.cpf),
      },
      status: str(d.status),
      total_value: num(d.price || d.value),
      currency: "BRL",
      payment_method: str(d.payment_method),
      raw_payload: p,
    };
  },
};
