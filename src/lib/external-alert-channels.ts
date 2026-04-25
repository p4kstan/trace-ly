/**
 * External Alert Channels — Passo N (opt-in, dry-run by default).
 *
 * Pure-data + validators describing which external dispatch channels exist for
 * queue_health_alerts. ZERO real network calls happen from this file. Any actual
 * dispatch must go through a future Edge Function that ALSO defaults to
 * `mode: "dry_run"` and only flips to `live` after explicit owner action.
 *
 * Security invariants (enforced by validators below + release-validate.sh):
 *   - Default `enabled = false`, `mode = "dry_run"` for every channel.
 *   - URLs MUST be https://.
 *   - Slack webhooks MUST match `https://hooks.slack.com/`.
 *   - Email targets MUST look like an address; the channel does NOT actually send.
 *   - Never store secrets here — channels reference workspace secrets by NAME.
 *   - Validation never inspects PII; payload sanitation is the dispatcher's job.
 */

export type AlertExternalChannel = "slack" | "email" | "webhook";
export type AlertExternalMode = "dry_run" | "live";

export interface AlertExternalConfig {
  id: string;
  workspace_id: string;
  channel: AlertExternalChannel;
  /** For slack/webhook: URL. For email: address. */
  target: string;
  /** Human-readable description, no PII. */
  label: string;
  enabled: boolean;
  mode: AlertExternalMode;
  /** Reference to a backend secret name (NEVER the secret itself). */
  secret_ref?: string | null;
  /** Min severity that would fire (info|warn|error). */
  min_severity: "info" | "warn" | "error";
  /** Throttle window in minutes — prevents alert storms. */
  throttle_minutes: number;
}

export interface AlertExternalIssue {
  field: string;
  reason: string;
  severity: "error" | "warn";
}

export function defaultAlertExternalConfig(
  workspace_id: string,
  channel: AlertExternalChannel,
): AlertExternalConfig {
  return {
    id: crypto.randomUUID(),
    workspace_id,
    channel,
    target: "",
    label: "",
    enabled: false, // opt-in; default OFF
    mode: "dry_run", // even when enabled, defaults to dry-run preview
    secret_ref: null,
    min_severity: "warn",
    throttle_minutes: 15,
  };
}

export function validateAlertExternalConfig(cfg: AlertExternalConfig): AlertExternalIssue[] {
  const issues: AlertExternalIssue[] = [];

  if (!cfg.workspace_id) {
    issues.push({ field: "workspace_id", reason: "missing", severity: "error" });
  }

  if (!cfg.target || typeof cfg.target !== "string") {
    issues.push({ field: "target", reason: "missing", severity: "error" });
  } else {
    if (cfg.channel === "slack") {
      if (!/^https:\/\/hooks\.slack\.com\//.test(cfg.target)) {
        issues.push({
          field: "target",
          reason: "slack URL must start with https://hooks.slack.com/",
          severity: "error",
        });
      }
    } else if (cfg.channel === "webhook") {
      if (!/^https:\/\//.test(cfg.target)) {
        issues.push({
          field: "target",
          reason: "webhook URL must be https://",
          severity: "error",
        });
      }
    } else if (cfg.channel === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.target)) {
        issues.push({
          field: "target",
          reason: "invalid email address shape",
          severity: "error",
        });
      }
    }
  }

  if (cfg.throttle_minutes < 1 || cfg.throttle_minutes > 1440) {
    issues.push({
      field: "throttle_minutes",
      reason: "must be between 1 and 1440",
      severity: "error",
    });
  }

  // Hard guardrail: if `live` mode AND enabled, require a secret_ref for
  // signed channels. This NEVER auto-promotes — the validator just flags.
  if (cfg.enabled && cfg.mode === "live") {
    if ((cfg.channel === "slack" || cfg.channel === "webhook") && !cfg.secret_ref) {
      issues.push({
        field: "secret_ref",
        reason: "live mode requires a backend secret reference (signing)",
        severity: "warn",
      });
    }
  }

  return issues;
}

/**
 * Returns true ONLY when this channel is configured to actually send messages
 * AND the operator has explicitly switched it out of dry-run. Used by the
 * future dispatcher; release-validate ensures dispatchers honor this.
 */
export function isExternalAlertLive(cfg: AlertExternalConfig): boolean {
  return cfg.enabled === true && cfg.mode === "live";
}

/**
 * Build a non-PII preview payload that a UI can show to the operator BEFORE
 * any real dispatch. Strips workspace/user identifiers and includes only the
 * alert metadata an SRE needs.
 */
export function buildAlertPreview(input: {
  channel: AlertExternalChannel;
  alert_type: string;
  provider?: string | null;
  destination?: string | null;
  severity: "info" | "warn" | "error";
  metric_value?: number | null;
  message?: string | null;
}): { channel: AlertExternalChannel; preview: string } {
  const head = `[${input.severity.toUpperCase()}] queue-health · ${input.alert_type}`;
  const where = `${input.provider ?? "all"}/${input.destination ?? "all"}`;
  const value = input.metric_value === undefined || input.metric_value === null
    ? ""
    : ` · value=${input.metric_value}`;
  const msg = input.message ? ` · ${input.message.slice(0, 180)}` : "";
  return { channel: input.channel, preview: `${head} · ${where}${value}${msg}` };
}
