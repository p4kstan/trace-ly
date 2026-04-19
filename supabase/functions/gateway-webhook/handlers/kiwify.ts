// Kiwify webhook handler.
// Docs: https://docs.kiwify.com.br/integracoes/webhook
// HMAC: Kiwify sends ?signature=<hex> as a query parameter; the signature
//       is HMAC-SHA1 of the raw body using the configured secret.
//       Some accounts also use a token-based scheme — the main verifier
//       in index.ts handles the legacy fallback when this returns "no_signature".

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  order_approved: "order_paid",
  order_completed: "order_paid",
  order_refunded: "order_refunded",
  order_chargedback: "order_chargeback",
  subscription_created: "subscription_started",
  subscription_renewed: "subscription_renewed",
  subscription_canceled: "subscription_canceled",
  waiting_payment: "payment_pending",
  pix_created: "pix_generated",
  billet_created: "boleto_generated",
};

export const kiwifyHandler: GatewayHandler = {
  extractEventType: (p) => str(p.webhook_event_type || p.order_status || p.event),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const c = p.Customer || p.customer || {};
    const fullName = str(c.full_name || c.name);
    return {
      gateway: "kiwify",
      external_order_id: str(p.order_id || p.subscription_id),
      external_payment_id: str(p.order_id),
      customer: {
        email: str(c.email),
        name: fullName,
        phone: str(c.mobile),
        document: str(c.CPF || c.cpf),
        first_name: str(c.first_name || (fullName ? fullName.split(" ")[0] : "")),
        last_name: str(c.last_name || (fullName ? fullName.split(" ").slice(1).join(" ") : "")),
        address: str(c.address || c.street),
        city: str(c.city),
        state: str(c.state),
        zip: str(c.zipcode || c.zip),
        country: str(c.country || "BR"),
        ip: str(c.ip),
      },
      status: str(p.order_status || p.webhook_event_type),
      total_value: num(
        p.Commissions?.charge_amount || p.product_price || p.approved_value,
      ),
      currency: "BRL",
      payment_method: str(p.payment_method),
      raw_payload: p,
    };
  },
};
