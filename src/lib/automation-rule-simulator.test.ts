import { describe, it, expect } from "vitest";
import {
  simulateRule,
  simulateRulesForScope,
  ruleAppliesTo,
  type AutomationRuleRow,
} from "./automation-rule-simulator";

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

describe("simulateRulesForScope (Passo S — multi-rule)", () => {
  it("returns safe empty report when no rules supplied", () => {
    const r = simulateRulesForScope([], {}, ctx);
    expect(r.empty).toBe(true);
    expect(r.entries).toEqual([]);
    expect(r.applicable_rules).toBe(0);
    expect(r.by_outcome.allowed).toBe(0);
  });

  it("iterates ALL applicable rules (does not stop at first)", () => {
    const rules = [
      rule({ id: "a" }),
      rule({ id: "b", enabled: false }),
      rule({ id: "c", execution_mode: "auto" }),
    ];
    const r = simulateRulesForScope(rules, {}, ctx);
    expect(r.applicable_rules).toBe(3);
    expect(r.entries.map((e) => e.rule_id).sort()).toEqual(["a", "b", "c"]);
    expect(r.by_outcome.allowed).toBe(1);
    expect(r.by_outcome.blocked).toBe(1);
    expect(r.by_outcome.auto_blocked).toBe(1);
  });

  it("scope filter matches workspace-wide rules (campaign_id null) AND specific ones", () => {
    const rules = [
      rule({ id: "ws", campaign_id: null }),
      rule({ id: "match", campaign_id: "camp-1" }),
      rule({ id: "other", campaign_id: "camp-2" }),
    ];
    const r = simulateRulesForScope(rules, { campaign_id: "camp-1" }, ctx);
    const ids = r.entries.map((e) => e.rule_id).sort();
    expect(ids).toEqual(["match", "ws"]);
  });

  it("ruleAppliesTo respects customer_id when set on both sides", () => {
    expect(
      ruleAppliesTo(rule({ customer_id: "111" }), { customer_id: "111" }),
    ).toBe(true);
    expect(
      ruleAppliesTo(rule({ customer_id: "111" }), { customer_id: "222" }),
    ).toBe(false);
    expect(
      ruleAppliesTo(rule({ customer_id: null }), { customer_id: "222" }),
    ).toBe(true);
  });

  it("aggregates blocked reasons (deduped) so UI can list them once", () => {
    const tight = { guardrails_json: { cooldown_hours: 99 } };
    const r = simulateRulesForScope(
      [rule({ id: "x", ...tight }), rule({ id: "y", ...tight })],
      {},
      { ...ctx, hours_since_last_change: 1 },
    );
    expect(r.blocked_reasons.length).toBeGreaterThan(0);
    // Same reason shouldn't appear twice.
    const uniq = new Set(r.blocked_reasons);
    expect(uniq.size).toBe(r.blocked_reasons.length);
  });

  it("flags is_auto_attempt only when column says auto AND rule is enabled", () => {
    const r = simulateRulesForScope(
      [
        rule({ id: "a", execution_mode: "auto" }),
        rule({ id: "b", execution_mode: "auto", enabled: false }),
        rule({ id: "c", execution_mode: "recommendation" }),
      ],
      {},
      ctx,
    );
    const map = Object.fromEntries(r.entries.map((e) => [e.rule_id, e.is_auto_attempt]));
    expect(map.a).toBe(true);
    expect(map.b).toBe(false);
    expect(map.c).toBe(false);
  });
});
