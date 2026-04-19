// Appmax webhook handler.
// Docs: https://docs.appmax.com.br/integration/webhook
// HMAC: Appmax uses an access token check — fallback to generic verifier.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "order_created": "order_created",
  "order_approved": "order_paid",
  "order_paid": "order_paid",
  "order_canceled": "order_canceled",
  "order_refunded": "order_refunded",
  "subscription_created": "subscription_started",
  "subscription_renewed": "subscription_renewed",
  "subscription_canceled": "subscription_canceled",
  "approved": "order_paid",
  "canceled": "order_canceled",
  "refunded": "order_refunded",
};

export const appmaxHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.status),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const o = p.data?.order || p.order || p;
    const c = o.customer || p.customer || {};
    return {
      gateway: "appmax",
      external_order_id: str(o.id || o.order_id),
      external_payment_id: str(o.payment_id || o.id),
      customer: {
        email: str(c.email),
        name: str(c.name || c.firstname),
        phone: str(c.phone || c.telephone),
        document: str(c.cpf || c.document),
      },
      status: str(o.status),
      total_value: num(o.total || o.amount),
      currency: "BRL",
      payment_method: str(o.payment_method || o.payment_type),
      raw_payload: p,
    };
  },
};
