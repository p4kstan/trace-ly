// Eduzz webhook handler.
// Docs: https://api.eduzz.com/docs/webhook
// HMAC: Eduzz uses an `api_key` field inside the payload as a shared secret;
//       there is no header signature. The validateHMAC compares this field
//       to the configured secret.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  invoice_created: "order_created",
  invoice_approved: "order_paid",
  invoice_paid: "order_paid",
  invoice_pending: "payment_pending",
  invoice_canceled: "order_canceled",
  invoice_refunded: "order_refunded",
  contract_created: "subscription_started",
  contract_renewed: "subscription_renewed",
  contract_canceled: "subscription_canceled",
  // numeric trans_status fallbacks
  "1": "payment_pending",
  "3": "order_paid",
  "4": "order_canceled",
  "6": "payment_pending",
  "7": "order_refunded",
};

export const eduzzHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event_type || p.trans_status),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const s = p.sale || p;
    const cl = p.client || s.client || {};
    const co = p.content || s.content || {};
    return {
      gateway: "eduzz",
      external_order_id: str(s.sale_id || s.invoice_code || p.trans_cod),
      external_payment_id: str(s.sale_id || p.trans_cod),
      customer: {
        email: str(cl.email || p.cus_email),
        name: str(cl.name || p.cus_name),
        phone: str(cl.phone || p.cus_cel),
        document: str(cl.document || p.cus_taxnumber),
      },
      status: str(s.sale_status || p.trans_status),
      total_value: num(s.sale_amount_win || s.sale_net || p.trans_value),
      currency: "BRL",
      payment_method: str(s.sale_payment_method || p.trans_paymentmethod),
      items: co.title
        ? [{ product_name: str(co.title), product_id: str(co.id), quantity: 1 }]
        : undefined,
      raw_payload: p,
    };
  },

  validateHMAC: async (rawBody, _headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    try {
      const payload = JSON.parse(rawBody);
      const apiKey = str(payload.api_key || payload.apikey);
      return {
        valid: apiKey === secret,
        reason: apiKey === secret ? "eduzz_verified" : "eduzz_mismatch",
      };
    } catch {
      return { valid: false, reason: "eduzz_invalid_payload" };
    }
  },
};
