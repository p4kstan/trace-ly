/**
 * Pure guardrail evaluation for the Traffic Agent.
 *
 * Inputs are plain values — no DB, no network — so this file can be unit-tested
 * trivially and reused both client-side (UI simulator) and server-side
 * (edge functions).
 *
 * Decisions returned here are advisory; the executor MUST also re-check
 * `allow_live_mutations` and the action's mode before any external call.
 */

export interface Guardrails {
  mode: "dry_run" | "recommendation" | "approval_required" | "auto";
  min_conversions: number;
  min_spend_cents: number;
  max_budget_change_percent: number;
  max_bid_change_percent: number;
  max_actions_per_day: number;
  cooldown_hours: number;
  max_daily_budget_cents: number | null;
  target_cpa_cents: number | null;
  target_roas: number | null;
  rollback_required: boolean;
  human_approval_required: boolean;
  allow_live_mutations: boolean;
  active: boolean;
}

export interface ProposedAction {
  action_type: string;
  provider: string;
  campaign_id?: string | null;
  /** For budget changes: percent of the current budget (e.g. -10, +25). */
  budget_change_percent?: number;
  /** For bid changes: percent of the current bid. */
  bid_change_percent?: number;
  /** For absolute new daily budget: cents/day. */
  proposed_daily_budget_cents?: number;
  /** Sample size used to justify the action. */
  observed_conversions?: number;
  observed_spend_cents?: number;
}

export interface CooldownState {
  /** Last time this entity was acted upon, ISO string or null. */
  last_action_at?: string | null;
  /** Number of actions executed today across the workspace. */
  actions_today?: number;
}

export interface GuardrailDecision {
  allowed: boolean;
  reasons: Array<{ code: string; severity: "info" | "warn" | "block"; detail?: string }>;
  /** True only if the action may actually mutate an external provider. */
  may_mutate_externally: boolean;
}

export function evaluateGuardrails(
  g: Guardrails,
  action: ProposedAction,
  cooldown: CooldownState = {},
  now: Date = new Date(),
): GuardrailDecision {
  const reasons: GuardrailDecision["reasons"] = [];
  let allowed = true;

  if (!g.active) {
    reasons.push({ code: "guardrails_inactive", severity: "block" });
    allowed = false;
  }

  // Sample-size gates apply to media-tuning actions (budget/bid).
  const isMediaTune =
    action.action_type === "adjust_budget" ||
    action.action_type === "adjust_bid" ||
    action.action_type === "scale_up" ||
    action.action_type === "scale_down";

  if (isMediaTune) {
    if ((action.observed_conversions ?? 0) < g.min_conversions) {
      reasons.push({
        code: "below_min_conversions",
        severity: "block",
        detail: `observed=${action.observed_conversions ?? 0} < min=${g.min_conversions}`,
      });
      allowed = false;
    }
    if ((action.observed_spend_cents ?? 0) < g.min_spend_cents) {
      reasons.push({
        code: "below_min_spend",
        severity: "block",
        detail: `observed=${action.observed_spend_cents ?? 0} < min=${g.min_spend_cents}`,
      });
      allowed = false;
    }
  }

  if (action.budget_change_percent !== undefined) {
    const abs = Math.abs(action.budget_change_percent);
    if (abs > g.max_budget_change_percent) {
      reasons.push({
        code: "budget_change_exceeds_max",
        severity: "block",
        detail: `requested=${abs}% > max=${g.max_budget_change_percent}%`,
      });
      allowed = false;
    }
  }
  if (action.bid_change_percent !== undefined) {
    const abs = Math.abs(action.bid_change_percent);
    if (abs > g.max_bid_change_percent) {
      reasons.push({
        code: "bid_change_exceeds_max",
        severity: "block",
        detail: `requested=${abs}% > max=${g.max_bid_change_percent}%`,
      });
      allowed = false;
    }
  }

  if (
    g.max_daily_budget_cents != null &&
    action.proposed_daily_budget_cents != null &&
    action.proposed_daily_budget_cents > g.max_daily_budget_cents
  ) {
    reasons.push({
      code: "daily_budget_exceeds_cap",
      severity: "block",
      detail: `proposed=${action.proposed_daily_budget_cents} > cap=${g.max_daily_budget_cents}`,
    });
    allowed = false;
  }

  if ((cooldown.actions_today ?? 0) >= g.max_actions_per_day) {
    reasons.push({
      code: "daily_action_limit_reached",
      severity: "block",
      detail: `actions_today=${cooldown.actions_today} >= max=${g.max_actions_per_day}`,
    });
    allowed = false;
  }

  if (cooldown.last_action_at) {
    const last = new Date(cooldown.last_action_at).getTime();
    const elapsedH = (now.getTime() - last) / 3_600_000;
    if (elapsedH < g.cooldown_hours) {
      reasons.push({
        code: "cooldown_active",
        severity: "block",
        detail: `elapsed_h=${elapsedH.toFixed(1)} < cooldown_h=${g.cooldown_hours}`,
      });
      allowed = false;
    }
  }

  // External mutation gate: even if allowed by every other rule, only "auto" mode
  // + allow_live_mutations may actually mutate. Anything else stays simulated.
  const may_mutate_externally =
    allowed && g.mode === "auto" && g.allow_live_mutations === true && !g.human_approval_required;

  if (!may_mutate_externally) {
    reasons.push({
      code: g.allow_live_mutations
        ? g.mode !== "auto"
          ? "mode_not_auto"
          : "human_approval_required"
        : "live_mutations_disabled",
      severity: "info",
      detail: `mode=${g.mode} allow_live=${g.allow_live_mutations} approval_required=${g.human_approval_required}`,
    });
  }

  return { allowed, reasons, may_mutate_externally };
}

/** Convenience: safe defaults used in tests and bootstrap. */
export const SAFE_DEFAULT_GUARDRAILS: Guardrails = {
  mode: "dry_run",
  min_conversions: 30,
  min_spend_cents: 5000,
  max_budget_change_percent: 20,
  max_bid_change_percent: 15,
  max_actions_per_day: 5,
  cooldown_hours: 24,
  max_daily_budget_cents: null,
  target_cpa_cents: null,
  target_roas: null,
  rollback_required: true,
  human_approval_required: true,
  allow_live_mutations: false,
  active: true,
};
