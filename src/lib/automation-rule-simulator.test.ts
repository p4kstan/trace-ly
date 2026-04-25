import { describe, it, expect } from "vitest";
import { simulateRule, type AutomationRuleRow } from "./automation-rule-simulator";

const ctx = {
  kind: "budget" as const,
  target_id: "campaign:42",
  current_value: 100,
  proposed_value: 110,
  recent_conversions: 50,
  hours_since_last_change: 48,
};

const rule = (over: Partial<AutomationRuleRow> = {}): AutomationRuleRow => ({
  id: "rule-1",
  enabled: true,
  execution_mode: "recommendation",
  guardrails_json: null,
  action_json: null,
  ...over,
});

describe("automation-rule-simulator (Passo R)", () => {
  it("disabled rule short-circuits to blocked", () => {
    const r = simulateRule(rule({ enabled: false }), ctx);
    expect(r.outcome).toBe("blocked");
    expect(r.reasons.join(" ")).toMatch(/desabilitada/);
  });

  it("recommendation mode + clean guardrails ⇒ allowed", () => {
    const r = simulateRule(rule(), ctx);
    expect(r.outcome).toBe("allowed");
  });

  it("execution_mode is read from the column, NOT action_json (no spoof)", () => {
    // action_json claims auto, but column says recommendation — column wins.
    const r = simulateRule(
      rule({ execution_mode: "recommendation", action_json: { mode: "auto" } }),
      ctx,
    );
    expect(r.outcome).toBe("allowed");
    expect(r.audit_preview.execution_mode).toBe("recommendation");
  });

  it("auto without guardrails.auto_enabled stays auto_blocked", () => {
    const r = simulateRule(rule({ execution_mode: "auto" }), ctx);
    expect(r.outcome).toBe("auto_blocked");
  });

  it("auto allowed only when guardrails_json.auto_enabled=true and guardrails satisfied", () => {
    const r = simulateRule(
      rule({
        execution_mode: "auto",
        guardrails_json: { auto_enabled: true, min_conversions: 1, cooldown_hours: 1 },
      }),
      ctx,
    );
    expect(r.outcome).toBe("allowed");
  });

  it("guardrails_json overrides defaults (e.g. tighter cooldown)", () => {
    const r = simulateRule(
      rule({ guardrails_json: { cooldown_hours: 100 } }),
      { ...ctx, hours_since_last_change: 10 },
    );
    expect(r.outcome).toBe("needs_review");
    expect(r.reasons.join(" ")).toMatch(/cooldown/);
  });

  it("rollback plan is always present, never carries credentials", () => {
    const r = simulateRule(rule(), ctx);
    expect(r.rollback_plan).toMatch(/Reverter/);
    expect(r.rollback_plan).not.toMatch(/Bearer|token|secret/i);
  });

  it("unknown execution_mode value falls back to recommendation (safe default)", () => {
    const r = simulateRule(rule({ execution_mode: "weird-value" }), ctx);
    expect(r.audit_preview.execution_mode).toBe("recommendation");
  });
});
