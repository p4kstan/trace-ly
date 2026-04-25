#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# CapiTrack AI — Release validation (hardened)
# Runs:
#   1. TypeScript typecheck
#   2. Vitest (unit + integration + contract)
#   3. Schema dedup constraint check (when PG* env present)
#   4. Required Edge Functions exist on disk
#   5. Critical routes wired (/canonical-audit, /retry-observability)
#   6. Hard-fail on PII keywords in console.log paths
#   7. Hard-fail on random UUID generation in canonical Purchase derivation
#
# Usage:  bash scripts/release-validate.sh
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

YELLOW='\033[1;33m'; GREEN='\033[1;32m'; RED='\033[1;31m'; CYAN='\033[1;36m'; NC='\033[0m'
log()  { echo -e "${YELLOW}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
info() { echo -e "${CYAN}  $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ─── 1. Typecheck ───────────────────────────────────────────────────────
log "1/7  TypeScript typecheck"
npx tsc --noEmit || fail "tsc failed"
ok "tsc clean"

# ─── 2. Tests ───────────────────────────────────────────────────────────
log "2/7  Vitest (unit + integration + contract)"
npx vitest run --reporter=basic || fail "vitest failed"
ok "vitest passed"

# ─── 3. Schema constraints ──────────────────────────────────────────────
log "3/7  Schema dedup constraints"
if [ -n "${PGHOST:-}" ]; then
  REQ_INDEXES=(
    "uq_event_queue_dedup"
    "uq_tracked_events_dedup"
    "event_queue_status_retry_idx"
    "idx_tracked_events_ws_status"
    "idx_event_queue_ws_provider_dest"
  )
  for idx in "${REQ_INDEXES[@]}"; do
    found=$(psql -tAc "SELECT 1 FROM pg_indexes WHERE indexname='$idx' LIMIT 1;" 2>/dev/null || echo "")
    [ "$found" = "1" ] && ok "index $idx present" || fail "MISSING index $idx"
  done
else
  info "skipped — PGHOST not set"
fi

# ─── 4. Edge Functions on disk ──────────────────────────────────────────
log "4/7  Required Edge Functions present"
REQ_FNS=(
  "gateway-webhook"
  "process-events"
  "event-router"
  "automation-rule-evaluate"
  "audience-seed-export"
  "webhook-replay-test"
  "queue-health"
  "retention-job"
)
for fn in "${REQ_FNS[@]}"; do
  [ -f "supabase/functions/$fn/index.ts" ] && ok "edge fn $fn present" || fail "MISSING edge function $fn"
done

# Safe-logger must be installed in every critical edge function.
log "4b/7  installSafeConsole wired in critical functions"
for fn in gateway-webhook process-events event-router automation-rule-evaluate audience-seed-export webhook-replay-test queue-health retention-job; do
  grep -q "installSafeConsole" "supabase/functions/$fn/index.ts" || fail "MISSING installSafeConsole in $fn"
done
ok "safe-console installed in all critical functions"

# Persistent rate-limit must be wired in webhook-replay-test (no in-memory bucket).
log "4c/7  Persistent rate-limit (DB-backed)"
grep -q "checkRateLimit" supabase/functions/webhook-replay-test/index.ts \
  || fail "webhook-replay-test must use shared checkRateLimit"
if grep -nE 'rlBuckets|RL_WINDOW_MS' supabase/functions/webhook-replay-test/index.ts >/dev/null 2>&1; then
  fail "webhook-replay-test still has in-memory rate-limit remnants"
fi
# Helper file exists.
[ -f supabase/functions/_shared/rate-limit.ts ] || fail "MISSING _shared/rate-limit.ts"
# Hash IP — never persist raw IP.
grep -q "sha256Hex" supabase/functions/_shared/rate-limit.ts \
  || fail "_shared/rate-limit.ts must hash IP before persistence"
ok "persistent rate-limit wired and IP hashed"

# Retention job must be dry-run by default.
log "4d/7  Retention job dry-run safety"
grep -q "dryRun = !canExecute" supabase/functions/retention-job/index.ts \
  || fail "retention-job must default to dry-run"
ok "retention-job is dry-run by default"

# Internal alerts table referenced.
log "4e/7  Internal queue health alerts wired"
grep -q "upsert_queue_health_alert" supabase/functions/queue-health/index.ts \
  || fail "queue-health must upsert internal alerts"
grep -q "queue_health_alerts" src/pages/RetryObservability.tsx \
  || fail "RetryObservability must surface queue_health_alerts"
ok "internal alerts wired"

# Passo H — Auditable ack RPC + retention monitor + fail-closed option.
log "4f/7  Passo H controls (ack RPC, retention monitor, fail-closed)"
grep -q "acknowledge_queue_health_alert" src/pages/RetryObservability.tsx \
  || fail "RetryObservability must call acknowledge_queue_health_alert RPC"
grep -q "monitor === true" supabase/functions/retention-job/index.ts \
  || grep -q '"monitor"' supabase/functions/retention-job/index.ts \
  || fail "retention-job must support monitor mode (dry-run alerting)"
grep -q "failClosed" supabase/functions/_shared/rate-limit.ts \
  || fail "rate-limit helper must support failClosed option"
grep -q "fail_closed" supabase/functions/webhook-replay-test/index.ts \
  || fail "webhook-replay-test must allow fail_closed override"
grep -q "sample" supabase/functions/queue-health/index.ts \
  || fail "queue-health must report sample truncation"
ok "Passo H controls wired"

# Passo H — PII audit on rate-limit module.
log "4g/7  Rate-limit PII audit (no raw IP / UA / email / phone / cpf / cnpj)"
RL_FILE="supabase/functions/_shared/rate-limit.ts"
# Forbidden tokens MUST NOT appear as RPC argument names in the helper.
for tok in "_ip\b" "_raw_ip" "_user_agent" "_email" "_phone" "_cpf" "_cnpj" "_document"; do
  if grep -nE "$tok" "$RL_FILE" >/dev/null 2>&1; then
    fail "rate-limit helper references forbidden token: $tok"
  fi
done
# It MUST hash the IP and only ever pass _ip_hash.
grep -q "_ip_hash" "$RL_FILE" || fail "rate-limit helper must pass _ip_hash"
ok "rate-limit helper is PII-safe"

# Passo I — Auto-resolve, rate-limit configs UI, retention diagnostics.
log "4h/7  Passo I controls (auto-resolve, RL configs UI, cron diag)"
grep -q "auto_resolve_queue_health_alerts" supabase/functions/queue-health/index.ts \
  || fail "queue-health must call auto_resolve_queue_health_alerts when conditions clear"
grep -q "firingTuples" supabase/functions/queue-health/index.ts \
  || fail "queue-health must track firing tuples for auto-resolve"
[ -f src/pages/RateLimitConfigs.tsx ] \
  || fail "MISSING src/pages/RateLimitConfigs.tsx"
grep -q "/rate-limit-configs" src/App.tsx \
  || fail "/rate-limit-configs route not wired in App.tsx"
grep -q "/rate-limit-configs" src/components/AppSidebar.tsx \
  || fail "/rate-limit-configs missing from sidebar"
grep -q "RetentionCronDiagnostics" src/pages/RetryObservability.tsx \
  || fail "RetryObservability must surface RetentionCronDiagnostics"
grep -q "retention_cron_status" src/pages/RetryObservability.tsx \
  || fail "RetryObservability must call retention_cron_status RPC"
# Validate UI bounds for RL configs.
grep -q "WINDOW_MIN = 10" src/pages/RateLimitConfigs.tsx \
  || fail "RateLimitConfigs UI must bound window 10-3600s"
grep -q "HITS_MAX = 10_000\|HITS_MAX = 10000" src/pages/RateLimitConfigs.tsx \
  || fail "RateLimitConfigs UI must bound max_hits 1-10000"
ok "Passo I controls wired"

# Passo I — No secret exposure in frontend / logs.
log "4i/7  No CRON_SECRET / app.cron_secret value exposure in client/logs"
# Frontend must never read or display CRON_SECRET. The diag RPC only
# returns a boolean — never the value.
# Allow-list: prompt templates that document Edge Function snippets are not
# executed in the browser. They live under src/lib/*-prompts.ts.
PII_SECRET_HITS=$(grep -RnE 'CRON_SECRET|cron_secret\s*[:=]' src 2>/dev/null \
  | grep -vE '(cron_secret_configured|app\.cron_secret\b|//|/\*)' \
  | grep -vE 'src/lib/.*-prompts\.ts' \
  | grep -v 'RetryObservability.tsx' || true)
if [ -n "$PII_SECRET_HITS" ]; then
  echo "Suspicious CRON_SECRET reference in src/:"
  echo "$PII_SECRET_HITS"
  fail "Remove CRON_SECRET reference from frontend"
fi
# RPC must NOT return the actual secret value.
if grep -nE "current_setting\('app\.cron_secret'.*\).*RETURNING|jsonb_build_object[^)]*secret_val" \
    supabase/migrations/*passo*i*.sql supabase/migrations/*.sql 2>/dev/null | grep -v "v_secret_set" >/dev/null 2>&1; then
  fail "retention_cron_status RPC must NEVER return the secret value"
fi
ok "no secret exposure in client / RPC"

# Passo I — Retention monitor remains non-destructive.
log "4j/7  Retention monitor still non-destructive (no execute=1 in cron)"
if grep -nE "execute['\"]?\s*[:=]\s*['\"]?(1|true)" supabase/migrations/*.sql 2>/dev/null \
    | grep -i "retention" >/dev/null 2>&1; then
  fail "Found execute=1 wired into retention cron — Passo I requires monitor only"
fi
ok "retention cron remains dry-run/monitor only"

# Passo J — Audit log viewer + role-gated RL configs + alert SLA panel.
log "4k/7  Passo J controls (audit viewer, role gate, SLA, auto-resolve tests)"
[ -f src/pages/AuditLogViewer.tsx ] || fail "MISSING src/pages/AuditLogViewer.tsx"
grep -q "/audit-logs" src/App.tsx || fail "/audit-logs route not wired"
grep -q "/audit-logs" src/components/AppSidebar.tsx || fail "/audit-logs missing from sidebar"
grep -q "useWorkspaceRole" src/pages/RateLimitConfigs.tsx \
  || fail "RateLimitConfigs must role-gate edits via useWorkspaceRole"
grep -q "canEditRateLimitConfigs" src/hooks/use-workspace-role.ts \
  || fail "MISSING canEditRateLimitConfigs helper"
grep -q "AlertSlaPanel" src/pages/RetryObservability.tsx \
  || fail "RetryObservability must surface AlertSlaPanel"
[ -f supabase/functions/queue-health/auto-resolve.test.ts ] \
  || fail "MISSING auto-resolve.test.ts contract tests"
# Audit viewer must redact PII in the frontend.
grep -q "PII_KEY_RE" src/pages/AuditLogViewer.tsx \
  || fail "AuditLogViewer must redact PII keys"
ok "Passo J controls wired"

# ─── 5. Critical routes ─────────────────────────────────────────────────
log "5/7  Critical UI routes wired"
for route in "/canonical-audit" "/retry-observability" "/go-live-checklist"; do
  grep -q "$route" src/App.tsx || fail "route $route not wired in App.tsx"
  grep -q "$route" src/components/AppSidebar.tsx || fail "route $route missing from sidebar"
  ok "route $route wired"
done

# ─── 6. PII safety in logs ──────────────────────────────────────────────
log "6/7  Block raw PII in console.log paths"
# Look for console.log lines that interpolate raw PII fields (NOT *_hash).
# We allow: customer.email_hash, customer.phone_hash, hashed.*, etc.
PII_HITS=$(grep -RnE 'console\.(log|warn|error|info)\([^)]*\$\{[^}]*\.(email|phone|cpf|cnpj|document)(\b|[^_])' \
  supabase/functions src 2>/dev/null \
  | grep -vE '\.(email_hash|phone_hash|cpf_hash|cnpj_hash|document_hash)' || true)
if [ -n "$PII_HITS" ]; then
  echo -e "${RED}Suspicious PII-in-log usage:${NC}"
  echo "$PII_HITS"
  fail "Remove raw PII interpolation from logs (use *_hash)"
fi
ok "no raw PII in console.log"

# ─── 7. No random UUID for Purchase canonical id ────────────────────────
log "7/7  Block random UUIDs for Purchase canonical id"
# In _canonical.ts the Purchase / paid branch must NEVER fall through to
# crypto.randomUUID() / uuidv4(). The only fallback allowed is the deterministic
# `<eventName>:<external_id>:<provider>` formula.
if grep -nE 'crypto\.randomUUID\(\)|uuidv4\(\)' supabase/functions/gateway-webhook/handlers/_canonical.ts >/dev/null 2>&1; then
  fail "_canonical.ts contains a random-UUID call — Purchase ids must be deterministic"
fi
ok "_canonical.ts deterministic"

# ─── 8. Passo K — RLS audit, safe export dry-run, redaction tests ───────
log "8/8  Passo K controls (RLS audit, dry_run export, redaction tests, SLA split)"

# 8a. RLS audit — only when DB is reachable. Critical tables MUST have RLS.
if [ -n "${PGHOST:-}" ]; then
  RLS_TABLES=(
    "event_queue"
    "queue_health_alerts"
    "rate_limit_configs"
    "rate_limit_buckets"
    "audit_logs"
    "audience_seed_exports"
    "dead_letter_events"
    "automation_actions"
  )
  for t in "${RLS_TABLES[@]}"; do
    enabled=$(psql -tAc "SELECT relrowsecurity FROM pg_class WHERE relname='$t' AND relnamespace='public'::regnamespace LIMIT 1;" 2>/dev/null || echo "")
    if [ -z "$enabled" ]; then
      info "RLS audit: table $t not present (skipped)"
      continue
    fi
    if [ "$enabled" = "t" ]; then
      pol_count=$(psql -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='$t';" 2>/dev/null || echo "0")
      [ "$pol_count" -ge 1 ] || fail "RLS audit: $t has RLS but ZERO policies"
      ok "RLS audit: $t enabled with $pol_count policies"
    else
      fail "RLS audit: $t exists but RLS is DISABLED"
    fi
  done
else
  info "RLS audit skipped — PGHOST not set"
fi

# 8b. audience-seed-export must support dry_run mode (preview only, no hashes).
grep -q "dry_run" supabase/functions/audience-seed-export/index.ts \
  || fail "audience-seed-export must accept dry_run flag"
grep -q "audience_seed_export.preview" supabase/functions/audience-seed-export/index.ts \
  || fail "audience-seed-export dry_run must log preview event (no PII)"
# Dry-run path MUST NOT return hashes.
if awk '/if \(dryRun\)/,/^    }$/' supabase/functions/audience-seed-export/index.ts | grep -qE '\bhashes\s*:\s*\[' ; then
  fail "audience-seed-export dry_run path must NOT return hashes"
fi
ok "audience-seed-export dry_run mode wired and PII-safe"

# 8c. Redaction tests present and exercised by vitest.
[ -f src/pages/AuditLogViewer.test.ts ] || fail "MISSING src/pages/AuditLogViewer.test.ts"
for kw in email phone cpf cnpj jwt token cookie pix; do
  grep -qiE "$kw" src/pages/AuditLogViewer.test.ts || fail "AuditLogViewer.test.ts must cover '$kw'"
done
[ -f supabase/functions/queue-health/dedup-window.test.ts ] || fail "MISSING dedup-window.test.ts"
ok "redaction + dedup-window tests present"

# 8d. AuditLogViewer must NOT render raw audit_logs payloads (no JSON.stringify
# on metadata_json without going through redactValue).
if grep -nE 'JSON\.stringify\(.*metadata_json' src/pages/AuditLogViewer.tsx >/dev/null 2>&1; then
  fail "AuditLogViewer must redact metadata_json before display (no raw stringify)"
fi
grep -q "redactValue" src/pages/AuditLogViewer.tsx \
  || fail "AuditLogViewer must use redactValue helper"
ok "AuditLogViewer redacts metadata before render"

# 8e. SLA panel must distinguish open / acknowledged / resolved.
grep -q "openCount" src/pages/RetryObservability.tsx || fail "SLA panel must split openCount"
grep -q "ackCount" src/pages/RetryObservability.tsx || fail "SLA panel must split ackCount"
grep -q "maxAgeBySeverity" src/pages/RetryObservability.tsx || fail "SLA panel must show max age per severity"
grep -q "sem alertas internos" src/pages/RetryObservability.tsx \
  || fail "SLA panel must show explicit empty state"
ok "SLA panel split by status + per-severity max age"

# ─── 9. Passo L — Semantic RLS, contract tests, PII report, debug-mode ──
log "9/9  Passo L controls (semantic RLS, contract tests, PII report, debug-mode)"

# 9a. New contract tests must exist.
[ -f supabase/functions/audience-seed-export/contract.test.ts ] \
  || fail "MISSING audience-seed-export/contract.test.ts (Passo L)"
[ -f supabase/functions/_shared/rpc-contract.test.ts ] \
  || fail "MISSING _shared/rpc-contract.test.ts (Passo L)"
ok "Passo L contract tests present"

# 9b. safe-logger debug mode wired and OFF by default.
grep -q "setSafeLoggerDebug" supabase/functions/_shared/safe-logger.ts \
  || fail "safe-logger must export setSafeLoggerDebug (Passo L)"
grep -q "redactionStats" supabase/functions/_shared/safe-logger.ts \
  || fail "safe-logger must export redactionStats (Passo L)"
grep -q "SAFE_LOGGER_DEBUG" supabase/functions/_shared/safe-logger.ts \
  || fail "safe-logger debug must read SAFE_LOGGER_DEBUG env (off by default)"
ok "safe-logger debug mode wired (off by default)"

# 9c. PII Release Report page wired.
[ -f src/pages/PiiReleaseReport.tsx ] || fail "MISSING src/pages/PiiReleaseReport.tsx"
grep -q "/pii-release-report" src/App.tsx \
  || fail "/pii-release-report route not wired in App.tsx"
grep -q "/pii-release-report" src/components/AppSidebar.tsx \
  || fail "/pii-release-report missing from sidebar"
# Static report must NOT query users / orders / identities.
if grep -nE 'from\s*\(\s*"(orders|identities|profiles|workspace_members)"' src/pages/PiiReleaseReport.tsx >/dev/null 2>&1; then
  fail "PiiReleaseReport must remain static — no user-data queries"
fi
ok "PII Release Report wired and static"

# 9d. audience-seed-export real-export path must NOT be relaxed: consent
# default true, hashes-only response.
grep -q "require_consent !== false" supabase/functions/audience-seed-export/index.ts \
  || fail "audience-seed-export must default require_consent=true"
grep -q "email_hash" supabase/functions/audience-seed-export/index.ts \
  || fail "audience-seed-export must emit email_hash field"
if grep -nE 'response.*[\"\x27]email[\"\x27]\s*:\s*i\.email\b' supabase/functions/audience-seed-export/index.ts >/dev/null 2>&1; then
  fail "audience-seed-export must NEVER return raw email"
fi
ok "audience-seed-export real-export path remains hash-only + consent-default"

# 9e. Semantic RLS audit (only if PGHOST present).
if [ -n "${PGHOST:-}" ]; then
  bash scripts/rls-semantic-audit.sh || fail "Semantic RLS audit failed"
else
  info "Semantic RLS audit skipped — PGHOST not set"
fi

# ─── 10. Passo M — Go-live certification, adapter contracts, release report ──
log "10/10 Passo M controls (go-live checks, adapter contracts, release report, prompt sync)"
[ -f src/lib/go-live-checks.ts ] || fail "MISSING src/lib/go-live-checks.ts"
[ -f src/lib/go-live-checks.test.ts ] || fail "MISSING go-live-checks.test.ts"
[ -f src/lib/gateway-adapter-contracts.ts ] || fail "MISSING gateway-adapter-contracts.ts"
[ -f src/lib/gateway-adapter-contracts.test.ts ] || fail "MISSING gateway-adapter-contracts.test.ts"
[ -f src/pages/ReleaseReport.tsx ] || fail "MISSING src/pages/ReleaseReport.tsx"
grep -q "/release-report" src/App.tsx || fail "/release-report route not wired"
grep -q "/release-report" src/components/AppSidebar.tsx || fail "/release-report missing from sidebar"
# Prompt generators must include the Passo M sync block.
grep -q "PASSO_M_HARDENING_BLOCK" src/lib/native-checkout-prompts.ts \
  || fail "native prompt generator missing Passo M sync block"
grep -q "PASSO_M_HARDENING_BLOCK" src/lib/external-checkout-prompts.ts \
  || fail "external prompt generator missing Passo M sync block"
grep -q '\${PASSO_M_HARDENING_BLOCK}' src/lib/native-checkout-prompts.ts \
  || fail "native prompt generator must INTERPOLATE PASSO_M_HARDENING_BLOCK"
grep -q '\${PASSO_M_HARDENING_BLOCK}' src/lib/external-checkout-prompts.ts \
  || fail "external prompt generator must INTERPOLATE PASSO_M_HARDENING_BLOCK"
# Release report must remain static (no live data queries).
if grep -nE 'from\s*\(\s*"(orders|identities|profiles|workspace_members|event_deliveries|audit_logs)"' src/pages/ReleaseReport.tsx >/dev/null 2>&1; then
  fail "ReleaseReport must remain static — no live-data queries"
fi
ok "Passo M controls wired"

echo ""
ok "RELEASE VALIDATION PASSED"
