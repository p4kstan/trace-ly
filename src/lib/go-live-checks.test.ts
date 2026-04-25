import { describe, it, expect } from "vitest";
import { GO_LIVE_CHECKS, summarizeChecks } from "./go-live-checks";

describe("go-live-checks", () => {
  it("contains the canonical Passo M check ids without duplicates", () => {
    const ids = GO_LIVE_CHECKS.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const required of [
      "test-mode-replay",
      "canonical-main-step",
      "dedup-4col",
      "queue-health",
      "internal-alerts",
      "rls-critical-tables",
      "consent-export",
      "logs-no-pii",
      "prompts-installable",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("every check has a non-empty enforcedBy pointer", () => {
    for (const c of GO_LIVE_CHECKS) {
      expect(c.enforcedBy.length).toBeGreaterThan(10);
    }
  });

  it("summary matches the actual check list", () => {
    const s = summarizeChecks();
    expect(s.total).toBe(GO_LIVE_CHECKS.length);
    expect(s.enforced + s.manual + s.informational).toBe(s.total);
  });

  it("multi-step checks reference root_order_code/step_key in description", () => {
    const ms = GO_LIVE_CHECKS.find((c) => c.scope === "multi-step");
    expect(ms).toBeDefined();
    expect(ms!.description).toMatch(/root_order_code/);
    expect(ms!.description).toMatch(/step_key/);
  });
});
