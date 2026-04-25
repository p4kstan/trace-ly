// Shared utilities used across gateway handlers.

import type { NormalizedTracking } from "./_types.ts";

export function str(v: any): string {
  return v != null ? String(v) : "";
}

export function num(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function dig(obj: any, ...keys: (string | number)[]): any {
  let cur: any = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k as any];
  }
  return cur;
}

export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSHA256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extracts tracking attributes from a `metadata` (or similar) bag passed by
 * the merchant's checkout. Accepts snake_case, camelCase and common aliases,
 * and walks nested objects/strings (Stripe `metadata[utm_source]`, Hotmart
 * `xcod`, Kiwify `src/sck`, etc.) before returning.
 */
export function extractTrackingFromMetadata(meta: any): NormalizedTracking {
  if (meta == null) return {};

  // Flatten metadata: many gateways nest tracking under `metadata`,
  // `custom_fields`, `properties`, `additional_info`, or send `metadata[utm_source]`
  // bracket-string keys. We normalize all of these into a single flat dict.
  const flat: Record<string, string> = {};
  const visit = (obj: any, depth = 0) => {
    if (obj == null || depth > 4) return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        // Custom-fields style: [{ name: "utm_source", value: "google" }]
        if (item && typeof item === "object") {
          const k = item.name ?? item.key ?? item.field ?? item.id;
          const v = item.value ?? item.val ?? item.content;
          if (k != null && v != null) flat[String(k).toLowerCase()] = String(v);
          else visit(item, depth + 1);
        }
      }
      return;
    }
    if (typeof obj !== "object") return;
    for (const [rawK, rawV] of Object.entries(obj)) {
      // Strip bracket notation: "metadata[utm_source]" → "utm_source"
      const k = String(rawK).replace(/^[a-z_]+\[/i, "").replace(/\]$/, "").toLowerCase();
      if (rawV == null) continue;
      if (typeof rawV === "object") visit(rawV, depth + 1);
      else flat[k] = String(rawV);
    }
  };
  visit(meta);

  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = flat[k.toLowerCase()];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return undefined;
  };

  return {
    gclid: get("gclid"),
    gbraid: get("gbraid"),
    wbraid: get("wbraid"),
    fbclid: get("fbclid"),
    fbp: get("fbp", "_fbp"),
    fbc: get("fbc", "_fbc"),
    ttclid: get("ttclid"),
    msclkid: get("msclkid", "msclickid", "ms_clkid"),
    utm_source: get("utm_source", "utmsource", "src"),
    utm_medium: get("utm_medium", "utmmedium"),
    utm_campaign: get("utm_campaign", "utmcampaign", "xcod"),
    utm_content: get("utm_content", "utmcontent", "sck"),
    utm_term: get("utm_term", "utmterm"),
    landing_page: get("landing_page", "landingpage", "first_page"),
    referrer: get("referrer", "referer"),
    user_agent: get("user_agent", "useragent", "ua"),
    ip: get("ip", "client_ip", "clientip", "remote_addr"),
    ga_client_id: get("ga_client_id", "client_id", "gaclientid", "ga_cid", "_ga"),
    // Browser event_id propagated through checkout metadata.
    // Critical for browser↔CAPI dedup (Meta/Google Ads).
    event_id: get(
      "event_id", "eventid", "trace_event_id", "browser_event_id",
      // Stripe `client_reference_id` is commonly used to carry our event_id.
      "client_reference_id", "clientreferenceid",
    ),
    // Multi-step canonical model — main order + N additional payments
    // (shipping_fee, handling_fee, upsell_1, insurance, priority_fee, warranty, tmt, ...).
    // Inference fallback in _canonical.ts handles externalReference patterns.
    root_order_code: get(
      "root_order_code", "rootordercode", "root_orderid", "root_order_id",
      "main_order_code", "mainordercode",
    ),
    parent_order_code: get(
      "parent_order_code", "parentordercode", "parent_order_id", "parentorderid",
    ),
    main_order_code: get("main_order_code", "mainordercode"),
    order_code: get("order_code", "ordercode", "ordercodigo"),
    step_key: get("step_key", "stepkey", "step", "checkout_step", "checkoutstep", "payment_role", "paymentrole"),
    checkout_step: get("checkout_step", "checkoutstep"),
    payment_role: get("payment_role", "paymentrole"),
    external_reference: get(
      "external_reference", "externalreference", "external_ref", "externalref",
    ),
  };
}
