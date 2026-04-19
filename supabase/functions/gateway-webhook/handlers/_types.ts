// Shared types for gateway handlers (Service Pattern / Registry).
// Each handler implements GatewayHandler and is registered in _registry.ts.

export type InternalEvent =
  | "checkout_created" | "checkout_started" | "checkout_abandoned"
  | "order_created" | "order_pending" | "order_waiting_payment"
  | "order_paid" | "order_approved" | "order_refused" | "order_canceled"
  | "order_expired" | "order_refunded" | "order_partially_refunded" | "order_chargeback"
  | "payment_created" | "payment_pending" | "payment_authorized" | "payment_paid"
  | "payment_failed" | "payment_refunded"
  | "pix_generated" | "pix_paid" | "boleto_generated" | "boleto_paid"
  | "subscription_started" | "subscription_renewed" | "subscription_past_due" | "subscription_canceled"
  | "lead_captured";

export interface NormalizedCustomer {
  name?: string;
  email?: string;
  phone?: string;
  document?: string;
  // Address fields — used for Enhanced Conversions (Meta + Google Ads).
  // Capturing as much as possible improves match-rate dramatically.
  first_name?: string;
  last_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  /** Client IP at the moment of purchase (gateway-provided). */
  ip?: string;
  /** Client User-Agent at the moment of purchase (gateway-provided). */
  user_agent?: string;
}

export interface NormalizedTracking {
  gclid?: string; gbraid?: string; wbraid?: string;
  fbclid?: string; fbp?: string; fbc?: string; ttclid?: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string;
  landing_page?: string; referrer?: string;
  user_agent?: string; ip?: string;
  ga_client_id?: string;
  /** Browser-side event_id propagated through checkout metadata.
   *  Critical for browser↔CAPI dedup (Meta/Google Ads). */
  event_id?: string;
}

export interface NormalizedOrder {
  gateway: string;
  external_order_id: string;
  external_payment_id?: string;
  external_checkout_id?: string;
  external_subscription_id?: string;
  customer: NormalizedCustomer;
  status: string;
  total_value?: number;
  currency?: string;
  payment_method?: string;
  installments?: number;
  items?: Array<{
    product_id?: string;
    product_name?: string;
    category?: string;
    quantity: number;
    unit_price?: number;
    total_price?: number;
  }>;
  tracking?: NormalizedTracking;
  raw_payload: unknown;
}

/**
 * Contract every gateway must implement.
 * - extractEventType: pulls the gateway-specific event name from the payload
 * - resolveInternalEvent: maps that name to an internal canonical event
 * - normalize: produces a NormalizedOrder ready for downstream queueing
 * - validateHMAC (optional): provider-specific signature verification.
 *   When omitted, the main router falls back to its generic verifier.
 */
export interface GatewayHandler {
  extractEventType(payload: any): string;
  resolveInternalEvent(eventType: string): InternalEvent;
  normalize(payload: any): NormalizedOrder;
  validateHMAC?(rawBody: string, headers: Headers, secret: string | null): Promise<{ valid: boolean; reason: string }>;
}
