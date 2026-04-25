import { describe, it, expect } from "vitest";
import {
  defaultAlertExternalConfig,
  validateAlertExternalConfig,
  isExternalAlertLive,
  buildAlertPreview,
} from "./external-alert-channels";

describe("external-alert-channels (Passo N opt-in)", () => {
  it("default config is disabled and dry-run for every channel", () => {
    for (const ch of ["slack", "email", "webhook"] as const) {
      const cfg = defaultAlertExternalConfig("ws-1", ch);
      expect(cfg.enabled).toBe(false);
      expect(cfg.mode).toBe("dry_run");
      expect(isExternalAlertLive(cfg)).toBe(false);
    }
  });

  it("rejects slack URL not on hooks.slack.com", () => {
    const cfg = defaultAlertExternalConfig("ws-1", "slack");
    cfg.target = "https://example.com/wh";
    const issues = validateAlertExternalConfig(cfg);
    expect(issues.some((i) => i.field === "target" && i.severity === "error")).toBe(true);
  });

  it("accepts a valid slack webhook URL", () => {
    const cfg = defaultAlertExternalConfig("ws-1", "slack");
    cfg.target = "https://hooks.slack.com/services/T1/B2/abc";
    const issues = validateAlertExternalConfig(cfg);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("rejects non-https webhook target", () => {
    const cfg = defaultAlertExternalConfig("ws-1", "webhook");
    cfg.target = "http://insecure.example.com/wh";
    const issues = validateAlertExternalConfig(cfg);
    expect(issues.some((i) => i.field === "target")).toBe(true);
  });

  it("rejects malformed email", () => {
    const cfg = defaultAlertExternalConfig("ws-1", "email");
    cfg.target = "not-an-email";
    const issues = validateAlertExternalConfig(cfg);
    expect(issues.some((i) => i.field === "target")).toBe(true);
  });

  it("warns when live mode is enabled without secret_ref for signed channels", () => {
    const cfg = defaultAlertExternalConfig("ws-1", "slack");
    cfg.target = "https://hooks.slack.com/services/T1/B2/abc";
    cfg.enabled = true;
    cfg.mode = "live";
    const issues = validateAlertExternalConfig(cfg);
    expect(issues.some((i) => i.field === "secret_ref" && i.severity === "warn")).toBe(true);
    // Even with the warning, isExternalAlertLive ONLY checks operator intent.
    expect(isExternalAlertLive(cfg)).toBe(true);
  });

  it("isExternalAlertLive stays false unless both enabled and mode=live", () => {
    const cfg = defaultAlertExternalConfig("ws-1", "slack");
    cfg.target = "https://hooks.slack.com/services/T1/B2/abc";
    cfg.enabled = true; // still dry_run
    expect(isExternalAlertLive(cfg)).toBe(false);
  });

  it("buildAlertPreview never includes workspace/user IDs", () => {
    const out = buildAlertPreview({
      channel: "slack",
      alert_type: "queue_backlog",
      provider: "meta",
      destination: "capi",
      severity: "warn",
      metric_value: 250,
      message: "Backlog rising",
    });
    expect(out.preview).toMatch(/queue-health/);
    expect(out.preview).toMatch(/meta\/capi/);
    expect(out.preview).not.toMatch(/ws-|user_/);
  });

  it("throttle bounds are enforced", () => {
    const cfg = defaultAlertExternalConfig("ws-1", "email");
    cfg.target = "ops@example.com";
    cfg.throttle_minutes = 0;
    expect(validateAlertExternalConfig(cfg).some((i) => i.field === "throttle_minutes")).toBe(true);
    cfg.throttle_minutes = 9999;
    expect(validateAlertExternalConfig(cfg).some((i) => i.field === "throttle_minutes")).toBe(true);
  });
});
