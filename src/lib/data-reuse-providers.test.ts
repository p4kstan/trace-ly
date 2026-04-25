import { describe, it, expect } from "vitest";
import {
  buildOfflineConversionPreview,
  buildAudienceSeedPreview,
  buildClickIdCoverage,
  buildMaskedSample,
  CLICK_ID_PROVIDER_MAP,
} from "./data-reuse-providers";
import type { PurchaseRecordSummary } from "./data-reuse-eligibility";

const rec = (over: Partial<PurchaseRecordSummary> = {}): PurchaseRecordSummary => ({
  paid: true,
  currency: "BRL",
  value: 199,
  happened_at: new Date().toISOString(),
  order_id: "ORDER-X",
  event_id: "evt_x",
  has_email_hash: true,
  has_phone_hash: false,
  click_ids: { gclid: true, fbclid: false },
  consent_marketing: true,
  test_mode: false,
  ...over,
});

describe("data-reuse-providers (Passo Q)", () => {
  it("offline preview: counts paid+eligible per provider, NEVER leaks PII", () => {
    const out = buildOfflineConversionPreview("google_ads", {
      records: [
        rec(),
        rec({ click_ids: {} }),
        rec({ paid: false }),
      ],
    });
    expect(out.dry_run).toBe(true);
    expect(out.inspected).toBe(2);
    expect(out.eligible).toBeGreaterThanOrEqual(1);
    expect(out.matched_click_id).toBeGreaterThanOrEqual(1);
    expect(out.reasons.not_paid).toBe(1);

    const json = JSON.stringify(out);
    // No raw email/phone/document/hashes leak.
    expect(json).not.toMatch(/@/);
    expect(json).not.toMatch(/[a-f0-9]{40,}/);
    expect(json).not.toMatch(/cpf|cnpj/i);
    // Samples are masked.
    for (const s of out.sample_masked) {
      expect(s).toMatch(/\*\*\*/);
    }
  });

  it("audience seed preview blocks when consent_marketing != true", () => {
    const out = buildAudienceSeedPreview("meta", {
      records: [
        rec({ consent_marketing: false }),
        rec({ consent_marketing: true }),
        rec({ consent_marketing: true, has_email_hash: false, has_phone_hash: false }),
      ],
    });
    expect(out.dry_run).toBe(true);
    expect(out.eligible).toBe(1);
    expect(out.reasons.no_consent).toBe(1);
    expect(out.reasons.no_identifier_available).toBe(1);
  });

  it("buildMaskedSample never includes raw identifiers", () => {
    const s = buildMaskedSample(0, {
      has_email_hash: true,
      has_phone_hash: true,
      click_id: "gclid",
    });
    expect(s).not.toMatch(/@(?!\*)/); // no real email
    expect(s).toMatch(/\*\*\*/);
    expect(s).toMatch(/gclid=\*\*\*/);
  });

  it("click id coverage counts paid eligibility per field", () => {
    const cov = buildClickIdCoverage([
      { paid: true,  fields: { gclid: true, utm_source: true } },
      { paid: true,  fields: { fbclid: true } },
      { paid: false, fields: { gclid: true } },
    ]);
    const get = (f: string) => cov.find((r) => r.field === f)!;
    expect(get("gclid").total).toBe(2);
    expect(get("gclid").paid).toBe(1);
    expect(get("fbclid").eligible).toBe(1);
    expect(get("ga_client_id").total).toBe(0);
    expect(CLICK_ID_PROVIDER_MAP.gclid).toBe("google_ads");
    expect(CLICK_ID_PROVIDER_MAP.fbclid).toBe("meta");
    expect(CLICK_ID_PROVIDER_MAP.ttclid).toBe("tiktok");
    expect(CLICK_ID_PROVIDER_MAP.ga_client_id).toBe("ga4");
  });
});
