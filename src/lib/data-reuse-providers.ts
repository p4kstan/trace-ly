/**
 * Data Reuse Provider Previews — Passo Q.
 *
 * Pure helpers that build a per-provider preview describing what could be
 * exported / reused as offline conversions, audiences, or CAPI seeds.
 *
 * INVARIANTS (enforced by `data-reuse-providers.test.ts`):
 *   1. Preview output NEVER carries hashes, raw email/phone/document, click IDs,
 *      order codes or any other identifier. Counters and *availability flags*
 *      only.
 *   2. Sample rows surfaced for the operator are MASKED (e.g. "***@***" or
 *      "+55 ** ****-1234") — never the original value.
 *   3. Preview is always `dry_run: true`. Real export must take a different
 *      code path that is server-side and consent-gated.
 *   4. We never claim parity with the platform's internal ML/learning.
 */
import {
  PROVIDER_REQUIREMENTS,
  decideOfflineConversion,
  decideAudienceSeed,
  type Provider,
  type PurchaseRecordSummary,
  type RejectReason,
} from "./data-reuse-eligibility";

export type ProviderPreviewKind =
  | "offline_conversion"
  | "audience_seed"
  | "capi_event";

export interface ProviderPreview {
  provider: Provider;
  kind: ProviderPreviewKind;
  label: string;
  /** Total records inspected (paid only for offline_conversion). */
  inspected: number;
  /** Records eligible to be sent in a real export. */
  eligible: number;
  /** Records that match a click ID (Google: gclid/gbraid/wbraid, Meta: fbclid…). */
  matched_click_id: number;
  /** Records eligible only via hashed PII fallback. */
  matched_hash_only: number;
  /** Aggregate counts of each rejection reason — never the records themselves. */
  reasons: Record<RejectReason, number>;
  /** Field availability counters — booleans, no values. */
  fields_present: {
    email_hash: number;
    phone_hash: number;
    event_id: number;
    currency: number;
    happened_at: number;
  };
  /** Up to 3 redacted samples (email/phone masked) for operator preview. */
  sample_masked: ReadonlyArray<string>;
  /** Notes shown in UI — operator-friendly, no internals. */
  notes: ReadonlyArray<string>;
  dry_run: true;
}

const EMPTY_REASONS = (): Record<RejectReason, number> => ({
  not_paid: 0,
  test_mode: 0,
  no_consent: 0,
  missing_event_id: 0,
  missing_value_for_currency: 0,
  no_identifier_available: 0,
});

/* ------------------------------------------------------------------ */
/*                       Masking helpers (PII-safe)                   */
/* ------------------------------------------------------------------ */

/**
 * Deterministically mask an indicator so the operator can sanity-check that
 * the system has *something* per row, without revealing what.
 *
 * NEVER pass raw email / phone / cpf / cnpj here. The caller passes booleans
 * + the row index — we only generate a synthetic placeholder.
 */
export function buildMaskedSample(
  index: number,
  flags: { has_email_hash: boolean; has_phone_hash: boolean; click_id?: string | null },
): string {
  const parts: string[] = [`#${String(index + 1).padStart(3, "0")}`];
  if (flags.has_email_hash) parts.push("email:***@***");
  if (flags.has_phone_hash) parts.push("phone:+** ** ****-****");
  if (flags.click_id) parts.push(`click_id:${flags.click_id}=***`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/*                  Offline conversion preview / Provider             */
/* ------------------------------------------------------------------ */

export interface BuildPreviewInput {
  records: PurchaseRecordSummary[];
}

export function buildOfflineConversionPreview(
  provider: Provider,
  input: BuildPreviewInput,
): ProviderPreview {
  const req = PROVIDER_REQUIREMENTS.find((r) => r.provider === provider);
  if (!req) {
    throw new Error(`unknown provider: ${provider}`);
  }
  const reasons = EMPTY_REASONS();
  const fields = {
    email_hash: 0,
    phone_hash: 0,
    event_id: 0,
    currency: 0,
    happened_at: 0,
  };
  const samples: string[] = [];
  let inspected = 0;
  let eligible = 0;
  let matched_click_id = 0;
  let matched_hash_only = 0;

  for (const r of input.records) {
    if (!r.paid) {
      reasons.not_paid += 1;
      continue;
    }
    inspected += 1;
    if (r.has_email_hash) fields.email_hash += 1;
    if (r.has_phone_hash) fields.phone_hash += 1;
    if (r.event_id) fields.event_id += 1;
    if (r.currency) fields.currency += 1;
    if (r.happened_at) fields.happened_at += 1;

    const decision = decideOfflineConversion(r, req);
    for (const reason of decision.reasons) reasons[reason] += 1;
    if (decision.eligible) {
      eligible += 1;
      if (decision.matched_click_ids.length > 0) {
        matched_click_id += 1;
        if (samples.length < 3) {
          samples.push(
            buildMaskedSample(samples.length, {
              has_email_hash: !!r.has_email_hash,
              has_phone_hash: !!r.has_phone_hash,
              click_id: decision.matched_click_ids[0],
            }),
          );
        }
      } else if (decision.fallback_hashed_pii) {
        matched_hash_only += 1;
        if (samples.length < 3) {
          samples.push(
            buildMaskedSample(samples.length, {
              has_email_hash: !!r.has_email_hash,
              has_phone_hash: !!r.has_phone_hash,
            }),
          );
        }
      }
    }
  }

  return {
    provider,
    kind: "offline_conversion",
    label: req.label,
    inspected,
    eligible,
    matched_click_id,
    matched_hash_only,
    reasons,
    fields_present: fields,
    sample_masked: samples,
    notes: [
      "Preview hash-only — nenhum identificador é serializado.",
      "Eventos elegíveis exigem currency + value quando value > 0.",
      "Plataforma não copia ML interno; isso é apenas calibração inicial.",
    ],
    dry_run: true,
  };
}

export function buildAudienceSeedPreview(
  provider: Provider,
  input: BuildPreviewInput,
): ProviderPreview {
  const req = PROVIDER_REQUIREMENTS.find((r) => r.provider === provider);
  if (!req) throw new Error(`unknown provider: ${provider}`);
  const reasons = EMPTY_REASONS();
  const fields = {
    email_hash: 0,
    phone_hash: 0,
    event_id: 0,
    currency: 0,
    happened_at: 0,
  };
  const samples: string[] = [];
  let inspected = 0;
  let eligible = 0;

  for (const r of input.records) {
    inspected += 1;
    if (r.has_email_hash) fields.email_hash += 1;
    if (r.has_phone_hash) fields.phone_hash += 1;
    const d = decideAudienceSeed(r);
    for (const reason of d.reasons) reasons[reason] += 1;
    if (d.eligible) {
      eligible += 1;
      if (samples.length < 3) {
        samples.push(
          buildMaskedSample(samples.length, {
            has_email_hash: d.has_email_hash,
            has_phone_hash: d.has_phone_hash,
          }),
        );
      }
    }
  }

  return {
    provider,
    kind: "audience_seed",
    label: req.label,
    inspected,
    eligible,
    matched_click_id: 0,
    matched_hash_only: eligible,
    reasons,
    fields_present: fields,
    sample_masked: samples,
    notes: [
      "Audience seed é hash-only e exige consentimento marketing por linha.",
      "Sem PII bruta no preview; o export real é feito no servidor.",
    ],
    dry_run: true,
  };
}

/* ------------------------------------------------------------------ */
/*                     Click ID coverage report                        */
/* ------------------------------------------------------------------ */

export type ClickIdField =
  | "gclid"
  | "gbraid"
  | "wbraid"
  | "fbclid"
  | "fbp"
  | "fbc"
  | "ttclid"
  | "msclkid"
  | "ga_client_id"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign";

export interface ClickIdRecord {
  paid: boolean;
  fields: Partial<Record<ClickIdField, boolean>>;
}

export interface ClickIdCoverageRow {
  field: ClickIdField;
  total: number;
  paid: number;
  /** Count of paid rows that ALSO carry this field (eligible). */
  eligible: number;
  /** Provider that benefits from this field for offline / audience reuse. */
  primary_provider: Provider | "all";
}

export const CLICK_ID_PROVIDER_MAP: Record<ClickIdField, Provider | "all"> = {
  gclid: "google_ads",
  gbraid: "google_ads",
  wbraid: "google_ads",
  fbclid: "meta",
  fbp: "meta",
  fbc: "meta",
  ttclid: "tiktok",
  msclkid: "google_ads", // Microsoft is reused via Google Ads here; explicit gap noted
  ga_client_id: "ga4",
  utm_source: "all",
  utm_medium: "all",
  utm_campaign: "all",
};

export function buildClickIdCoverage(records: ClickIdRecord[]): ClickIdCoverageRow[] {
  const fields = Object.keys(CLICK_ID_PROVIDER_MAP) as ClickIdField[];
  return fields.map((field) => {
    let total = 0;
    let paid = 0;
    let eligible = 0;
    for (const r of records) {
      if (r.fields?.[field]) {
        total += 1;
        if (r.paid) {
          paid += 1;
          eligible += 1;
        }
      }
    }
    return {
      field,
      total,
      paid,
      eligible,
      primary_provider: CLICK_ID_PROVIDER_MAP[field],
    };
  });
}
