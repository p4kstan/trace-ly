// Ticto webhook handler.
// Docs: https://ticto.docs.apiary.io/
// HMAC: Generic verifier fallback.

import type { GatewayHandler } from "./_types.ts";
import { num, str } from "./_helpers.ts";

export const tictoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.status || p.type),

  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("approved") || l.includes("paid")) return "order_paid";
    if (l.includes("refund")) return "order_refunded";
    if (l.includes("chargeback")) return "order_chargeback";
    if (l.includes("cancel")) return "order_canceled";
    if (l.includes("pending") || l.includes("waiting")) return "payment_pending";
    if (l.includes("pix")) return "pix_generated";
    return "order_created";
  },

  normalize: (p) => {
    const d = p.data || p;
    const c = d.customer || d.buyer || {};
    return {
      gateway: "ticto",
      external_order_id: str(d.transaction_id || d.id),
      external_payment_id: str(d.transaction_id || d.id),
      customer: {
        email: str(c.email),
        name: str(c.name),
        phone: str(c.phone),
        document: str(c.document || c.cpf),
      },
      status: str(d.status),
      total_value: num(d.amount || d.value),
      currency: "BRL",
      payment_method: str(d.payment_method),
      raw_payload: p,
    };
  },
};
