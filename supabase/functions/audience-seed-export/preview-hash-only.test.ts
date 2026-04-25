import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Passo O — Regression guard for `audience-seed-export`.
 *
 * The dry-run / preview branch must NEVER serialize hashes or PII. We
 * statically inspect the Edge Function source so this guard runs in CI
 * even without a Deno runtime.
 */
const SOURCE = readFileSync(
  resolve(__dirname, "./index.ts"),
  "utf8",
);

function previewBlock(): string {
  const start = SOURCE.indexOf("DRY-RUN / PREVIEW MODE");
  const stop = SOURCE.indexOf("audience_seed_exports", start);
  if (start === -1 || stop === -1) {
    throw new Error("preview block not found — guard cannot validate");
  }
  return SOURCE.slice(start, stop);
}

describe("audience-seed-export :: preview hash-only guard (Passo O)", () => {
  it("preview block exists and is contained before the real export branch", () => {
    expect(previewBlock().length).toBeGreaterThan(100);
  });

  it("preview block returns counters / availability ONLY (no hashes / no PII keys)", () => {
    const block = previewBlock();
    // Forbidden keys in the preview response shape.
    const forbidden = [
      "email_hash", "phone_hash", "external_id_hash",
      "email\":", "phone\":", "cpf\":", "cnpj\":",
    ];
    for (const k of forbidden) {
      expect(block).not.toContain(k);
    }
    // Required: explicit "no hashes, no PII, no export written" note.
    expect(block).toMatch(/no hashes, no PII, no export written/);
    // Required: dry_run flag echoed back.
    expect(block).toMatch(/dry_run:\s*true/);
  });

  it("real-export path defaults require_consent to TRUE", () => {
    expect(SOURCE).toMatch(/require_consent\s*=\s*body\.require_consent\s*!==\s*false/);
  });

  it("never console.logs raw email / phone / cpf in any branch", () => {
    // Allow hashed/availability counters; forbid raw PII keys in console.log.
    const logs = SOURCE.match(/console\.log\([^)]*\)/g) ?? [];
    for (const line of logs) {
      expect(line).not.toMatch(/email["'\s:]+[^_]/);
      expect(line).not.toMatch(/phone["'\s:]+[^_]/);
      expect(line).not.toMatch(/\bcpf\b/i);
      expect(line).not.toMatch(/\bcnpj\b/i);
    }
  });
});
