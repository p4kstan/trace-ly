// Generic fallback handler for unknown / undocumented gateways
// (Lastlink, Braip, Paggue, PerfectPay variants and any new provider).
// The router uses this when no specific handler is registered.

import type { GatewayHandler } from "./_types.ts";
import { num, str } from "./_helpers.ts";

export const genericHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type || p.action || "unknown"),

  resolveInternalEvent: (e) => {
    const l = e.toLowerCase();
    if (l.includes("paid") || l.includes("approved") || l.includes("confirmed")) return "payment_paid";
    if (l.includes("refund")) return "payment_refunded";
    if (l.includes("chargeback")) return "order_chargeback";
    if (l.includes("cancel")) return "order_canceled";
    if (l.includes("pending")) return "payment_pending";
    if (l.includes("lead")) return "lead_captured";
    if (l.includes("checkout")) return "checkout_started";
    if (l.includes("subscription") && l.includes("creat")) return "subscription_started";
    return "order_created";
  },

  normalize: (p) => {
    const c = p.customer || p.buyer || p.payer || {};
    return {
      gateway: "generic",
      external_order_id: str(p.order_id || p.id || p.transaction_id || p.code),
      external_payment_id: str(p.payment_id || p.id),
      customer: {
        email: str(c.email || p.email),
        name: str(c.name || p.name),
        phone: str(c.phone || p.phone),
        document: str(c.document || p.document),
      },
      status: str(p.status || p.event),
      total_value: num(p.amount || p.value || p.total),
      currency: str(p.currency || "BRL"),
      payment_method: str(p.payment_method || p.method),
      raw_payload: p,
    };
  },
};
