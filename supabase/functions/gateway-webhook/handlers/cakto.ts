// Cakto webhook handler.
// Docs: https://docs.cakto.com.br/webhooks
// HMAC: Generic verifier fallback.

import type { GatewayHandler } from "./_types.ts";
import { num, str } from "./_helpers.ts";

export const caktoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.status),

  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("lead")) return "lead_captured";
    if (l.includes("checkout")) return "checkout_started";
    if (l.includes("approved") || l.includes("paid")) return "payment_paid";
    if (l.includes("pending")) return "payment_pending";
    if (l.includes("cancel")) return "order_canceled";
    if (l.includes("refund")) return "payment_refunded";
    return "order_created";
  },

  normalize: (p) => {
    const d = p.data || p;
    const c = d.customer || d.buyer || {};
    return {
      gateway: "cakto",
      external_order_id: str(d.id || d.order_id || d.transaction_id),
      external_payment_id: str(d.payment_id || d.id),
      customer: {
        email: str(c.email),
        name: str(c.name),
        phone: str(c.phone),
        document: str(c.document),
      },
      status: str(d.status),
      total_value: num(d.amount || d.value || d.total),
      currency: "BRL",
      payment_method: str(d.payment_method),
      raw_payload: p,
    };
  },
};
