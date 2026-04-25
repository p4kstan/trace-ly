import { describe, it, expect } from "vitest";
import {
  PROVIDER_REQUIREMENTS,
  decideOfflineConversion,
  decideAudienceSeed,
  buildCoverageReport,
  buildPreviewEnvelope,
  type PurchaseRecordSummary,
} from "./data-reuse-eligibility";

const baseRecord = (over: Partial<PurchaseRecordSummary> = {}): PurchaseRecordSummary => ({
  paid: true,
  currency: "BRL",
  value: 100,
  happened_at: new Date().toISOString(),
  order_id: "ORDER-1",
  event_id: "evt_1",
  has_email_hash: true,
  has_phone_hash: false,
  click_ids: { gclid: true, fbclid: true, ttclid: false },
  consent_marketing: true,
  test_mode: false,
  ...over,
});

describe("data-reuse-eligibility (Passo P)", () => {
  it("offline conversion: Google Ads accepts gclid match", () => {
    const req = PROVIDER_REQUIREMENTS.find((r) => r.provider === "google_ads")!;
    const d = decideOfflineConversion(baseRecord(), req);
    expect(d.eligible).toBe(true);
    expect(d.matched_click_ids).toContain("gclid");
  });

  it("offline conversion: Meta accepts hashed PII fallback when no fbclid", () => {
    const req = PROVIDER_REQUIREMENTS.find((r) => r.provider === "meta")!;
    const d = decideOfflineConversion(baseRecord({ click_ids: {} }), req);
    expect(d.eligible).toBe(true);
    expect(d.fallback_hashed_pii).toBe(true);
  });

  it("rejects test_mode AND not_paid AND missing event_id", () => {
    const req = PROVIDER_REQUIREMENTS.find((r) => r.provider === "tiktok")!;
    const d = decideOfflineConversion(
      baseRecord({ test_mode: true, paid: false, event_id: "" }),
      req,
    );
    expect(d.eligible).toBe(false);
    expect(d.reasons).toEqual(
      expect.arrayContaining(["not_paid", "test_mode", "missing_event_id"]),
    );
  });

  it("audience seed REQUIRES consent and at least one hash", () => {
    expect(decideAudienceSeed(baseRecord()).eligible).toBe(true);
    expect(decideAudienceSeed(baseRecord({ consent_marketing: false })).eligible).toBe(false);
    expect(
      decideAudienceSeed(
        baseRecord({ has_email_hash: false, has_phone_hash: false }),
      ).eligible,
    ).toBe(false);
  });

  it("coverage report aggregates counters without leaking identifiers", () => {
    const report = buildCoverageReport({
      records: [
        baseRecord(),
        baseRecord({ click_ids: { fbclid: true } }),
        baseRecord({ paid: false, consent_marketing: false, has_email_hash: false }),
      ],
    });
    expect(report.total).toBe(3);
    expect(report.paid).toBe(2);
    expect(report.with_consent).toBe(2);
    expect(report.click_id_coverage.gclid).toBe(1);
    expect(report.click_id_coverage.fbclid).toBe(2);
    expect(report.audience_seed_eligible).toBe(2);
    expect(report.offline_eligible_per_provider.google_ads).toBe(1);
    expect(report.offline_eligible_per_provider.meta).toBe(2);
    // Sanity: serialized report must NOT contain "email" or "phone" raw
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/@/); // no email-like value
    expect(json).not.toMatch(/[a-f0-9]{40,}/); // no hash leaked
  });

  it("preview envelope is dry_run true and carries notes warning about ML reuse", () => {
    const env = buildPreviewEnvelope({ records: [baseRecord()] });
    expect(env.dry_run).toBe(true);
    expect(env.notes.join(" ")).toMatch(/aprendizado interno|ML/);
    expect(JSON.stringify(env)).not.toMatch(/raw|email:/i);
  });
});
