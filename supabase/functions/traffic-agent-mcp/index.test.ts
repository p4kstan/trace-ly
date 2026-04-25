// Deno tests for traffic-agent edge logic.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactString, redactValue } from "../_shared/traffic-agent-redact.ts";
import { evaluateGuardrails, type Guardrails } from "../_shared/traffic-agent-guardrails.ts";
import { chunkText } from "../_shared/traffic-agent-chunker.ts";
import { buildRecommendations } from "../_shared/traffic-agent-recommend.ts";

const SAFE: Guardrails = {
  mode: "dry_run", min_conversions: 30, min_spend_cents: 5000,
  max_budget_change_percent: 20, max_bid_change_percent: 15,
  max_actions_per_day: 5, cooldown_hours: 24,
  max_daily_budget_cents: null, target_cpa_cents: null, target_roas: null,
  rollback_required: true, human_approval_required: true,
  allow_live_mutations: false, active: true,
};

Deno.test("redact masks email/phone/cpf/bearer", () => {
  const s = redactString("contato a@b.com +5511999998888 12345678909 Bearer abcdefghijklmnopqrstuv");
  assert(s.includes("[redacted_email]"), `email: ${s}`);
  assert(s.includes("[redacted_phone]"), `phone: ${s}`);
  assert(s.includes("[redacted_bearer]"), `bearer: ${s}`);
});

Deno.test("redactValue masks sensitive keys", () => {
  const out = redactValue({ email: "x@y.com", token: "abc", workspace_id: "ws1" }) as any;
  assertEquals(out.email, "[redacted]");
  assertEquals(out.token, "[redacted]");
  assertEquals(out.workspace_id, "ws1");
});

Deno.test("guardrails block live without allow_live_mutations", () => {
  const d = evaluateGuardrails(SAFE,
    { action_type: "scale_up", provider: "google_ads", observed_conversions: 100, observed_spend_cents: 100000, budget_change_percent: 10 });
  assertEquals(d.may_mutate_externally, false);
  assert(d.reasons.some((r) => r.code === "live_mutations_disabled"));
});

Deno.test("guardrails block budget change above max", () => {
  const d = evaluateGuardrails(SAFE,
    { action_type: "scale_up", provider: "google_ads", observed_conversions: 100, observed_spend_cents: 100000, budget_change_percent: 50 });
  assertEquals(d.allowed, false);
  assert(d.reasons.some((r) => r.code === "budget_change_exceeds_max"));
});

Deno.test("guardrails block scale_up below sample", () => {
  const d = evaluateGuardrails(SAFE,
    { action_type: "scale_up", provider: "google_ads", observed_conversions: 5, observed_spend_cents: 1000 });
  assertEquals(d.allowed, false);
  assert(d.reasons.some((r) => r.code === "below_min_conversions"));
});

Deno.test("guardrails block cooldown active", () => {
  const recent = new Date(Date.now() - 3600_000).toISOString();
  const d = evaluateGuardrails(SAFE,
    { action_type: "scale_up", provider: "google_ads", observed_conversions: 100, observed_spend_cents: 100000, budget_change_percent: 10 },
    { last_action_at: recent, actions_today: 0 });
  assertEquals(d.allowed, false);
  assert(d.reasons.some((r) => r.code === "cooldown_active"));
});

Deno.test("chunker preserves short content", () => {
  const out = chunkText("short");
  assertEquals(out.length, 1);
});

Deno.test("chunker splits long content", () => {
  const out = chunkText("a".repeat(5000), { maxChars: 1200 });
  assert(out.length >= 4);
});

Deno.test("recommend prioritizes tracking issues over scale_up", () => {
  const recs = buildRecommendations({
    window_days: 7,
    tracking: { total_purchases: 100, purchase_without_dispatch: 30,
      identifier_coverage: { gclid: 0.1, gbraid: 0, wbraid: 0, fbp: 0, fbc: 0.1, ttclid: 0, msclkid: 0 } },
    queue: { pending: 0, failed: 0, dead_letter: 0, oldest_pending_minutes: 0 },
    destinations: { total: 1, with_recent_error: 0, disabled: 0 },
    campaigns: [{ provider: "google_ads", campaign_id: "c1", spend_cents: 100000, conversions: 100, cpa_cents: 1000, roas: 3.0, cvr: 0.05 }],
    guardrails: { min_conversions: 30, min_spend_cents: 5000 },
  });
  assertEquals(recs[0].action_type, "fix_purchase_dispatch_gap");
});

Deno.test("recommend returns collect_more_data when sample insufficient", () => {
  const recs = buildRecommendations({
    window_days: 7,
    campaigns: [{ provider: "google_ads", campaign_id: "c1", spend_cents: 100, conversions: 1, cpa_cents: 100, roas: 5.0, cvr: 0.01 }],
    guardrails: { min_conversions: 30, min_spend_cents: 5000 },
  });
  assert(recs.some((r) => r.action_type === "collect_more_data"));
  assert(!recs.some((r) => r.action_type === "scale_up"));
});
