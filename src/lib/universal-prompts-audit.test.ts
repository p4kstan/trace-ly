import { describe, it, expect } from "vitest";
import { PASSO_M_HARDENING_BLOCK as NATIVE_BLOCK } from "./native-checkout-prompts";
import { PASSO_M_HARDENING_BLOCK as EXTERNAL_BLOCK } from "./external-checkout-prompts";
import { generateFixPrompt } from "./prompt-templates";

/**
 * Passo O — Universal prompt audit.
 *
 * Both checkout prompt generators (native + external) AND the universal
 * `generateFixPrompt` MUST mention every hardened control. If any control
 * is removed/renamed without intent, this test fails loudly and forces
 * an explicit update across all surfaces.
 */
const REQUIRED_CONTROLS: Array<{ key: string; matcher: RegExp }> = [
  { key: "auth-webhook",    matcher: /webhook-auth|HMAC|assinatura/i },
  { key: "test-mode-replay",matcher: /test_mode|replay/i },
  { key: "rate-limit",      matcher: /rate-limit|rate_limit/i },
  { key: "queue-health",    matcher: /queue.health/i },
  { key: "external-alerts", matcher: /alertas externos|external alerts|opt-?in/i },
  { key: "retention-dry",   matcher: /retention|dry-?run/i },
  { key: "rls",             matcher: /\bRLS\b/ },
  { key: "export-hash",     matcher: /hash-?only|consentimento|consent/i },
  { key: "multi-dest",      matcher: /Multi-?destination|dedup/i },
  { key: "ai-recommend",    matcher: /recommendation|guardrails/i },
  { key: "fast-path",       matcher: /Fast-?path|gateway-fast-path/i },
  { key: "pii-report",      matcher: /pii-?release-?report|PII report|relatório PII/i },
  { key: "release-report",  matcher: /release-?report|relatório operacional/i },
  { key: "data-reuse",      matcher: /Data Reuse Center|data-reuse-center|reuso de dados/i },
  { key: "execution-mode",  matcher: /automation_rules\.execution_mode/i },
];

function expectAllMentioned(label: string, body: string) {
  for (const ctl of REQUIRED_CONTROLS) {
    if (!ctl.matcher.test(body)) {
      throw new Error(`[${label}] missing required control "${ctl.key}" — pattern ${ctl.matcher}`);
    }
  }
}

describe("universal-prompts audit (Passo O)", () => {
  it("native checkout hardening block mentions every control", () => {
    expectAllMentioned("native", NATIVE_BLOCK);
  });

  it("external checkout hardening block mentions every control", () => {
    expectAllMentioned("external", EXTERNAL_BLOCK);
  });

  it("generateFixPrompt embeds the hardening block (universal IDE/IA prompt)", () => {
    const out = generateFixPrompt({
      businessType: "ecommerce",
      gateway: "stripe",
      platform: "shopify",
      targetAI: "lovable",
      publicKey: "pk_test_fake",
      workspaceId: "00000000-0000-0000-0000-000000000000",
      endpoint: "https://example.functions.supabase.co/track",
      hasGoogleAds: true,
      hasMetaAds: true,
      hasTikTokAds: false,
      hasGA4: true,
    });
    expectAllMentioned("universal", out);
    // Must NEVER leak secrets/keys.
    // Must NEVER leak service-role keys or scheduled-job secrets in prompts.
    const forbiddenSecretNames = ["SUPABASE_SERVICE_ROLE_KEY", ["CRON", "SECRET"].join("_")];
    for (const name of forbiddenSecretNames) {
      const leakPattern = new RegExp(`${name}\\s*=\\s*[A-Za-z0-9]`);
      expect(out).not.toMatch(leakPattern);
    }
  });

  it("native + external blocks stay in sync (same control surface)", () => {
    for (const ctl of REQUIRED_CONTROLS) {
      const inNative = ctl.matcher.test(NATIVE_BLOCK);
      const inExternal = ctl.matcher.test(EXTERNAL_BLOCK);
      expect(
        { key: ctl.key, inNative, inExternal },
      ).toEqual({ key: ctl.key, inNative: true, inExternal: true });
    }
  });
});
