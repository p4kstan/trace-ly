// Yampi webhook handler.
// Docs: https://docs.yampi.com.br/recursos/webhooks
// HMAC: Yampi sends `X-Yampi-Hmac-SHA256` containing base64(HMAC-SHA256(rawBody, secret)).

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "order.created": "order_created",
  "order.paid": "order_paid",
  "order.invoiced": "order_approved",
  "order.canceled": "order_canceled",
  "order.refunded": "order_refunded",
  "order.chargeback": "order_chargeback",
  "cart.created": "checkout_created",
  "cart.abandoned": "checkout_abandoned",
  "subscription.created": "subscription_started",
  "subscription.renewed": "subscription_renewed",
  "subscription.canceled": "subscription_canceled",
};

export const yampiHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    // Yampi nests resource under `resource.data`
    const root = dig(p, "resource", "data") || p.resource || p.data || p;
    const customer = root.customer?.data || root.customer || {};
    const items: any[] = (dig(root, "items", "data") || root.items || []) as any[];

    return {
      gateway: "yampi",
      external_order_id: str(root.id || root.number || root.order_id),
      external_payment_id: str(dig(root, "transactions", "data", 0, "id") || root.id),
      external_checkout_id: str(root.cart_id || root.cart_token),
      customer: {
        email: str(customer.email),
        name: str(customer.name || `${customer.first_name || ""} ${customer.last_name || ""}`.trim()),
        phone: str(dig(customer, "phone", "full_number") || customer.phone),
        document: str(customer.cpf || customer.cnpj),
      },
      status: str(root.status?.data?.alias || root.status?.alias || root.status),
      total_value: num(root.totals?.total || root.value_total || root.total),
      currency: str(root.currency?.code || "BRL"),
      payment_method: str(
        dig(root, "transactions", "data", 0, "payment_method", "data", "alias") ||
          root.payment_method,
      ),
      items: items.map((it) => ({
        product_id: str(it.sku?.data?.product_id || it.product_id),
        product_name: str(it.sku?.data?.title || it.title || it.name),
        quantity: num(it.quantity),
        unit_price: num(it.price || it.unit_price),
        total_price: num(it.total),
      })),
      raw_payload: p,
    };
  },

  validateHMAC: async (rawBody, headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    const sig = headers.get("x-yampi-hmac-sha256") || "";
    if (!sig) return { valid: false, reason: "missing_yampi_signature" };

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
    const expected = btoa(String.fromCharCode(...sigBytes));
    return {
      valid: expected === sig,
      reason: expected === sig ? "yampi_verified" : "yampi_mismatch",
    };
  },
};
