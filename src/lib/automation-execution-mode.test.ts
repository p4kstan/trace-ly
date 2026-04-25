import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Passo P — execution_mode source-of-truth guard.
 *
 * The automation engine MUST resolve execution mode from
 * `automation_rules.execution_mode` (column on the rule row), not from
 * `action_json.mode`. This prevents UI-side spoofing of the auto path
 * (action_json is editable per-action, the column is role-gated).
 *
 * If anyone re-introduces a legacy code path that pulls mode from action_json,
 * this static test fails loudly.
 */
const SOURCE = readFileSync(
  resolve(__dirname, "../../supabase/functions/automation-rule-evaluate/index.ts"),
  "utf8",
);

describe("automation execution_mode source-of-truth (Passo P)", () => {
  it("resolveMode reads from rule.execution_mode", () => {
    expect(SOURCE).toMatch(/raw\s*=\s*\(rule\.execution_mode\s*\|\|\s*""\)/);
  });

  it("does NOT pull mode from action_json", () => {
    // Forbid `action_json.mode` / `action_json?.mode` / `action_json["mode"]`
    expect(SOURCE).not.toMatch(/action_json\s*\??\.\s*mode\b/);
    expect(SOURCE).not.toMatch(/action_json\s*\[\s*["']mode["']\s*\]/);
  });

  it("default mode is recommendation (dry-run)", () => {
    // The fallback in resolveMode returns "recommendation"
    expect(SOURCE).toMatch(/return\s+"recommendation"/);
  });

  it("guardrails are required: cooldown_hours / max_items_per_run / min_conversions exist", () => {
    expect(SOURCE).toMatch(/cooldown_hours/);
    expect(SOURCE).toMatch(/max_items_per_run/);
    expect(SOURCE).toMatch(/min_conversions/);
  });

  it("auto mode is gated and disabled mode short-circuits", () => {
    expect(SOURCE).toMatch(/raw\s*===\s*"disabled"/);
    expect(SOURCE).toMatch(/raw\s*===\s*"auto"/);
  });
});
