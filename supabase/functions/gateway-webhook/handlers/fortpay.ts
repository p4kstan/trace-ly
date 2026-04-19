// FortPay webhook handler.
// HMAC: Generic verifier fallback.

import type { GatewayHandler } from "./_types.ts";
import { num, str } from "./_helpers.ts";

export const fortpayHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.status || p.type),

  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("approved") || l.includes("paid")) return "order_paid";
    if (l.includes("refund")) return "order_refunded";
    if (l.includes("chargeback")) return "order_chargeback";
    if (l.includes("cancel")) return "order_canceled";
    return "order_created";
  },

  normalize: (p) => {
    const d = p.data || p;
    const c = d.customer || d.buyer || {};
    return {
      gateway: "fortpay",
      external_order_id: str(d.transaction_id || d.id),
      external_payment_id: str(d.transaction_id || d.id),
      customer: {
        email: str(c.email),
        name: str(c.name),
        phone: str(c.phone),
        document: str(c.document),
      },
      status: str(d.status),
      total_value: num(d.amount || d.value),
      currency: "BRL",
      payment_method: str(d.payment_method),
      raw_payload: p,
    };
  },
};
