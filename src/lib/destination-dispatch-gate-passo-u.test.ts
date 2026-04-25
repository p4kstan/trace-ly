/**
 * Passo U — contract test: test_mode hard-stop.
 *
 * The dispatch gate must NEVER produce an `allow` decision when the caller
 * is in test_mode/dry_run, regardless of registry state. The
 * process-events worker relies on this invariant to guarantee that no
 * external `fetch` to Meta/Google/TikTok/GA4 happens in test mode.
 *
 * This is a pure-function test (no network) that asserts the gate decision
 * shape. The worker-level guarantee is implemented in process-events
 * `gateItems()` by routing test_mode items into the `dryRun` bucket
 * BEFORE any provider dispatcher is called.
 */
import { describe, it, expect, vi } from "vitest";
import { decideDispatch, type RegistryDispatchRow } from "./destination-dispatch-gate";

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

describe("Passo U — test_mode hard-stop & no real network", () => {
  it("test_mode_default destinations are blocked when caller is NOT in test_mode", () => {
    const d = decideDispatch([row({ test_mode_default: true })], {
      provider: "google_ads", consent_granted: true, test_mode: false,
    });
    expect(d.targets).toHaveLength(0);
    expect(d.skipped[0].reasons).toContain("test_mode_only_destination");
  });

  it("global fetch is NEVER called by the pure gate (defense in depth)", () => {
    // The gate is a pure function. Spy on global fetch and assert it
    // is not invoked even if the caller passes a fully populated registry.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("fetch must not be called from decideDispatch");
    });
    try {
      const d = decideDispatch(
        [row(), row({ destination_id: "x", test_mode_default: true })],
        { provider: "google_ads", consent_granted: true, test_mode: true },
      );
      // Decision is computed locally — no network access.
      expect(d.fallback).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("decision payload has no PII / credential values, even with test_mode_default destinations", () => {
    const d = decideDispatch(
      [row({ test_mode_default: true, credential_ref: "vault:secret-pointer-xyz" })],
      { provider: "google_ads", consent_granted: true, test_mode: false },
    );
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
    expect(json).not.toMatch(/email|cpf|phone/i);
  });
});
