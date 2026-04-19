// PagSeguro webhook handler.
// Docs: https://dev.pagseguro.uol.com.br/reference/webhook
// HMAC: Generic verifier fallback.

import type { GatewayHandler } from "./_types.ts";
import { dig, num, str } from "./_helpers.ts";

export const pagseguroHandler: GatewayHandler = {
  extractEventType: (p) => str(p.notificationType || p.event || p.type),

  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("checkout")) return "checkout_created";
    if (l === "transaction" || l.includes("paid") || l.includes("3")) return "payment_paid";
    if (l.includes("pending") || l.includes("1") || l.includes("2")) return "payment_pending";
    if (l.includes("cancel") || l.includes("7")) return "order_canceled";
    if (l.includes("refund") || l.includes("5") || l.includes("6")) return "payment_refunded";
    return "order_created";
  },

  normalize: (p) => {
    const d = p.transaction || p.charge || p.data || p;
    const s = d.sender || d.customer || {};
    return {
      gateway: "pagseguro",
      external_order_id: str(d.code || d.id || d.reference),
      external_payment_id: str(d.code || d.id),
      customer: {
        email: str(s.email),
        name: str(s.name),
        phone: str(dig(s, "phone", "number") || s.phone),
      },
      status: str(d.status),
      total_value: num(d.grossAmount || d.amount?.value || d.amount),
      currency: "BRL",
      payment_method: str(dig(d, "paymentMethod", "type") || d.payment_method),
      raw_payload: p,
    };
  },
};
