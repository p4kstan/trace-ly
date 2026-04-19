// PayPal webhook handler.
// Docs: https://developer.paypal.com/api/rest/webhooks/
// HMAC: PayPal verification requires API call to validate; we fall back to
//       generic verifier (no_signature_header) when secret is unset.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "CHECKOUT.ORDER.APPROVED": "order_paid",
  "PAYMENT.CAPTURE.COMPLETED": "payment_paid",
  "PAYMENT.CAPTURE.DENIED": "payment_failed",
  "PAYMENT.CAPTURE.REFUNDED": "payment_refunded",
  "CUSTOMER.DISPUTE.CREATED": "order_chargeback",
  "BILLING.SUBSCRIPTION.CREATED": "subscription_started",
  "BILLING.SUBSCRIPTION.CANCELLED": "subscription_canceled",
};

export const paypalHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event_type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const res = p.resource || {};
    const payer = res.payer || {};
    const amount = res.amount || dig(res, "purchase_units", 0, "amount") || {};
    return {
      gateway: "paypal",
      external_order_id: str(res.id || p.id),
      external_payment_id: str(res.id),
      customer: {
        email: str(dig(payer, "email_address")),
        name: str(
          `${dig(payer, "name", "given_name") || ""} ${dig(payer, "name", "surname") || ""}`.trim(),
        ),
      },
      status: str(res.status),
      total_value: num(amount.value),
      currency: str(amount.currency_code || "USD"),
      raw_payload: p,
    };
  },
};
