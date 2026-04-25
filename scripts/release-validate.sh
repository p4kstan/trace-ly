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

echo ""
ok "RELEASE VALIDATION PASSED"
