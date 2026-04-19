// Cloudfy webhook handler.
// HMAC: Generic verifier fallback.

import type { GatewayHandler } from "./_types.ts";
import { num, str } from "./_helpers.ts";

export const cloudfyHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type || p.status),

  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("paid") || l.includes("approved")) return "order_paid";
    if (l.includes("refund")) return "order_refunded";
    if (l.includes("cancel")) return "order_canceled";
    return "order_created";
  },

  normalize: (p) => {
    const d = p.data || p;
    const c = d.customer || d.buyer || {};
    return {
      gateway: "cloudfy",
      external_order_id: str(d.order_id || d.id),
      external_payment_id: str(d.payment_id || d.id),
      customer: {
        email: str(c.email),
        name: str(c.name),
        phone: str(c.phone),
      },
      status: str(d.status),
      total_value: num(d.amount || d.value),
      currency: "BRL",
      payment_method: str(d.payment_method),
      raw_payload: p,
    };
  },
};
