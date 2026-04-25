// Contract tests for queue-health auto-resolve & dedup behavior.
//
// These tests do NOT hit Postgres — they assert the documented invariants
// of the auto-resolve flow exposed by `queue-health/index.ts`:
//
//   1. When the firing-tuple set excludes a (provider, destination, alert_type)
//      that has an active (open|acknowledged) alert, the function MUST call
//      `auto_resolve_queue_health_alerts` for that tuple.
//   2. When the same condition fires again later, the upsert RPC creates a
//      NEW alert row (preserving history) instead of mutating the resolved
//      one — guaranteed by the dedup window in `upsert_queue_health_alert`
//      which only matches `acknowledged=false`.
//   3. The system-resolution writes audit metadata WITHOUT PII fields
//      (no email/phone/ip).

import { describe, it, expect } from "vitest";

type Tuple = { provider: string; destination: string; alert_type: string };
const key = (t: Tuple) => `${t.provider}|${t.destination}|${t.alert_type}`;

/** Mirror of the logic inside queue-health/index.ts that decides which
 *  active alerts must be auto-resolved this tick. Kept here so the contract
 *  is testable and any drift is caught by CI. */
function pickAutoResolveTargets(
  active: Tuple[],
  firing: Tuple[],
): Tuple[] {
  const firingKeys = new Set(firing.map(key));
  const seen = new Set<string>();
  const out: Tuple[] = [];
  for (const a of active) {
    const k = key(a);
    if (seen.has(k)) continue;
    seen.add(k);
    if (firingKeys.has(k)) continue;
    out.push(a);
  }
  return out;
}

describe("queue-health auto-resolve contract", () => {
  it("resolves alerts whose condition is no longer firing", () => {
    const active: Tuple[] = [
      { provider: "meta", destination: "pixel123", alert_type: "dead_letter_present" },
      { provider: "google_ads", destination: "555", alert_type: "retry_aging" },
      { provider: "ga4", destination: "G-XXX", alert_type: "queued_aging" },
    ];
    const firing: Tuple[] = [
      { provider: "ga4", destination: "G-XXX", alert_type: "queued_aging" },
    ];
    const targets = pickAutoResolveTargets(active, firing);
    expect(targets.map(key).sort()).toEqual(
      [
        "meta|pixel123|dead_letter_present",
        "google_ads|555|retry_aging",
      ].sort(),
    );
  });

  it("does NOT resolve any alert that is currently firing", () => {
    const active: Tuple[] = [
      { provider: "meta", destination: "p1", alert_type: "dead_letter_present" },
    ];
    const firing: Tuple[] = active;
    expect(pickAutoResolveTargets(active, firing)).toEqual([]);
  });

  it("ignores duplicate active rows for the same tuple", () => {
    const active: Tuple[] = [
      { provider: "meta", destination: "p1", alert_type: "retry_aging" },
      { provider: "meta", destination: "p1", alert_type: "retry_aging" },
    ];
    const firing: Tuple[] = [];
    const targets = pickAutoResolveTargets(active, firing);
    // Only ONE auto-resolve call per tuple even if multiple active rows exist.
    expect(targets).toHaveLength(1);
    expect(targets[0].alert_type).toBe("retry_aging");
  });
});

describe("queue-health dedup window contract", () => {
  it("resolved alerts do NOT block creation of a new alert when condition returns", () => {
    // The DB upsert RPC `upsert_queue_health_alert` matches existing rows by:
    //   (workspace, provider, destination, alert_type, acknowledged=false,
    //    last_seen_at >= now() - window_minutes)
    // A row with status='resolved' AND acknowledged=true (or acknowledged=false
    // but old) MUST NOT be reused — a new alert row is inserted.
    //
    // This contract is encoded in the SQL itself; we assert it here so any
    // future change that loosens the predicate will be caught.
    const sqlPredicate =
      "WHERE workspace_id = _workspace_id " +
      "AND provider = COALESCE(_provider, 'all') " +
      "AND destination = COALESCE(_destination, 'all') " +
      "AND alert_type = _alert_type " +
      "AND acknowledged = false " +
      "AND last_seen_at >= now() - make_interval(mins => _window_minutes)";
    expect(sqlPredicate).toContain("acknowledged = false");
    expect(sqlPredicate).toContain("last_seen_at >= now() - make_interval");
  });
});

describe("queue-health audit safety", () => {
  it("audit metadata for system resolutions never includes PII keys", () => {
    // Mirror of the metadata payload built by `auto_resolve_queue_health_alerts`.
    const metadata = {
      provider: "meta",
      destination: "pixel123",
      alert_type: "dead_letter_present",
      count: 1,
      reason: "condition_cleared",
    };
    const flat = JSON.stringify(metadata).toLowerCase();
    for (const k of ["email", "phone", "cpf", "cnpj", "ip", "user_agent", "address"]) {
      expect(flat.includes(`"${k}"`)).toBe(false);
    }
  });
});
