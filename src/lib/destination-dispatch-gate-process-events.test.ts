import { describe, it, expect } from "vitest";
import { decideDispatch, type RegistryDispatchRow } from "./destination-dispatch-gate";

/**
 * Passo T — process-events dispatch-gate integration contract.
 *
 * Mirrors the in-worker logic: empty registry ⇒ fallback (allow); non-empty ⇒
 * gate by send_enabled / status / consent / test_mode_default per destination.
 * No external calls, no PII, no credentials echoed.
 */
const row = (over: Partial<RegistryDispatchRow> = {}): RegistryDispatchRow => ({
  provider: "google_ads",
  destination_id: "google_ads:111:abc",
  account_id: "111",
  conversion_action_id: "abc",
  event_name: "purchase",
  credential_ref: "vault:google:111",
  status: "active",
  consent_gate_required: true,
  send_enabled: true,
  test_mode_default: false,
  ...over,
});

describe("process-events dispatch gate contract (Passo T)", () => {
  it("empty registry preserves legacy fallback (no regression)", () => {
    const d = decideDispatch([], { provider: "google_ads", consent_granted: true, test_mode: false });
    expect(d.fallback).toBe(true);
  });

  it("send_enabled=false blocks with reason", () => {
    const d = decideDispatch([row({ send_enabled: false })], { provider: "google_ads", consent_granted: true, test_mode: false });
    expect(d.targets).toHaveLength(0);
    expect(d.skipped[0].reasons).toContain("send_enabled=false");
  });

  it("status=paused blocks with reason", () => {
    const d = decideDispatch([row({ status: "paused" })], { provider: "google_ads", consent_granted: true, test_mode: false });
    expect(d.skipped[0].reasons.some((r) => r.startsWith("status="))).toBe(true);
  });

  it("consent_gate_required without consent blocks", () => {
    const d = decideDispatch([row()], { provider: "google_ads", consent_granted: false, test_mode: false });
    expect(d.skipped[0].reasons).toContain("consent_gate_blocked");
  });

  it("test_mode_default=true blocks live callers (no real network)", () => {
    const d = decideDispatch([row({ test_mode_default: true })], { provider: "google_ads", consent_granted: true, test_mode: false });
    expect(d.skipped[0].reasons).toContain("test_mode_only_destination");
  });

  it("decision payload never contains credentials or PII", () => {
    const d = decideDispatch([row()], { provider: "google_ads", consent_granted: true, test_mode: false });
    const json = JSON.stringify(d);
    // credential_ref is a pointer (vault:...) — not a secret value, but the
    // worker masks it again before recording. We assert no Bearer/token leaks.
    expect(json).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
    expect(json).not.toMatch(/access_token=/i);
    expect(json).not.toMatch(/email|cpf|phone/i);
  });

  it("retry/audit accounting is per destination_id (siblings independent)", () => {
    const registry = [
      row({ destination_id: "g:A", credential_ref: "vault:A" }),
      row({ destination_id: "g:B", send_enabled: false, credential_ref: "vault:B" }),
    ];
    const d = decideDispatch(registry, { provider: "google_ads", consent_granted: true, test_mode: false });
    expect(d.targets.map((t) => t.destination_id)).toEqual(["g:A"]);
    expect(d.skipped.map((s) => s.destination_id)).toEqual(["g:B"]);
  });
});
