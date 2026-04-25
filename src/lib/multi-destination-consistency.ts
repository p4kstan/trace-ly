/**
 * Multi-Destination Consistency Checker — Passo Q.
 *
 * Validates that a workspace's destination configuration can route the same
 * canonical event to multiple provider/account/conversion-action endpoints
 * with separate auditing and retry. Operates ONLY on metadata supplied by the
 * caller — never queries DB or external APIs here.
 *
 * INVARIANTS:
 *   - No PII / secrets. Inputs already redacted.
 *   - Issues are categorized; severity drives the UI badge but never blocks.
 *   - Empty inputs return an empty-but-safe report.
 */

export type ConsistencyIssueCode =
  | "duplicate_destination"
  | "missing_credential_ref"
  | "missing_consent_gate"
  | "no_destinations_for_provider"
  | "ambiguous_account"
  | "stale_status";

export type ConsistencySeverity = "info" | "warning" | "error";

export interface DestinationDescriptor {
  /** Stable destination identifier, e.g. provider:account:conversion_action. */
  destination_id: string;
  provider: string;
  /** Account / Customer / Pixel id (string only — already redacted). */
  account_id?: string | null;
  /** Conversion action id when applicable. */
  conversion_action_id?: string | null;
  /** Event name targeted by this destination. */
  event_name?: string | null;
  /** Reference (NOT value) to credential storage. */
  credential_ref?: string | null;
  /** True when destination respects consent gate. */
  consent_gate?: boolean;
  /** Last status reported (active / failing / paused / unknown). */
  status?: string | null;
  /** ISO timestamp of last successful delivery. */
  last_success_at?: string | null;
}

export interface ConsistencyIssue {
  code: ConsistencyIssueCode;
  severity: ConsistencySeverity;
  destination_id?: string;
  provider?: string;
  message: string;
}

export interface ConsistencyReport {
  total_destinations: number;
  by_provider: Record<string, number>;
  issues: ConsistencyIssue[];
  /** True when zero destinations were supplied — UI shows safe empty state. */
  empty: boolean;
}

const STALE_DAYS = 14;

export function checkMultiDestinationConsistency(
  destinations: DestinationDescriptor[],
  expectedProviders: string[] = [],
): ConsistencyReport {
  const issues: ConsistencyIssue[] = [];
  const by_provider: Record<string, number> = {};
  const seenSignatures = new Map<string, DestinationDescriptor>();

  if (!destinations || destinations.length === 0) {
    return {
      total_destinations: 0,
      by_provider: {},
      issues: [],
      empty: true,
    };
  }

  const now = Date.now();

  for (const d of destinations) {
    by_provider[d.provider] = (by_provider[d.provider] ?? 0) + 1;

    // duplicate (same provider + account + conversion_action + event_name)
    const signature = [
      d.provider,
      d.account_id ?? "",
      d.conversion_action_id ?? "",
      d.event_name ?? "",
    ].join("|");
    if (seenSignatures.has(signature)) {
      issues.push({
        code: "duplicate_destination",
        severity: "warning",
        destination_id: d.destination_id,
        provider: d.provider,
        message: `Destino duplicado para ${d.provider} (mesma conta/ação/evento).`,
      });
    } else {
      seenSignatures.set(signature, d);
    }

    if (!d.credential_ref) {
      issues.push({
        code: "missing_credential_ref",
        severity: "error",
        destination_id: d.destination_id,
        provider: d.provider,
        message: `Sem credential_ref configurado para ${d.provider}.`,
      });
    }

    if (d.consent_gate !== true) {
      issues.push({
        code: "missing_consent_gate",
        severity: "error",
        destination_id: d.destination_id,
        provider: d.provider,
        message: `Consent gate ausente em ${d.provider}/${d.destination_id}.`,
      });
    }

    if (!d.account_id || d.account_id.trim() === "") {
      issues.push({
        code: "ambiguous_account",
        severity: "warning",
        destination_id: d.destination_id,
        provider: d.provider,
        message: `Account/Customer ID em branco para ${d.provider}.`,
      });
    }

    if (d.last_success_at) {
      const ts = Date.parse(d.last_success_at);
      if (Number.isFinite(ts) && now - ts > STALE_DAYS * 86_400_000) {
        issues.push({
          code: "stale_status",
          severity: "info",
          destination_id: d.destination_id,
          provider: d.provider,
          message: `Última entrega bem-sucedida há mais de ${STALE_DAYS} dias.`,
        });
      }
    }
  }

  for (const expected of expectedProviders) {
    if (!by_provider[expected]) {
      issues.push({
        code: "no_destinations_for_provider",
        severity: "warning",
        provider: expected,
        message: `Nenhum destino configurado para ${expected}.`,
      });
    }
  }

  return {
    total_destinations: destinations.length,
    by_provider,
    issues,
    empty: false,
  };
}
