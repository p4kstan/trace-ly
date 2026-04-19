// Shared utilities used across gateway handlers.

import type { NormalizedTracking } from "./_types.ts";

export function str(v: any): string {
  return v != null ? String(v) : "";
}

export function num(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function dig(obj: any, ...keys: string[]): any {
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
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
 * the merchant's checkout. Accepts snake_case, camelCase and common aliases.
 */
export function extractTrackingFromMetadata(meta: any): NormalizedTracking {
  if (!meta || typeof meta !== "object") return {};
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = meta[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return undefined;
  };
  return {
    gclid: get("gclid", "GCLID"),
    gbraid: get("gbraid"),
    wbraid: get("wbraid"),
    fbclid: get("fbclid"),
    fbp: get("fbp", "_fbp"),
    fbc: get("fbc", "_fbc"),
    ttclid: get("ttclid"),
    utm_source: get("utm_source", "utmSource"),
    utm_medium: get("utm_medium", "utmMedium"),
    utm_campaign: get("utm_campaign", "utmCampaign"),
    utm_content: get("utm_content", "utmContent"),
    utm_term: get("utm_term", "utmTerm"),
    landing_page: get("landing_page", "landingPage", "first_page"),
    referrer: get("referrer"),
    user_agent: get("user_agent", "userAgent", "ua"),
    ip: get("ip", "client_ip", "clientIp"),
    ga_client_id: get("ga_client_id", "client_id", "gaClientId"),
    // Browser event_id propagated through checkout metadata.
    // Critical for browser↔CAPI dedup (Meta/Google Ads).
    event_id: get("event_id", "eventId", "trace_event_id", "browser_event_id"),
  };
}
