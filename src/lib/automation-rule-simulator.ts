/**
 * Automation Rule Simulator — Passo R.
 *
 * Adapter that takes a real `automation_rules` row (or a synthetic stub) and
 * produces a `SimulationInput` for the pure `simulateAutomationChange` engine.
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
