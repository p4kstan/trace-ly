/**
 * Automation Simulator — Passo Q.
 *
 * Pure dry-run engine that decides whether a recommended adjustment to a
 * Google/Meta/TikTok campaign would be allowed under workspace guardrails.
 *
 * INVARIANTS:
 *   - NEVER calls external APIs (Google/Meta/TikTok). NEVER mutates anything.
 *   - `auto` execution is always blocked by this module — only the real engine
 *     (server-side) can transition a recommendation to auto, and only with
 *     `min_conversions`, `cooldown_hours`, `max_*_change_percent` satisfied.
 *   - Always returns a `rollback_plan` describing how to undo the change if
 *     it is later applied. This text never leaks credentials.
 */

export type SimulationKind = "budget" | "bid" | "cpa" | "audience";

export type SimulationOutcome =
  | "allowed"
  | "blocked"
  | "needs_review"
  | "auto_blocked";

export interface Guardrails {
  min_conversions: number;
  cooldown_hours: number;
  max_budget_change_percent: number;
  max_bid_change_percent: number;
  /** When false, even an "allowed" recommendation cannot run as auto. */
  auto_enabled?: boolean;
}

export const DEFAULT_GUARDRAILS: Readonly<Guardrails> = Object.freeze({
  min_conversions: 30,
  cooldown_hours: 24,
  max_budget_change_percent: 25,
  max_bid_change_percent: 15,
  auto_enabled: false,
});

export interface SimulationInput {
  kind: SimulationKind;
  /** e.g. campaign_id / ad_group_id / audience_id (already redacted). */
  target_id: string;
  current_value: number;
  proposed_value: number;
  /** Conversions in the recent window used by the rule. */
  recent_conversions: number;
  /** Hours since the last applied change for THIS target. */
  hours_since_last_change: number;
  /** Caller's intent — recommendation is the safe default; auto is gated. */
  execution_mode: "recommendation" | "auto" | "disabled";
  guardrails?: Partial<Guardrails>;
}

export interface SimulationResult {
  outcome: SimulationOutcome;
  reasons: string[];
  /** Human-readable plan for reverting if the change is later applied. */
  rollback_plan: string;
  /** Audit-log preview — operator-friendly text only, no credentials/PII. */
  audit_preview: {
    action: string;
    target_id: string;
    before_value: number;
    after_value: number;
    delta_percent: number;
    execution_mode: SimulationInput["execution_mode"];
  };
  dry_run: true;
}

function pct(before: number, after: number): number {
  if (before === 0) return after === 0 ? 0 : 100;
  return Math.round(((after - before) / Math.abs(before)) * 1000) / 10;
}

export function simulateAutomationChange(input: SimulationInput): SimulationResult {
  const g: Guardrails = { ...DEFAULT_GUARDRAILS, ...(input.guardrails ?? {}) };
  const reasons: string[] = [];
  const delta = pct(input.current_value, input.proposed_value);
  const absDelta = Math.abs(delta);
  const limit =
    input.kind === "budget" || input.kind === "cpa"
      ? g.max_budget_change_percent
      : g.max_bid_change_percent;

  if (input.execution_mode === "disabled") {
    reasons.push("Regra está desabilitada — sugestão ignorada.");
    return finalize("blocked", reasons, input, g, delta);
  }

  if (input.recent_conversions < g.min_conversions) {
    reasons.push(
      `Apenas ${input.recent_conversions} conversões na janela; mínimo ${g.min_conversions}.`,
    );
  }
  if (input.hours_since_last_change < g.cooldown_hours) {
    reasons.push(
      `Último ajuste há ${input.hours_since_last_change}h; cooldown de ${g.cooldown_hours}h ainda ativo.`,
    );
  }
  if (absDelta > limit) {
    reasons.push(
      `Ajuste de ${delta}% excede limite ${input.kind === "bid" ? "de lance" : "de orçamento/CPA"} (±${limit}%).`,
    );
  }

  // Auto path is doubly gated: even a clean check requires `auto_enabled`.
  if (input.execution_mode === "auto") {
    if (reasons.length > 0) return finalize("blocked", reasons, input, g, delta);
    if (g.auto_enabled !== true) {
      reasons.push(
        "execution_mode=auto bloqueado: workspace está com guardrails.auto_enabled=false (default seguro).",
      );
      return finalize("auto_blocked", reasons, input, g, delta);
    }
    return finalize("allowed", reasons, input, g, delta);
  }

  // recommendation mode: surface as needs_review when guardrails fail, else allowed.
  return finalize(
    reasons.length > 0 ? "needs_review" : "allowed",
    reasons,
    input,
    g,
    delta,
  );
}

function finalize(
  outcome: SimulationOutcome,
  reasons: string[],
  input: SimulationInput,
  _g: Guardrails,
  delta: number,
): SimulationResult {
  const action = `${input.kind}_change`;
  return {
    outcome,
    reasons,
    rollback_plan: `Reverter ${input.kind} de ${input.target_id} para o valor anterior (${input.current_value}). Operador deve abrir audit log e confirmar antes de re-executar.`,
    audit_preview: {
      action,
      target_id: input.target_id,
      before_value: input.current_value,
      after_value: input.proposed_value,
      delta_percent: delta,
      execution_mode: input.execution_mode,
    },
    dry_run: true,
  };
}
