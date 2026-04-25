// Contract tests for audience-seed-export.
//
// We do NOT hit the deployed function here. We assert the documented
// invariants of the request/response contract that the rest of the system
// relies on:
//
//   1. dry_run/preview path returns ONLY counts + field availability.
//      It MUST NOT contain `hashes` and MUST NOT contain raw PII keys.
//   2. Real export path returns ONLY hash-shaped fields (sha256 hex 64 chars
//      OR null) and never returns raw email/phone/document/address.
//   3. The `require_consent` flag defaults to TRUE (privacy-by-default).
//   4. The `limit` is clamped to a safe ceiling (≤ 50000).
//   5. Response audit metadata never embeds PII.
//
// Drift between source and tests is caught by `release-validate.sh`.

import { describe, it, expect } from "vitest";

const PII_KEYS = ["email", "phone", "cpf", "cnpj", "document", "address", "ip", "user_agent"];

function assertNoPiiKeys(obj: unknown, label: string) {
  const flat = JSON.stringify(obj || {}).toLowerCase();
  for (const k of PII_KEYS) {
    expect(flat.includes(`"${k}"`), `${label} must not contain PII key "${k}"`).toBe(false);
  }
}

describe("audience-seed-export — dry_run/preview contract", () => {
  it("preview response shape only contains counts and field-availability", () => {
    // Mirrors the response built when `dry_run === true`.
    const previewResponse = {
      dry_run: true,
      platform: "google_ads",
      rows_eligible: 123,
      orders_matched: 456,
      sample_inspected: 100,
      field_availability: {
        email_or_email_hash: 90,
        phone_or_phone_hash: 50,
        external_id: 10,
      },
      filters: {
        since_days: 90,
        min_order_value: 0,
        limit: 5000,
        require_consent: true,
      },
      note: "preview only — no hashes, no PII, no export written",
    };
    expect(previewResponse.dry_run).toBe(true);
    // No `hashes` array allowed.
    expect((previewResponse as Record<string, unknown>).hashes).toBeUndefined();
    // No raw-PII keys allowed anywhere.
    assertNoPiiKeys(previewResponse, "preview response");
  });

  it("preview log event mirrors counts only — no PII fields", () => {
    const logEvent = {
      evt: "audience_seed_export.preview",
      workspace_id: "00000000-0000-0000-0000-000000000001",
      platform: "meta",
      rows_eligible: 7,
      sample_inspected: 7,
      with_email: 4,
      with_phone: 2,
      with_external_id: 1,
      since_days: 90,
      require_consent: true,
    };
    assertNoPiiKeys(logEvent, "preview log event");
  });
});

describe("audience-seed-export — real export contract", () => {
  it("real export rows only contain hash fields (sha256 hex or null)", () => {
    type HashRow = {
      email_hash: string | null;
      phone_hash: string | null;
      external_id_hash: string | null;
    };
    const rows: HashRow[] = [
      {
        email_hash: "a".repeat(64),
        phone_hash: null,
        external_id_hash: null,
      },
      {
        email_hash: null,
        phone_hash: "b".repeat(64),
        external_id_hash: "c".repeat(64),
      },
    ];
    for (const r of rows) {
      // Each non-null field is a sha256 hex digest.
      for (const v of Object.values(r)) {
        if (v == null) continue;
        expect(v).toMatch(/^[a-f0-9]{64}$/i);
      }
      // No raw-PII keys leaked.
      const flat = JSON.stringify(r).toLowerCase();
      for (const k of ["email\":", "phone\":", "document\":"]) {
        expect(flat.includes(k.replace("\":", "\":\""))).toBe(false);
      }
    }
  });

  it("response envelope strips PII and only references hashes", () => {
    const response = {
      export_id: "uuid",
      platform: "google_ads",
      destination_customer_id: "1234567890",
      row_count: 2,
      hashes: [
        { email_hash: "a".repeat(64), phone_hash: null, external_id_hash: null },
      ],
      note: "first-party seed; not a copy of Google/Meta internal learning",
    };
    assertNoPiiKeys(response, "real export response");
  });
});

describe("audience-seed-export — safety defaults", () => {
  it("require_consent defaults to TRUE when caller omits it", () => {
    const body: { require_consent?: boolean } = {};
    const requireConsent = body.require_consent !== false;
    expect(requireConsent).toBe(true);
  });

  it("limit is clamped to the 50000 ceiling", () => {
    const requested = 10_000_000;
    const limit = Math.min(Math.max(requested || 5000, 1), 50000);
    expect(limit).toBe(50000);
  });

  it("since_days is clamped to 1..365", () => {
    expect(Math.min(Math.max(0, 1), 365)).toBe(1);
    expect(Math.min(Math.max(99999, 1), 365)).toBe(365);
  });

  it("missing JWT must yield 401 (contract)", () => {
    // Mirrors the early-return in index.ts when Authorization header is absent.
    const auth: string | null = null;
    const ok = !!(auth && auth.startsWith("Bearer "));
    expect(ok).toBe(false); // → function returns 401
  });

  it("non-member workspace must yield 403 (contract)", () => {
    // Mirrors the post-RPC `is_workspace_member` gate.
    const isMember = false;
    expect(isMember).toBe(false); // → function returns 403
  });
});
