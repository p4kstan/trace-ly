// Kirvano webhook handler.
// Docs: https://docs.kirvano.com/integracoes/webhooks
// HMAC: Generic verifier fallback.

import type { GatewayHandler } from "./_types.ts";
import { num, str } from "./_helpers.ts";

export const kirvanoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type || p.status),

  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("checkout")) return "checkout_created";
    if (l.includes("pix") && l.includes("gen")) return "pix_generated";
    if (l.includes("pix") && l.includes("paid")) return "pix_paid";
    if (l.includes("approved") || l.includes("paid")) return "payment_paid";
    if (l.includes("refused") || l.includes("rejected")) return "payment_failed";
    if (l.includes("subscription") && l.includes("creat")) return "subscription_started";
    if (l.includes("subscription") && l.includes("renew")) return "subscription_renewed";
    return "order_created";
  },

  normalize: (p) => {
    const d = p.data || p;
    const c = d.customer || d.buyer || {};
    return {
      gateway: "kirvano",
      external_order_id: str(d.id || d.order_id),
      external_payment_id: str(d.payment_id || d.charge_id || d.id),
      customer: {
        email: str(c.email),
        name: str(c.name),
        phone: str(c.phone),
        document: str(c.document || c.cpf),
      },
      status: str(d.status),
      total_value: num(d.amount || d.value),
      currency: "BRL",
      payment_method: str(d.payment_method || d.payment_type),
      raw_payload: p,
    };
  },
};
