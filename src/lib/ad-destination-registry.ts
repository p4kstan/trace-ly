/**
 * Ad/Conversion Destination Registry — Passo R.
 *
 * Adapter that converts rows of the normalized `ad_conversion_destinations`
 * table into the generic `DestinationDescriptor` shape consumed by the
 * multi-destination consistency checker. When the registry is empty (workspace
 * never opted into Passo R), callers can pass legacy heuristic rows that this
 * module also normalizes — the consistency checker then runs once over a
 * uniform list, regardless of source.
 *
 * INVARIANTS:
 *   - We NEVER carry credentials. `credential_ref` is opaque pointer text only.
 *   - Test rows are always allowed but flagged via `consent_gate=false` only
 *     when the source explicitly says so — Passo R defaults `consent_gate_required`
 *     to TRUE in the DB.
 *   - Empty registry + empty fallback ⇒ caller gets a safe empty descriptor list
 *     and the consistency checker returns its "empty" report.
 */
import type { DestinationDescriptor } from "./multi-destination-consistency";

export interface RegistryRow {
  id?: string;
  provider: string;
  destination_id: string;
  display_name?: string | null;
  account_id?: string | null;
  conversion_action_id?: string | null;
  event_name?: string | null;
  pixel_id?: string | null;
  credential_ref?: string | null;
  status?: string | null;
  consent_gate_required?: boolean | null;
  send_enabled?: boolean | null;
  test_mode_default?: boolean | null;
  last_success_at?: string | null;
}

export interface FallbackRow {
  provider: string | null;
  status?: string | null;
}

export interface BuildOptions {
  /** Rows from the normalized registry (preferred). */
  registry?: RegistryRow[] | null;
  /** Heuristic rows derived from gateway_integrations_safe (legacy fallback). */
  fallback?: FallbackRow[] | null;
}

/**
 * Build a uniform `DestinationDescriptor[]` from registry rows when present,
 * otherwise from a heuristic fallback. The fallback is intentionally lossy
 * (no `account_id`/`conversion_action_id`) and is meant only for workspaces
 * that have not yet adopted the Passo R registry.
 */
export function buildDestinationDescriptors({
  registry,
  fallback,
}: BuildOptions): { descriptors: DestinationDescriptor[]; source: "registry" | "fallback" | "empty" } {
  if (registry && registry.length > 0) {
    const descriptors = registry.map<DestinationDescriptor>((r) => ({
      destination_id:
        r.id ?? `${r.provider}:${r.account_id ?? "?"}:${r.conversion_action_id ?? r.destination_id}`,
      provider: (r.provider ?? "unknown").toLowerCase(),
      account_id: r.account_id ?? null,
      conversion_action_id: r.conversion_action_id ?? null,
      event_name: r.event_name ?? "purchase",
      // Pointer only — never the secret value itself.
      credential_ref: r.credential_ref ?? null,
      // Registry default is "true" (Passo R column default); explicit false is
      // allowed but always surfaces a warning via the consistency checker.
      consent_gate: r.consent_gate_required !== false,
      status: r.status ?? "unknown",
      last_success_at: r.last_success_at ?? null,
    }));
    return { descriptors, source: "registry" };
  }

  if (fallback && fallback.length > 0) {
    const descriptors = fallback.map<DestinationDescriptor>((d, idx) => {
      const provider = (d.provider ?? "unknown").toLowerCase();
      return {
        destination_id: `${provider}:#${idx + 1}`,
        provider,
        account_id: null,
        conversion_action_id: null,
        event_name: "purchase",
        // Heuristic fallback never has a real credential_ref — surface the gap.
        credential_ref: null,
        // Heuristic fallback assumes consent gate enabled (safe default).
        consent_gate: true,
        status: d.status ?? "unknown",
        last_success_at: null,
      };
    });
    return { descriptors, source: "fallback" };
  }

  return { descriptors: [], source: "empty" };
}
