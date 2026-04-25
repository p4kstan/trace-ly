/**
 * Data Reuse Eligibility — Passo P.
 *
 * Pure helpers (no network, no Supabase) that decide whether a given workspace
 * data point is eligible to be reused as:
 *   - Offline / Enhanced Conversion (Google Ads / GA4 / Meta CAPI / TikTok)
 *   - Customer Match / Audience seed (hash-only)
 *
 * INVARIANTS — these are enforced AT THIS LAYER, not at the destination layer:
 *   1. Raw PII (email, phone, document) is NEVER part of the eligibility output.
 *      Only hashed availability flags + counters are surfaced.
 *   2. Audience seed export REQUIRES consent flag (`require_consent !== false`).
 *   3. Preview/dry-run mode returns counts and reasons ONLY — no identifiers.
 *   4. We NEVER claim to copy a platform's internal ML learning. We surface
 *      first-party signals that allow a campaign to start better calibrated.
 */

export type Provider = "google_ads" | "ga4" | "meta" | "tiktok";

export type ClickIdKey =
  | "gclid"
  | "gbraid"
  | "wbraid"
  | "fbclid"
  | "ttclid"
  | "msclkid";

export interface PurchaseRecordSummary {
  /** Truthy when the record is a paid/confirmed conversion. */
  paid: boolean;
  /** Currency code (BRL/USD/...). Must be present for value-based events. */
  currency?: string | null;
  /** Order value in major units; can be 0 (lead). */
  value?: number | null;
  /** ISO timestamp when the conversion happened. */
  happened_at?: string | null;
  /** Stable canonical conversion identifier (e.g. order id). */
  order_id?: string | null;
  /** Idempotency identifier shared with destinations. */
  event_id?: string | null;
  /** True when caller has hashed-email/phone available. NEVER pass raw PII. */
  has_email_hash?: boolean;
  has_phone_hash?: boolean;
  /** Click IDs captured at top-of-funnel. */
  click_ids?: Partial<Record<ClickIdKey, boolean>>;
  /** Lawful-basis / consent flag captured at collection time. */
  consent_marketing?: boolean;
  /** Test-mode records must NEVER feed real exports. */
  test_mode?: boolean;
}

/* ------------------------------------------------------------------ */
/* Per-provider minimum requirements for offline/enhanced conversions */
/* ------------------------------------------------------------------ */

export interface ProviderRequirement {
  provider: Provider;
  label: string;
  /** Click IDs that, if present, unlock direct attribution. */
  preferred_click_ids: ClickIdKey[];
  /** True if hashed PII is an acceptable fallback when no click ID exists. */
  accepts_hashed_pii_fallback: boolean;
  /** Plain-English note shown in the UI. NEVER include keys/secrets. */
  guide: string;
}

export const PROVIDER_REQUIREMENTS: ProviderRequirement[] = [
  {
    provider: "google_ads",
    label: "Google Ads",
    preferred_click_ids: ["gclid", "gbraid", "wbraid"],
    accepts_hashed_pii_fallback: true,
    guide:
      "Use offline/enhanced conversions com gclid/gbraid/wbraid quando houver. Sem click ID, envie hash SHA-256 de email/telefone. " +
      "Para MCC, use cross-account conversion tracking; nunca duplique conversions entre contas.",
  },
  {
    provider: "ga4",
    label: "GA4",
    preferred_click_ids: ["gclid", "gbraid", "wbraid"],
    accepts_hashed_pii_fallback: true,
    guide:
      "Audiences GA4 podem ser vinculadas ao Google Ads para reuso entre campanhas. " +
      "User-provided data (UPD) só com consentimento e hash SHA-256.",
  },
  {
    provider: "meta",
    label: "Meta (Facebook/Instagram)",
    preferred_click_ids: ["fbclid"],
    accepts_hashed_pii_fallback: true,
    guide:
      "CAPI aceita hash SHA-256 de email/telefone + fbc/fbp/fbclid. Customer Match equivalente é Custom Audience com user data hash. " +
      "Ações em conta nova: comece com lookalike das audiences existentes, não copie pixel learning interno.",
  },
  {
    provider: "tiktok",
    label: "TikTok",
    preferred_click_ids: ["ttclid"],
    accepts_hashed_pii_fallback: true,
    guide:
      "Events API aceita ttclid + hash SHA-256 de email/telefone. Custom Audiences podem ser carregadas hash-only via Marketing API. " +
      "Não há como migrar machine-learning entre contas — aprendizado é por pixel.",
  },
];

/* ------------------------------------------------------------------ */
/*               Eligibility decisions per data record                */
/* ------------------------------------------------------------------ */

export type RejectReason =
  | "not_paid"
  | "test_mode"
  | "no_consent"
  | "missing_event_id"
  | "missing_value_for_currency"
  | "no_identifier_available";

export interface OfflineConversionDecision {
  provider: Provider;
  eligible: boolean;
  matched_click_ids: ClickIdKey[];
  fallback_hashed_pii: boolean;
  reasons: RejectReason[];
}

export function decideOfflineConversion(
  record: PurchaseRecordSummary,
  req: ProviderRequirement,
): OfflineConversionDecision {
  const reasons: RejectReason[] = [];
  if (!record.paid) reasons.push("not_paid");
  if (record.test_mode === true) reasons.push("test_mode");
  if (!record.event_id || record.event_id.trim() === "") reasons.push("missing_event_id");
  if (record.value != null && record.value > 0 && !record.currency) {
    reasons.push("missing_value_for_currency");
  }

  const matched: ClickIdKey[] = [];
  for (const k of req.preferred_click_ids) {
    if (record.click_ids?.[k]) matched.push(k);
  }
  const fallback =
    req.accepts_hashed_pii_fallback &&
    (record.has_email_hash === true || record.has_phone_hash === true);

  if (matched.length === 0 && !fallback) reasons.push("no_identifier_available");

  return {
    provider: req.provider,
    eligible: reasons.length === 0,
    matched_click_ids: matched,
    fallback_hashed_pii: fallback,
    reasons,
  };
}

export interface AudienceSeedDecision {
  eligible: boolean;
  reasons: RejectReason[];
  /** Hash-only signal availability. Never return the values themselves. */
  has_email_hash: boolean;
  has_phone_hash: boolean;
}

export function decideAudienceSeed(record: PurchaseRecordSummary): AudienceSeedDecision {
  const reasons: RejectReason[] = [];
  if (record.test_mode === true) reasons.push("test_mode");
  if (record.consent_marketing !== true) reasons.push("no_consent");
  if (!record.has_email_hash && !record.has_phone_hash) {
    reasons.push("no_identifier_available");
  }
  return {
    eligible: reasons.length === 0,
    reasons,
    has_email_hash: record.has_email_hash === true,
    has_phone_hash: record.has_phone_hash === true,
  };
}

/* ------------------------------------------------------------------ */
/*                    Workspace-level coverage report                 */
/* ------------------------------------------------------------------ */

export interface CoverageInput {
  records: PurchaseRecordSummary[];
}

export interface CoverageReport {
  total: number;
  paid: number;
  with_consent: number;
  click_id_coverage: Record<ClickIdKey, number>;
  hash_pii_coverage: { email_hash: number; phone_hash: number };
  audience_seed_eligible: number;
  offline_eligible_per_provider: Record<Provider, number>;
}

export function buildCoverageReport(input: CoverageInput): CoverageReport {
  const records = input.records ?? [];
  const click: Record<ClickIdKey, number> = {
    gclid: 0, gbraid: 0, wbraid: 0, fbclid: 0, ttclid: 0, msclkid: 0,
  };
  let paid = 0;
  let consent = 0;
  let emailHash = 0;
  let phoneHash = 0;
  let seedEligible = 0;
  const perProvider: Record<Provider, number> = {
    google_ads: 0, ga4: 0, meta: 0, tiktok: 0,
  };

  for (const r of records) {
    if (r.paid) paid++;
    if (r.consent_marketing === true) consent++;
    if (r.has_email_hash) emailHash++;
    if (r.has_phone_hash) phoneHash++;
    for (const k of Object.keys(click) as ClickIdKey[]) {
      if (r.click_ids?.[k]) click[k]++;
    }
    if (decideAudienceSeed(r).eligible) seedEligible++;
    for (const req of PROVIDER_REQUIREMENTS) {
      if (decideOfflineConversion(r, req).eligible) perProvider[req.provider]++;
    }
  }

  return {
    total: records.length,
    paid,
    with_consent: consent,
    click_id_coverage: click,
    hash_pii_coverage: { email_hash: emailHash, phone_hash: phoneHash },
    audience_seed_eligible: seedEligible,
    offline_eligible_per_provider: perProvider,
  };
}

/* ------------------------------------------------------------------ */
/*                      Preview / plan envelope                       */
/* ------------------------------------------------------------------ */

export interface PreviewEnvelope {
  dry_run: true;
  generated_at: string;
  coverage: CoverageReport;
  notes: string[];
}

/**
 * Builds a fully-static preview envelope. It NEVER includes raw PII or
 * hashes. It only surfaces counters + per-provider reasons + operator notes.
 */
export function buildPreviewEnvelope(input: CoverageInput): PreviewEnvelope {
  const coverage = buildCoverageReport(input);
  return {
    dry_run: true,
    generated_at: new Date().toISOString(),
    coverage,
    notes: [
      "Preview hash-only: nenhum identificador pessoal é retornado.",
      "Reuso de dados não copia o aprendizado interno (ML) das plataformas; apenas calibra melhor o início.",
      "Export real exige require_consent=true e devolve apenas hashes SHA-256.",
    ],
  };
}
