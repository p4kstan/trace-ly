import { describe, it, expect } from "vitest";
import {
  decideDispatch,
  maskCredentialRef,
  type RegistryDispatchRow,
} from "./destination-dispatch-gate";

const row = (over: Partial<RegistryDispatchRow> = {}): RegistryDispatchRow => ({
  id: "id-1",
  provider: "google_ads",
  destination_id: "google_ads:111:abc",
  account_id: "111",
  conversion_action_id: "abc",
  event_name: "purchase",
  credential_ref: "cred:google:111",
  status: "active",
  consent_gate_required: true,
  send_enabled: true,
  test_mode_default: false,
  ...over,
});

describe("destination-dispatch-gate (Passo S)", () => {
  it("returns fallback=true when registry has no row for the provider", () => {
    const d = decideDispatch([row({ provider: "meta" })], {
      provider: "google_ads",
      consent_granted: true,
      test_mode: false,
    });
    expect(d.fallback).toBe(true);
    expect(d.targets).toEqual([]);
    expect(d.matched_registry_rows).toBe(0);
  });

  it("returns fallback=true on empty/null registry — preserves legacy dispatchers", () => {
    expect(decideDispatch(null, { provider: "google_ads", consent_granted: true, test_mode: false }).fallback).toBe(true);
    expect(decideDispatch([], { provider: "google_ads", consent_granted: true, test_mode: false }).fallback).toBe(true);
  });

  it("dispatches a clean row when consent + active + credential_ref", () => {
    const d = decideDispatch([row()], {
      provider: "google_ads",
      consent_granted: true,
      test_mode: false,
    });
    expect(d.fallback).toBe(false);
    expect(d.targets).toHaveLength(1);
    expect(d.skipped).toEqual([]);
    expect(d.targets[0].credential_ref).toBe("cred:google:111");
  });

  it("blocks when send_enabled=false", () => {
    const d = decideDispatch([row({ send_enabled: false })], {
      provider: "google_ads", consent_granted: true, test_mode: false,
    });
    expect(d.targets).toEqual([]);
    expect(d.skipped[0].reasons).toContain("send_enabled=false");
  });

  it("blocks when status is not active", () => {
    const d = decideDispatch([row({ status: "paused" })], {
      provider: "google_ads", consent_granted: true, test_mode: false,
    });
    expect(d.skipped[0].reasons).toContain("status=paused");
  });

  it("blocks when credential_ref missing — and never echoes secret", () => {
    const d = decideDispatch([row({ credential_ref: null })], {
      provider: "google_ads", consent_granted: true, test_mode: false,
    });
    expect(d.skipped[0].reasons).toContain("missing_credential_ref");
    // Skip payload only carries pointers / codes, never raw values.
    expect(JSON.stringify(d)).not.toMatch(/Bearer|token=/i);
  });

  it("respects consent gate (default ON) — blocks when consent_granted=false", () => {
    const d = decideDispatch([row()], {
      provider: "google_ads", consent_granted: false, test_mode: false,
    });
    expect(d.skipped[0].reasons).toContain("consent_gate_blocked");
  });

  it("allows non-consented dispatch only when consent_gate_required=false", () => {
    const d = decideDispatch([row({ consent_gate_required: false })], {
      provider: "google_ads", consent_granted: false, test_mode: false,
    });
    expect(d.targets).toHaveLength(1);
  });

  it("skips test_mode_default rows for live callers", () => {
    const d = decideDispatch([row({ test_mode_default: true })], {
      provider: "google_ads", consent_granted: true, test_mode: false,
    });
    expect(d.skipped[0].reasons).toContain("test_mode_only_destination");
  });

  it("forwards test_mode flag to target when caller is in test mode", () => {
    const d = decideDispatch([row()], {
      provider: "google_ads", consent_granted: true, test_mode: true,
    });
    expect(d.targets[0].test_mode).toBe(true);
  });

  it("filters by event_name when provided on both row and context", () => {
    const d = decideDispatch(
      [row({ event_name: "purchase" }), row({ destination_id: "x", event_name: "lead" })],
      { provider: "google_ads", event_name: "purchase", consent_granted: true, test_mode: false },
    );
    expect(d.targets).toHaveLength(1);
    expect(d.targets[0].destination_id).toBe("google_ads:111:abc");
  });

  it("matches provider case-insensitively", () => {
    const d = decideDispatch([row({ provider: "Google_Ads" })], {
      provider: "google_ads", consent_granted: true, test_mode: false,
    });
    expect(d.fallback).toBe(false);
    expect(d.targets).toHaveLength(1);
  });

  it("maskCredentialRef never returns the raw value", () => {
    expect(maskCredentialRef(null)).toBe("—");
    expect(maskCredentialRef("abc")).toBe("••••");
    const masked = maskCredentialRef("cred:google:111-secret");
    expect(masked).not.toContain("secret");
    expect(masked).toMatch(/^cre/);
    expect(masked).toMatch(/11$/);
  });
});
