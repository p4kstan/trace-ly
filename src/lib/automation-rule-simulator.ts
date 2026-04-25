/**
 * Automation Rule Simulator — Passo R + S.
 *
 * Adapter that takes a real `automation_rules` row (or a synthetic stub) and
 * produces a `SimulationInput` for the pure `simulateAutomationChange` engine.
 *
 * Passo S adds `simulateRulesForCampaign()` which iterates ALL applicable
 * rules for a workspace/campaign/provider and returns one aggregated report
 * grouped by rule + outcome — never short-circuits at the first rule.
 *
 * INVARIANTS:
 *   - `execution_mode` ALWAYS comes from the column (`rule.execution_mode`),
 *     never from `action_json.mode`. UI cannot spoof "auto".
 *   - When `enabled=false` we emit `execution_mode: "disabled"` so the engine
 *     short-circuits with reason "Regra está desabilitada".
 *   - `auto` is forwarded as-is — the engine still gates it behind
 *     `guardrails.auto_enabled`, which defaults to `false`.
 *   - This module does NOT call any external API. It only prepares the input.
 */
import {
  simulateAutomationChange,
  type Guardrails,
  type SimulationInput,
  type SimulationKind,
  type SimulationResult,
} from "./automation-simulator";

export interface AutomationRuleRow {
  id: string;
  enabled: boolean;
  execution_mode: string | null;
  guardrails_json: Record<string, unknown> | null;
  action_json: Record<string, unknown> | null;
  /** Optional scope filters used by Passo S grouping. */
  workspace_id?: string | null;
  customer_id?: string | null;
  campaign_id?: string | null;
  name?: string | null;
}

export interface RuleSimulationContext {
  /** Kind of change we want to simulate against THIS rule. */
  kind: SimulationKind;
  target_id: string;
  current_value: number;
  proposed_value: number;
  recent_conversions: number;
  hours_since_last_change: number;
}

function toMode(rule: AutomationRuleRow): SimulationInput["execution_mode"] {
  if (rule.enabled === false) return "disabled";
  const raw = (rule.execution_mode ?? "").toString().toLowerCase().trim();
  if (raw === "auto") return "auto";
  if (raw === "disabled") return "disabled";
  // Anything else (recommendation, dry_run, "", unknown values) is the
  // safe default — sugestão sem mutação.
  return "recommendation";
}

function toGuardrails(rule: AutomationRuleRow): Partial<Guardrails> {
  const g = (rule.guardrails_json ?? {}) as Record<string, unknown>;
  const out: Partial<Guardrails> = {};
  if (typeof g.min_conversions === "number") out.min_conversions = g.min_conversions;
  if (typeof g.cooldown_hours === "number") out.cooldown_hours = g.cooldown_hours;
  if (typeof g.max_budget_change_percent === "number")
    out.max_budget_change_percent = g.max_budget_change_percent;
  if (typeof g.max_bid_change_percent === "number")
    out.max_bid_change_percent = g.max_bid_change_percent;
  // Auto only enabled when guardrails explicitly opt-in; default remains false.
  if (g.auto_enabled === true) out.auto_enabled = true;
  return out;
}

export function simulateRule(
  rule: AutomationRuleRow,
  ctx: RuleSimulationContext,
): SimulationResult {
  const input: SimulationInput = {
    kind: ctx.kind,
    target_id: ctx.target_id,
    current_value: ctx.current_value,
    proposed_value: ctx.proposed_value,
    recent_conversions: ctx.recent_conversions,
    hours_since_last_change: ctx.hours_since_last_change,
    execution_mode: toMode(rule),
    guardrails: toGuardrails(rule),
  };
  return simulateAutomationChange(input);
}

// ──────────────────────────────────────────────────────────────────────
// Passo S — multi-rule simulator
// ──────────────────────────────────────────────────────────────────────

export interface RuleScopeFilter {
  /** Optional campaign id to focus on. Rules with `campaign_id=null` apply to all. */
  campaign_id?: string | null;
  /** Optional customer/provider account id (Google customer / Meta ad account). */
  customer_id?: string | null;
}

export interface MultiRuleEntry {
  rule_id: string;
  rule_name: string | null;
  result: SimulationResult;
  /** True when the rule is enabled AND its execution_mode is auto. */
  is_auto_attempt: boolean;
}

export interface MultiRuleReport {
  inspected_rules: number;
  applicable_rules: number;
  by_outcome: Record<SimulationResult["outcome"], number>;
  blocked_reasons: string[];
  entries: MultiRuleEntry[];
  /** True when zero applicable rules — UI shows safe empty state. */
  empty: boolean;
}

/**
 * Decide whether a stored rule applies to a given scope filter.
 *
 * Rules with `campaign_id=null` (or `customer_id=null`) are workspace-wide and
 * always apply. Rules with a specific id only apply when the filter matches.
 */
export function ruleAppliesTo(rule: AutomationRuleRow, filter: RuleScopeFilter): boolean {
  if (filter.campaign_id && rule.campaign_id && rule.campaign_id !== filter.campaign_id) {
    return false;
  }
  if (filter.customer_id && rule.customer_id && rule.customer_id !== filter.customer_id) {
    return false;
  }
  return true;
}

/**
 * Run the simulator across every applicable automation rule and return one
 * aggregated, dry-run report. Never short-circuits, never calls external APIs.
 */
export function simulateRulesForScope(
  rules: AutomationRuleRow[],
  filter: RuleScopeFilter,
  ctx: RuleSimulationContext,
): MultiRuleReport {
  const entries: MultiRuleEntry[] = [];
  const by_outcome: Record<SimulationResult["outcome"], number> = {
    allowed: 0,
    blocked: 0,
    needs_review: 0,
    auto_blocked: 0,
  };
  const blocked_reasons = new Set<string>();

  if (!rules || rules.length === 0) {
    return {
      inspected_rules: 0,
      applicable_rules: 0,
      by_outcome,
      blocked_reasons: [],
      entries: [],
      empty: true,
    };
  }

  let applicable = 0;
  for (const rule of rules) {
    if (!ruleAppliesTo(rule, filter)) continue;
    applicable++;
    const result = simulateRule(rule, ctx);
    by_outcome[result.outcome]++;
    if (result.outcome === "blocked" || result.outcome === "auto_blocked") {
      for (const r of result.reasons) blocked_reasons.add(r);
    }
    entries.push({
      rule_id: rule.id,
      rule_name: rule.name ?? null,
      result,
      is_auto_attempt:
        rule.enabled !== false &&
        (rule.execution_mode ?? "").toString().toLowerCase().trim() === "auto",
    });
  }

  return {
    inspected_rules: rules.length,
    applicable_rules: applicable,
    by_outcome,
    blocked_reasons: Array.from(blocked_reasons),
    entries,
    empty: applicable === 0,
  };
}
