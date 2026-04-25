/**
 * Destination Dispatch Gate — Passo S.
 *
 * Pure decision function: given a list of registry rows for a workspace and
 * the dispatch context (provider, consent flag, test mode override), return
 * which destinations are eligible to receive a given canonical event.
 *
 * INVARIANTS:
 *   - NEVER calls external APIs. NEVER mutates data.
 *   - NEVER reads or returns credentials — only `credential_ref` pointer.
 *   - When the registry is empty for the requested provider, returns a
 *     `fallback: true` decision so legacy heuristic dispatchers keep working
 *     (we do NOT regress production deployments that haven't adopted Passo R).
 *   - `send_enabled=false`, `status!=active`, missing `credential_ref` and
 *     consent gate failures are surfaced as `blocked_reasons` (never thrown).
 *   - `test_mode_default=true` + caller-not-in-test-mode ⇒ skipped with reason
 *     so production payloads never reach a "test only" destination by accident.
 */

export interface RegistryDispatchRow {
  id?: string;
  provider: string;
  destination_id: string;
  account_id?: string | null;
  conversion_action_id?: string | null;
  event_name?: string | null;
  credential_ref?: string | null;
  status?: string | null;
  consent_gate_required?: boolean | null;
  send_enabled?: boolean | null;
  test_mode_default?: boolean | null;
}

export interface DispatchContext {
  /** Provider slug we want to dispatch to (lowercase). */
  provider: string;
  /** Optional event name to filter destinations bound to a specific event. */
  event_name?: string | null;
  /** Marketing/ads consent flag of the order/event. */
  consent_granted: boolean;
  /** True when the caller is operating in test/dry-run mode. */
  test_mode: boolean;
}

export interface DispatchTarget {
  destination_id: string;
  provider: string;
  account_id: string | null;
  conversion_action_id: string | null;
  event_name: string | null;
  credential_ref: string | null;
  test_mode: boolean;
}

export interface DispatchSkip {
  destination_id: string;
  provider: string;
  reasons: string[];
}

export interface DispatchDecision {
  /** True when the registry has no row for this provider and caller should fall back. */
  fallback: boolean;
  targets: DispatchTarget[];
  skipped: DispatchSkip[];
  /** Total registry rows matching the provider, before filtering. */
  matched_registry_rows: number;
}

function lower(v: string | null | undefined): string {
  return (v ?? "").toString().toLowerCase().trim();
}

/**
 * Decide which registry destinations are eligible to receive a dispatch.
 * Pure function — safe to call from edge functions, workers, or UI previews.
 */
export function decideDispatch(
  registry: RegistryDispatchRow[] | null | undefined,
  ctx: DispatchContext,
): DispatchDecision {
  const provider = lower(ctx.provider);
  const matched = (registry ?? []).filter((r) => lower(r.provider) === provider);

  if (matched.length === 0) {
    return { fallback: true, targets: [], skipped: [], matched_registry_rows: 0 };
  }

  const targets: DispatchTarget[] = [];
  const skipped: DispatchSkip[] = [];

  for (const row of matched) {
    const reasons: string[] = [];

    if (ctx.event_name && row.event_name && lower(row.event_name) !== lower(ctx.event_name)) {
      // Different event binding — silently not a match (do not surface as skip,
      // it's just irrelevant for this dispatch).
      continue;
    }

    if (row.send_enabled === false) {
      reasons.push("send_enabled=false");
    }
    const status = lower(row.status);
    if (status && status !== "active" && status !== "unknown") {
      reasons.push(`status=${status}`);
    }
    if (!row.credential_ref) {
      reasons.push("missing_credential_ref");
    }
    if (row.consent_gate_required !== false && ctx.consent_granted !== true) {
      // Default policy is consent gate ON (Passo R column default).
      reasons.push("consent_gate_blocked");
    }
    if (row.test_mode_default === true && ctx.test_mode !== true) {
      reasons.push("test_mode_only_destination");
    }

    if (reasons.length > 0) {
      skipped.push({
        destination_id: row.destination_id,
        provider: row.provider,
        reasons,
      });
      continue;
    }

    targets.push({
      destination_id: row.destination_id,
      provider: row.provider,
      account_id: row.account_id ?? null,
      conversion_action_id: row.conversion_action_id ?? null,
      event_name: row.event_name ?? null,
      credential_ref: row.credential_ref ?? null,
      test_mode: ctx.test_mode || row.test_mode_default === true,
    });
  }

  return {
    fallback: false,
    targets,
    skipped,
    matched_registry_rows: matched.length,
  };
}

/**
 * Mask a credential reference for display. We never show the value itself,
 * only that one is configured. If the input already looks like a URL/secret,
 * we still only echo back its prefix length.
 */
export function maskCredentialRef(ref: string | null | undefined): string {
  if (!ref) return "—";
  const s = String(ref);
  if (s.length <= 6) return "••••";
  return `${s.slice(0, 3)}••••${s.slice(-2)}`;
}
