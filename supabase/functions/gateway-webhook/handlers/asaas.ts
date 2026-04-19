// Asaas webhook handler.
// Docs: https://docs.asaas.com/docs/webhooks
// HMAC: Asaas does not sign payloads — falls back to generic verifier.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "PAYMENT_CREATED": "payment_created",
  "PAYMENT_UPDATED": "payment_pending",
  "PAYMENT_RECEIVED": "payment_paid",
  "PAYMENT_CONFIRMED": "payment_paid",
  "PAYMENT_OVERDUE": "payment_failed",
  "PAYMENT_DELETED": "order_canceled",
  "PAYMENT_REFUNDED": "payment_refunded",
  "PAYMENT_CHARGEBACK_REQUESTED": "order_chargeback",
};

export const asaasHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "payment_pending",

  normalize: (p) => {
    const pay = p.payment || {};
    return {
      gateway: "asaas",
      external_order_id: str(pay.id),
      external_payment_id: str(pay.id),
      customer: {
        name: str(pay.customerName),
        email: str(pay.customerEmail),
        phone: str(pay.customerPhone),
        document: str(pay.cpfCnpj),
      },
      status: str(pay.status),
      total_value: num(pay.value || pay.netValue),
      currency: "BRL",
      payment_method: str(pay.billingType),
      raw_payload: p,
    };
  },
};
