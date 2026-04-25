// Mercado Pago webhook handler.
// Docs: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
// HMAC: Mercado Pago signs with `x-signature: ts=<ts>,v1=<hex>` where v1 is
//       HMAC-SHA256 of the manifest:
//         id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//       https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks#bookmark_seguran%C3%A7a

import type { GatewayHandler, InternalEvent } from "./_types.ts";
import { dig, extractTrackingFromMetadata, hmacSHA256Hex, num, str } from "./_helpers.ts";

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

// Tolerance for signature timestamp (seconds).
const MP_TOLERANCE_SECONDS = 600;

export const mercadopagoHandler: GatewayHandler = {
  extractEventType: (p) => str(p.action || p.type),

  resolveInternalEvent: (e) => EVENT_MAP[e] || "order_created",

  normalize: (p) => {
    const data = p.data || {};
    const payer = data.payer || {};
    const addr = payer.address || {};
    const fullName = str(payer.first_name) + (payer.last_name ? " " + payer.last_name : "");

    // MP nests merchant-supplied tracking under `metadata` and sometimes
    // `additional_info` / `external_reference`. external_reference is the
    // canonical place merchants put the browser event_id.
    const trackingBag = {
      ...(data.metadata || {}),
      ...(data.additional_info || {}),
      external_reference: data.external_reference,
    };
    const tracking = extractTrackingFromMetadata(trackingBag);

    return {
      gateway: "mercadopago",
      external_order_id: str(data.id || p.id),
      external_payment_id: str(data.id),
      customer: {
        email: str(dig(data, "payer", "email")),
        name: fullName.trim() || undefined,
        first_name: str(payer.first_name) || undefined,
        last_name: str(payer.last_name) || undefined,
        phone: str(dig(payer, "phone", "number")) || undefined,
        document: str(dig(payer, "identification", "number")) || undefined,
        address: str(addr.street_name),
        city: str(addr.city),
        state: str(addr.state),
        zip: str(addr.zip_code),
        country: str(addr.country),
        ip: tracking.ip,
        user_agent: tracking.user_agent,
      },
      status: str(p.action || data.status),
      total_value: num(data.transaction_amount),
      currency: str(data.currency_id || "BRL"),
      payment_method: str(
        dig(data, "payment_method", "type") || dig(data, "payment_type_id"),
      ),
      installments: num(data.installments) || undefined,
      tracking,
      raw_payload: p,
    };
  },

  /**
   * Validate Mercado Pago signature. MP sends:
   *   x-signature: ts=<ts>,v1=<hex>
   *   x-request-id: <uuid>
   * The HMAC manifest is: `id:<data.id>;request-id:<reqId>;ts:<ts>;`
   * (note: `data.id` is the URL query param `data.id`, but MP also sends it
   * in the body — we accept either).
   */
  validateHMAC: async (rawBody, headers, secret) => {
    if (!secret) return { valid: true, reason: "no_secret_configured" };
    const sigH = headers.get("x-signature") || "";
    if (!sigH) return { valid: false, reason: "missing_x_signature_header" };

    const parts: Record<string, string> = {};
    for (const piece of sigH.split(",")) {
      const [k, v] = piece.split("=");
      if (k && v) parts[k.trim()] = v.trim();
    }
    if (!parts.ts || !parts.v1) return { valid: false, reason: "missing_ts_or_v1" };

    const ts = Number(parts.ts);
    const nowSec = Math.floor(Date.now() / 1000);
    // MP sends ts in milliseconds — normalize.
    const tsSec = ts > 1e12 ? Math.floor(ts / 1000) : ts;
    if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > MP_TOLERANCE_SECONDS) {
      return { valid: false, reason: "mp_signature_outside_tolerance" };
    }

    let bodyParsed: any = {};
    try { bodyParsed = JSON.parse(rawBody); } catch { /* keep empty */ }
    const dataId = str(bodyParsed?.data?.id || bodyParsed?.id);
    const reqId = headers.get("x-request-id") || "";
    if (!dataId || !reqId) return { valid: false, reason: "missing_data_id_or_request_id" };

    const manifest = `id:${dataId};request-id:${reqId};ts:${parts.ts};`;
    const expected = await hmacSHA256Hex(secret, manifest);
    return {
      valid: expected === parts.v1,
      reason: expected === parts.v1 ? "mp_verified" : "mp_mismatch",
    };
  },
};
