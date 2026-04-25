import { describe, it, expect } from "vitest";
import {
  simulateAutomationChange,
  DEFAULT_GUARDRAILS,
} from "./automation-simulator";

const base = {
  kind: "budget" as const,
  target_id: "campaign:42",
  current_value: 100,
  proposed_value: 110,
  recent_conversions: 50,
  hours_since_last_change: 48,
  execution_mode: "recommendation" as const,
};

describe("automation simulator (Passo Q)", () => {
  it("default guardrails block auto and require min conversions", () => {
    expect(DEFAULT_GUARDRAILS.auto_enabled).toBe(false);
    expect(DEFAULT_GUARDRAILS.min_conversions).toBeGreaterThan(0);
  });

  it("recommendation with all guardrails satisfied is allowed", () => {
    const r = simulateAutomationChange({ ...base });
    expect(r.outcome).toBe("allowed");
    expect(r.dry_run).toBe(true);
    expect(r.audit_preview.delta_percent).toBe(10);
  });

  it("recommendation with insufficient conversions becomes needs_review", () => {
    const r = simulateAutomationChange({ ...base, recent_conversions: 5 });
    expect(r.outcome).toBe("needs_review");
    expect(r.reasons.join(" ")).toMatch(/conversões/);
  });

  it("recommendation with cooldown active becomes needs_review", () => {
    const r = simulateAutomationChange({ ...base, hours_since_last_change: 2 });
    expect(r.outcome).toBe("needs_review");
    expect(r.reasons.join(" ")).toMatch(/cooldown/);
  });

  it("recommendation exceeding budget delta becomes needs_review", () => {
    const r = simulateAutomationChange({ ...base, proposed_value: 200 });
    expect(r.outcome).toBe("needs_review");
    expect(r.reasons.join(" ")).toMatch(/excede/);
  });

  it("auto execution is BLOCKED by default even when clean", () => {
    const r = simulateAutomationChange({ ...base, execution_mode: "auto" });
    expect(r.outcome).toBe("auto_blocked");
    expect(r.reasons.join(" ")).toMatch(/auto/i);
  });

  it("auto execution allowed only when auto_enabled=true and clean", () => {
    const r = simulateAutomationChange({
      ...base,
      execution_mode: "auto",
      guardrails: { auto_enabled: true },
    });
    expect(r.outcome).toBe("allowed");
  });

  it("disabled mode is always blocked", () => {
    const r = simulateAutomationChange({
      ...base,
      execution_mode: "disabled",
    });
    expect(r.outcome).toBe("blocked");
  });

  it("rollback_plan is always emitted and never carries credentials", () => {
    const r = simulateAutomationChange({ ...base });
    expect(r.rollback_plan).toMatch(/Reverter/);
    expect(r.rollback_plan).not.toMatch(/Bearer|token|secret/i);
  });
});
