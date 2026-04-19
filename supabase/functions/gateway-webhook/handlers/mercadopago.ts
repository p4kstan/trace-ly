// Mercado Pago webhook handler.
// Docs: https://www.mercadopago.com.br/developers/en/docs/notifications/webhooks
// HMAC: Mercado Pago does not always sign the webhook; main router falls back
//       to generic verifier when validateHMAC is omitted.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "payment.created": "payment_created",
  "payment.approved": "payment_paid",
  "payment.updated": "payment_pending",
  "payment.refunded": "payment_refunded",
  "payment.cancelled": "order_canceled",
  "payment.in_process": "payment_pending",
  "payment.rejected": "payment_failed",
  "payment.pending": "payment_pending",
  "chargebacks": "order_chargeback",
};

export const mercadopagoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.action || p.type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const data = p.data || {};
    return {
      gateway: "mercadopago",
      external_order_id: str(data.id || p.id),
      external_payment_id: str(data.id),
      customer: {
        email: str(dig(data, "payer", "email")),
        name: str(dig(data, "payer", "first_name")),
      },
      status: str(p.action),
      total_value: num(data.transaction_amount),
      currency: str(data.currency_id || "BRL"),
      payment_method: str(
        dig(data, "payment_method", "type") || dig(data, "payment_type_id"),
      ),
      installments: num(data.installments) || undefined,
      raw_payload: p,
    };
  },
};
