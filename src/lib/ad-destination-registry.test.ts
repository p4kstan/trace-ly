import { describe, it, expect } from "vitest";
import { buildDestinationDescriptors, type RegistryRow } from "./ad-destination-registry";

const registryRow = (over: Partial<RegistryRow> = {}): RegistryRow => ({
  id: "00000000-0000-0000-0000-000000000111",
  provider: "google_ads",
  destination_id: "google_ads:111:abc",
  display_name: "Google Ads MCC #1",
  account_id: "111",
  conversion_action_id: "abc",
  event_name: "purchase",
  pixel_id: null,
  credential_ref: "cred:google:111",
  status: "active",
  consent_gate_required: true,
  send_enabled: false,
  test_mode_default: true,
  last_success_at: null,
  ...over,
});

describe("ad-destination-registry (Passo R)", () => {
  it("returns empty list and source=empty when nothing supplied", () => {
    const r = buildDestinationDescriptors({});
    expect(r.descriptors).toEqual([]);
    expect(r.source).toBe("empty");
  });

  it("uses registry rows when present (preferred path)", () => {
    const r = buildDestinationDescriptors({
      registry: [registryRow()],
      fallback: [{ provider: "google_ads", status: "active" }],
    });
    expect(r.source).toBe("registry");
    expect(r.descriptors[0].account_id).toBe("111");
    expect(r.descriptors[0].conversion_action_id).toBe("abc");
    expect(r.descriptors[0].consent_gate).toBe(true);
    expect(r.descriptors[0].credential_ref).toBe("cred:google:111");
  });

  it("falls back to heuristic when registry is empty", () => {
    const r = buildDestinationDescriptors({
      registry: [],
      fallback: [{ provider: "META", status: "active" }],
    });
    expect(r.source).toBe("fallback");
    expect(r.descriptors[0].provider).toBe("meta");
    // heuristic fallback intentionally has no credential_ref so the
    // consistency checker surfaces the gap.
    expect(r.descriptors[0].credential_ref).toBeNull();
    expect(r.descriptors[0].consent_gate).toBe(true);
  });

  it("flags consent gate disabled only when registry says so explicitly", () => {
    const r = buildDestinationDescriptors({
      registry: [registryRow({ consent_gate_required: false })],
    });
    expect(r.descriptors[0].consent_gate).toBe(false);
  });

  it("never carries secret-looking strings — credential_ref is opaque only", () => {
    const r = buildDestinationDescriptors({
      registry: [registryRow({ credential_ref: "vault://google/111" })],
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toMatch(/Bearer/i);
    expect(blob).not.toMatch(/[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/); // no JWT
  });
});
