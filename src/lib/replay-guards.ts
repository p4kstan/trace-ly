/**
 * Replay-guards — Passo O.
 *
 * Pure helpers that mirror the runtime guards inside `event-replay` and
 * `webhook-replay-test` Edge Functions. Kept in /src so they are unit-testable
 * in Vitest WITHOUT making real network calls or hitting Supabase.
 *
 * Invariants checked:
 *   1. Auth: caller MUST present a Bearer JWT and be a workspace admin.
 *   2. test_mode=true is mandatory (replay never dispatches real events).
 *   3. Forbidden raw-PII keys must never appear in the payload.
 *   4. Dry-run / test-mode path must not call any external destination.
 */
export interface ReplayInput {
  /** True when caller proved a JWT upstream. */
  hasJwt: boolean;
  /** True when caller is workspace admin/owner upstream. */
  isWorkspaceAdmin: boolean;
  /** Body field — must be exactly true to allow replay. */
  testMode: unknown;
  /** Sanitized payload. */
  payload: unknown;
  /** When true, simulates production traffic (signature required). */
  productionTraffic?: boolean;
  /** When true, an HMAC signature header was present and verified. */
  signatureVerified?: boolean;
}

export type ReplayDecision =
  | { allow: true }
  | { allow: false; reason: ReplayRejectReason; details?: string[] };

export type ReplayRejectReason =
  | "missing_jwt"
  | "not_workspace_admin"
  | "test_mode_required"
  | "raw_pii_detected"
  | "missing_signature"
  | "invalid_payload";

const FORBIDDEN_PII_KEYS = [
  "email", "phone", "telephone", "cpf", "cnpj", "document",
  "ssn", "rg", "passport", "first_name", "last_name", "full_name",
  "address", "street", "zip", "postal_code",
];

export function detectRawPII(node: unknown, path: string[] = []): string[] {
  if (node === null || typeof node !== "object") return [];
  const found: string[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    const isHashed = lower.endsWith("_hash") || lower.endsWith("_sha256");
    if (!isHashed && FORBIDDEN_PII_KEYS.some(p => lower === p || lower.endsWith(`_${p}`))) {
      if (typeof v === "string" && v.length > 0) {
        found.push([...path, k].join("."));
      }
    }
    if (v && typeof v === "object") {
      found.push(...detectRawPII(v, [...path, k]));
    }
  }
  return found;
}

export function decideReplay(input: ReplayInput): ReplayDecision {
  if (!input.hasJwt) return { allow: false, reason: "missing_jwt" };
  if (!input.isWorkspaceAdmin) return { allow: false, reason: "not_workspace_admin" };
  if (input.testMode !== true) return { allow: false, reason: "test_mode_required" };
  if (!input.payload || typeof input.payload !== "object") {
    return { allow: false, reason: "invalid_payload" };
  }
  const piiHits = detectRawPII(input.payload);
  if (piiHits.length > 0) {
    return { allow: false, reason: "raw_pii_detected", details: piiHits };
  }
  // Production traffic without verified signature must never reach the dispatcher.
  if (input.productionTraffic === true && input.signatureVerified !== true) {
    return { allow: false, reason: "missing_signature" };
  }
  return { allow: true };
}

/**
 * Returns true when the dispatcher MUST skip every external destination.
 * Used by `gateway-webhook` and downstream worker to honor test_mode/dry-run.
 */
export function shouldSkipExternalDispatch(opts: {
  testMode: boolean;
  dryRun?: boolean;
}): boolean {
  return opts.testMode === true || opts.dryRun === true;
}
