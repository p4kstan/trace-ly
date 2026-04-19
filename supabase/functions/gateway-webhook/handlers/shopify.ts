// Shopify webhook handler.
// Docs: https://shopify.dev/docs/apps/build/webhooks/configuration/https
// HMAC: Shopify sends `X-Shopify-Hmac-SHA256` containing base64(HMAC-SHA256(rawBody, secret)).

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "orders/create": "order_created",
  "orders/paid": "order_paid",
  "orders/fulfilled": "order_approved",
  "orders/cancelled": "order_canceled",
  "refunds/create": "order_refunded",
  "checkouts/create": "checkout_created",
};

export const shopifyHandler: GatewayHandler = {
  extractEventType: (p) => str(p.topic || p.event),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const c = p.customer || p.billing_address || {};
    return {
      gateway: "shopify",
      external_order_id: str(p.id || p.order_number),
      external_checkout_id: str(p.checkout_id || p.checkout_token),
      customer: {
        email: str(p.email || p.contact_email || c.email),
        name: str(`${c.first_name || ""} ${c.last_name || ""}`.trim()),
        phone: str(p.phone || c.phone),
      },
      status: str(p.financial_status || p.fulfillment_status || "pending"),
      total_value: num(p.total_price || p.subtotal_price),
      currency: str(p.currency || "USD"),
      payment_method: str(dig(p, "payment_gateway_names", 0)),
      items: (p.line_items || []).map((i: any) => ({
        product_name: str(i.title),
        product_id: str(i.product_id),
        quantity: num(i.quantity),
        unit_price: num(i.price),
      })),
      raw_payload: p,
    };
  },

  validateHMAC: async (rawBody, headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    const sig = headers.get("x-shopify-hmac-sha256") || "";
    if (!sig) return { valid: false, reason: "missing_shopify_signature" };
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
      reason: expected === sig ? "shopify_verified" : "shopify_mismatch",
    };
  },
};
