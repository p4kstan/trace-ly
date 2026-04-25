import { describe, it, expect } from "vitest";
import {
  checkMultiDestinationConsistency,
  type DestinationDescriptor,
} from "./multi-destination-consistency";

const dest = (over: Partial<DestinationDescriptor> = {}): DestinationDescriptor => ({
  destination_id: "google_ads:111:abc",
  provider: "google_ads",
  account_id: "111",
  conversion_action_id: "abc",
  event_name: "purchase",
  credential_ref: "cred:google:111",
  consent_gate: true,
  status: "active",
  last_success_at: new Date().toISOString(),
  ...over,
});

describe("multi-destination consistency (Passo Q)", () => {
  it("returns safe empty state when no destinations supplied", () => {
    const r = checkMultiDestinationConsistency([]);
    expect(r.empty).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.total_destinations).toBe(0);
  });

  it("flags duplicate provider+account+action+event signatures", () => {
    const r = checkMultiDestinationConsistency([dest(), dest({ destination_id: "dup" })]);
    expect(r.issues.some((i) => i.code === "duplicate_destination")).toBe(true);
  });

  it("errors when credential_ref or consent_gate are missing", () => {
    const r = checkMultiDestinationConsistency([
      dest({ credential_ref: null, consent_gate: false }),
    ]);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("missing_credential_ref");
    expect(codes).toContain("missing_consent_gate");
  });

  it("warns on missing expected provider", () => {
    const r = checkMultiDestinationConsistency([dest()], ["google_ads", "meta"]);
    expect(
      r.issues.find(
        (i) => i.code === "no_destinations_for_provider" && i.provider === "meta",
      ),
    ).toBeTruthy();
  });

  it("flags stale destinations (>14 days without success)", () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const r = checkMultiDestinationConsistency([dest({ last_success_at: old })]);
    expect(r.issues.some((i) => i.code === "stale_status")).toBe(true);
  });

  it("never includes credential values or PII in messages", () => {
    const r = checkMultiDestinationConsistency([
      dest({ credential_ref: "cred:google:111" }),
    ]);
    const blob = JSON.stringify(r);
    expect(blob).not.toMatch(/@/);
    expect(blob).not.toMatch(/Bearer/i);
    expect(blob).not.toMatch(/[a-f0-9]{40,}/);
  });
});
