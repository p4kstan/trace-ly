// Hotmart webhook handler.
// Docs: https://developers.hotmart.com/docs/en/webhooks/webhook-base/
// HMAC: Hotmart sends a static "hottok" via x-hotmart-hottok header, which
//       must equal the configured webhook secret.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  PURCHASE_COMPLETE: "order_paid",
  PURCHASE_APPROVED: "order_paid",
  PURCHASE_PROTEST: "order_chargeback",
  PURCHASE_REFUNDED: "order_refunded",
  PURCHASE_CHARGEBACK: "order_chargeback",
  PURCHASE_CANCELED: "order_canceled",
  PURCHASE_BILLET_PRINTED: "boleto_generated",
  PURCHASE_DELAYED: "payment_pending",
  SUBSCRIPTION_CANCELLATION: "subscription_canceled",
  SWITCH_PLAN: "subscription_renewed",
};

export const hotmartHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || (p.hottok && "PURCHASE")),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const d = p.data || p;
    const buyer = d.buyer || {};
    const purchase = d.purchase || {};
    const product = d.product || {};
    return {
      gateway: "hotmart",
      external_order_id: str(purchase.transaction || purchase.order_bump?.id),
      external_payment_id: str(purchase.transaction),
      customer: {
        email: str(buyer.email),
        name: str(buyer.name),
        phone: str(buyer.phone || buyer.cellphone),
        document: str(buyer.document),
      },
      status: str(purchase.status),
      total_value: num(purchase.price?.value || purchase.original_offer_price?.value),
      currency: str(purchase.price?.currency_value || "BRL"),
      payment_method: str(purchase.payment?.type),
      items: [
        {
          product_name: str(product.name),
          product_id: str(product.id),
          quantity: 1,
          unit_price: num(purchase.price?.value),
        },
      ],
      raw_payload: p,
    };
  },

  validateHMAC: async (_rawBody, headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    const hottok = headers.get("x-hotmart-hottok") || "";
    return {
      valid: hottok === secret,
      reason: hottok === secret ? "hotmart_verified" : "hotmart_mismatch",
    };
  },
};
