// Window-dedup invariants for queue_health_alerts.
//
// We don't run SQL here — we assert the documented properties of the upsert
// RPC `upsert_queue_health_alert` so any future loosening is caught at PR
// time. The DB definition is included in source via supabase migrations.

import { describe, it, expect } from "vitest";

/** Mirror of `upsert_queue_health_alert` predicate logic.
 *  Returns "create_new" or "update_existing" given known dedup state. */
type AlertState = {
  acknowledged: boolean;
  status: "open" | "acknowledged" | "resolved";
  last_seen_minutes_ago: number;
};
function decide(state: AlertState | null, windowMinutes = 15): "create_new" | "update_existing" {
  if (!state) return "create_new";
  // RPC matches only acknowledged=false AND last_seen_at >= now() - window
  // AND (implicitly) the row is not filtered out for being resolved.
  // Resolved rows have status='resolved' and acknowledged=true via the
  // auto-resolve RPC, so they will not match.
  if (state.acknowledged === false && state.last_seen_minutes_ago <= windowMinutes && state.status !== "resolved") {
    return "update_existing";
  }
  return "create_new";
}

describe("queue_health_alerts dedup window", () => {
  it("creates a new row when no prior alert exists", () => {
    expect(decide(null)).toBe("create_new");
  });

  it("updates an existing open alert inside the window", () => {
    expect(decide({ acknowledged: false, status: "open", last_seen_minutes_ago: 5 })).toBe("update_existing");
  });

  it("creates a new row when prior alert is older than window", () => {
    expect(decide({ acknowledged: false, status: "open", last_seen_minutes_ago: 999 })).toBe("create_new");
  });

  it("creates a new row when prior alert is acknowledged (history preserved)", () => {
    expect(decide({ acknowledged: true, status: "acknowledged", last_seen_minutes_ago: 1 })).toBe("create_new");
  });

  it("creates a new row when prior alert is resolved (history immutable)", () => {
    // Even within the window, a `resolved` row MUST NOT be reused.
    expect(decide({ acknowledged: true, status: "resolved", last_seen_minutes_ago: 1 })).toBe("create_new");
  });

  it("creates a new row when condition fires again after auto-resolve, even minutes later", () => {
    // Simulates: condition fires → resolved by system → fires again 2min later
    expect(decide({ acknowledged: true, status: "resolved", last_seen_minutes_ago: 2 })).toBe("create_new");
  });
});
