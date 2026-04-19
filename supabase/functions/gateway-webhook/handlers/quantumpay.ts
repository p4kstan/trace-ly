// QuantumPay (BR / PIX) webhook handler.
// Docs: https://docs.quantumpay.com.br/webhook
// Events: transaction_*, transfer_* (transfer_* are PIX OUT, not marketing events).
// Values are in CENTAVOS (divide by 100 → BRL).
// HMAC: `Quantum-Pay-Signature: t=<ts>,v1=<hex>` over `${ts}.${rawBody}` with SHA-256.

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, extractTrackingFromMetadata, hmacSHA256Hex, num, str } from "./_helpers.ts";

const EVENT_MAP: Record<string, InternalEvent> = {
  "transaction_created": "checkout_created",
  "transaction_paid": "order_paid",
  "transaction_refunded": "order_refunded",
  "transaction_infraction": "order_chargeback",
  "transfer_created": "payment_created",
  "transfer_updated": "payment_pending",
  "transfer_completed": "payment_paid",
  "transfer_canceled": "order_canceled",
};

export const quantumpayHandler: GatewayHandler = {
  extractEventType: (p) => str(p.event || p.type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const t = p.transaction || p.transfer || {};
    const payer = dig(t, "pix", "payerInfo") || {};
    const isTransfer = !!p.transfer;
    const meta = (t.metadata && typeof t.metadata === "object") ? t.metadata : {};
    const customerMeta = (meta.customer && typeof meta.customer === "object")
      ? meta.customer
      : meta;
    const tracking = extractTrackingFromMetadata(meta);
    return {
      gateway: "quantumpay",
      external_order_id: str(t.id || p.id),
      external_payment_id: str(t.id || p.id),
      external_checkout_id: str(t.externalReference || meta.externalReference || meta.orderCode),
      customer: {
        name: str(customerMeta.name || payer.name),
        email: str(customerMeta.email),
        phone: str(customerMeta.phone || customerMeta.whatsapp),
        document: str(customerMeta.document || payer.document),
      },
      status: str(t.status),
      total_value: num(t.amount) / 100,
      currency: "BRL",
      payment_method: isTransfer ? "pix_out" : "pix",
      tracking,
      raw_payload: p,
    };
  },

  validateHMAC: async (rawBody, headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    const sigH = headers.get("quantum-pay-signature") || "";
    if (!sigH) return { valid: false, reason: "missing_quantumpay_signature" };
    let timestamp = "", v1 = "";
    for (const el of sigH.split(",")) {
      const [pref, val] = el.split("=");
      if (pref === "t") timestamp = val;
      else if (pref === "v1") v1 = val;
    }
    if (!timestamp || !v1) return { valid: false, reason: "invalid_quantumpay_format" };
    const expected = await hmacSHA256Hex(secret, `${timestamp}.${rawBody}`);
    return {
      valid: expected === v1,
      reason: expected === v1 ? "quantumpay_verified" : "quantumpay_mismatch",
    };
  },
};
