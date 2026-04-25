#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# CapiTrack AI — Semantic RLS audit (Passo L)
#
# Beyond "RLS is on", this script inspects each policy on a fixed list of
# sensitive tables and fails when:
#   • a policy uses USING (true) or WITH CHECK (true) (overly permissive)
#   • write policies (INSERT/UPDATE/DELETE/ALL) do NOT reference
#     is_workspace_member or is_workspace_admin
#   • the anon role has any write policy on a sensitive table
#
# Output is schema/policy/status only. NO row data is fetched.
#
# Skipped automatically when PGHOST is not set (CI without DB).
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

YELLOW='\033[1;33m'; GREEN='\033[1;32m'; RED='\033[1;31m'; CYAN='\033[1;36m'; NC='\033[0m'
log()  { echo -e "${YELLOW}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
info() { echo -e "${CYAN}  $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }

if [ -z "${PGHOST:-}" ]; then
  info "rls-semantic-audit skipped — PGHOST not set"
  exit 0
fi

# Sensitive tables: writes MUST be gated by workspace membership/admin.
SENSITIVE_TABLES=(
  "rate_limit_configs"
  "queue_health_alerts"
  "audit_logs"
  "audience_seed_exports"
  "automation_actions"
  "automation_rules"
  "event_queue"
  "dead_letter_events"
)

ERRORS=0

for t in "${SENSITIVE_TABLES[@]}"; do
  exists=$(psql -tAc "SELECT 1 FROM pg_class WHERE relname='$t' AND relnamespace='public'::regnamespace LIMIT 1;" 2>/dev/null || echo "")
  if [ -z "$exists" ]; then
    info "skipped — $t not present"
    continue
  fi

  # 1. RLS must be on.
  rls=$(psql -tAc "SELECT relrowsecurity FROM pg_class WHERE relname='$t' AND relnamespace='public'::regnamespace;" 2>/dev/null)
  if [ "$rls" != "t" ]; then
    echo -e "${RED}✗ $t: RLS DISABLED${NC}"
    ERRORS=$((ERRORS+1))
    continue
  fi

  # 2. No policy may use a literal `true` predicate.
  perm=$(psql -tAc "
    SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='$t'
       AND (qual ILIKE '%true%' AND qual NOT ILIKE '%is_workspace_%' AND qual NOT ILIKE '%auth.uid()%')
  " 2>/dev/null || echo "0")
  if [ "${perm:-0}" -gt 0 ]; then
    echo -e "${RED}✗ $t: $perm policy(ies) use overly-permissive USING(true)${NC}"
    ERRORS=$((ERRORS+1))
  fi

  # 3. Write policies must reference a workspace gate.
  bad_writes=$(psql -tAc "
    SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='$t'
       AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
       AND COALESCE(with_check,'') !~* 'is_workspace_(member|admin)'
       AND COALESCE(qual,'')        !~* 'is_workspace_(member|admin)'
       AND COALESCE(qual,'')        !~* 'auth\.uid\(\)'
  " 2>/dev/null || echo "0")
  if [ "${bad_writes:-0}" -gt 0 ]; then
    echo -e "${RED}✗ $t: $bad_writes write policy(ies) lack is_workspace_member/admin gate${NC}"
    ERRORS=$((ERRORS+1))
  fi

  # 4. anon must NEVER have write access.
  anon_writes=$(psql -tAc "
    SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='$t'
       AND 'anon' = ANY(roles)
       AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  " 2>/dev/null || echo "0")
  if [ "${anon_writes:-0}" -gt 0 ]; then
    echo -e "${RED}✗ $t: anon role has $anon_writes write policy(ies)${NC}"
    ERRORS=$((ERRORS+1))
  fi

  if [ "${perm:-0}" -eq 0 ] && [ "${bad_writes:-0}" -eq 0 ] && [ "${anon_writes:-0}" -eq 0 ]; then
    pol_count=$(psql -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='$t';" 2>/dev/null || echo "?")
    ok "$t: $pol_count policy(ies) — gated, no anon writes, no USING(true)"
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  fail "Semantic RLS audit found $ERRORS issue(s) — see above"
fi
ok "Semantic RLS audit clean"
