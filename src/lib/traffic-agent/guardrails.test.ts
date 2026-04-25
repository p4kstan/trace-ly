import { describe, it, expect } from "vitest";
import { evaluateGuardrails, SAFE_DEFAULT_GUARDRAILS } from "./guardrails";

describe("traffic-agent/guardrails", () => {
  it("blocks media-tune below sample size", () => {
    const d = evaluateGuardrails(SAFE_DEFAULT_GUARDRAILS, {
      action_type: "adjust_budget",
      provider: "google_ads",
      budget_change_percent: 10,
      observed_conversions: 5,
      observed_spend_cents: 100,
    });
    expect(d.allowed).toBe(false);
    expect(d.reasons.find((r) => r.code === "below_min_conversions")).toBeTruthy();
    expect(d.may_mutate_externally).toBe(false);
  });

  it("blocks budget change above max percent", () => {
    const d = evaluateGuardrails(SAFE_DEFAULT_GUARDRAILS, {
      action_type: "adjust_budget",
      provider: "google_ads",
      budget_change_percent: 50, // > 20
      observed_conversions: 100,
      observed_spend_cents: 1_000_000,
    });
    expect(d.allowed).toBe(false);
    expect(d.reasons.find((r) => r.code === "budget_change_exceeds_max")).toBeTruthy();
  });

  it("respects cooldown", () => {
    const d = evaluateGuardrails(
      SAFE_DEFAULT_GUARDRAILS,
      { action_type: "adjust_budget", provider: "google_ads", budget_change_percent: 5, observed_conversions: 100, observed_spend_cents: 1_000_000 },
      { last_action_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }, // 1h ago, cooldown 24h
    );
    expect(d.allowed).toBe(false);
    expect(d.reasons.find((r) => r.code === "cooldown_active")).toBeTruthy();
  });

  it("never mutates externally with safe defaults even when allowed", () => {
    const d = evaluateGuardrails(SAFE_DEFAULT_GUARDRAILS, {
      action_type: "adjust_budget",
      provider: "google_ads",
      budget_change_percent: 10,
      observed_conversions: 100,
      observed_spend_cents: 1_000_000,
    });
    expect(d.allowed).toBe(true);
    expect(d.may_mutate_externally).toBe(false);
    expect(d.reasons.find((r) => r.code === "live_mutations_disabled")).toBeTruthy();
  });

  it("only allows external mutation when mode=auto + allow_live + no approval", () => {
    const d = evaluateGuardrails(
      { ...SAFE_DEFAULT_GUARDRAILS, mode: "auto", allow_live_mutations: true, human_approval_required: false },
      { action_type: "adjust_budget", provider: "google_ads", budget_change_percent: 5, observed_conversions: 100, observed_spend_cents: 1_000_000 },
    );
    expect(d.allowed).toBe(true);
    expect(d.may_mutate_externally).toBe(true);
  });
});
