#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# CapiTrack AI — Release validation
# Runs typecheck + tests + DB schema/dedup checks before promoting to prod.
# Usage:  bash scripts/release-validate.sh
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

YELLOW='\033[1;33m'; GREEN='\033[1;32m'; RED='\033[1;31m'; NC='\033[0m'
log()  { echo -e "${YELLOW}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }

log "1/4  TypeScript typecheck"
npx tsc --noEmit || fail "tsc failed"
ok "tsc clean"

log "2/4  Unit + integration tests (Vitest)"
npx vitest run --reporter=basic || fail "vitest failed"
ok "vitest passed"

log "3/4  Schema dedup constraints (informational — requires PG* env)"
if [ -n "${PGHOST:-}" ]; then
  REQ_INDEXES=("uq_event_queue_dedup" "uq_tracked_events_dedup" "event_queue_status_retry_idx" "idx_tracked_events_ws_status")
  for idx in "${REQ_INDEXES[@]}"; do
    found=$(psql -tAc "SELECT 1 FROM pg_indexes WHERE indexname='$idx' LIMIT 1;" 2>/dev/null || echo "")
    [ "$found" = "1" ] && ok "index $idx present" || fail "MISSING index $idx"
  done
else
  echo "  (skipped — PGHOST not set)"
fi

log "4/4  Canonical audit panel route check"
grep -q '/canonical-audit' src/App.tsx || fail "/canonical-audit route missing"
grep -q 'canonical-audit' src/components/AppSidebar.tsx || fail "sidebar entry missing"
ok "audit panel wired"

echo ""
ok "RELEASE VALIDATION PASSED"
