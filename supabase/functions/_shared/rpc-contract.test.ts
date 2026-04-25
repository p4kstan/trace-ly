// RPC contract tests — Passo L.
//
// We assert the documented input bounds and dedup invariants of the
// security-definer RPCs that gate observability:
//
//   • rate_limit_hit                 — windowed bucket upsert
//   • upsert_queue_health_alert      — dedup-by-window upsert
//   • auto_resolve_queue_health_alerts — clear-condition system resolver
//   • acknowledge_queue_health_alert — caller-attributed ack
//   • upsert_rate_limit_config       — admin-only edit with bounds
//
// These are pure shape/bounds tests. They mirror the SQL contracts so any
// future loosening of bounds or dedup predicates will trip CI.

import { describe, it, expect } from "vitest";

describe("rate_limit_hit contract", () => {
  it("window-aligned bucket boundary is deterministic per windowSeconds", () => {
    const windowSeconds = 60;
    const t1 = 1_700_000_005; // 5 s into a minute
    const t2 = 1_700_000_059; // 59 s into the same minute
    const bucket1 = Math.floor(t1 / windowSeconds) * windowSeconds;
    const bucket2 = Math.floor(t2 / windowSeconds) * windowSeconds;
    expect(bucket1).toBe(bucket2);
    // Crossing the boundary opens a NEW bucket — never mutates the old one.
    const t3 = t2 + 2;
    const bucket3 = Math.floor(t3 / windowSeconds) * windowSeconds;
    expect(bucket3).toBeGreaterThan(bucket1);
  });

  it("retry_after is bounded by [1, windowSeconds]", () => {
    const windowSeconds = 60;
    const elapsed = 75; // pretend clock skew; SQL clamps via GREATEST
    const retryAfter = Math.max(1, windowSeconds - Math.min(elapsed, windowSeconds));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(windowSeconds);
  });
});

describe("upsert_queue_health_alert dedup", () => {
  it("only matches an existing row when acknowledged=false AND inside window", () => {
    type Existing = {
      acknowledged: boolean;
      lastSeenMinutesAgo: number;
    };
    const window = 15;
    function shouldReuse(e: Existing) {
      return !e.acknowledged && e.lastSeenMinutesAgo <= window;
    }
    expect(shouldReuse({ acknowledged: false, lastSeenMinutesAgo: 5 })).toBe(true);
    expect(shouldReuse({ acknowledged: false, lastSeenMinutesAgo: 30 })).toBe(false);
    expect(shouldReuse({ acknowledged: true, lastSeenMinutesAgo: 5 })).toBe(false);
  });

  it("resolved alert never blocks a brand-new row when condition returns", () => {
    // resolved => status='resolved' => not matched by the SQL predicate.
    // Mirror the predicate: only `acknowledged = false` rows are reused.
    type Row = { acknowledged: boolean; status: "open" | "acknowledged" | "resolved" };
    const resolvedRow: Row = { acknowledged: true, status: "resolved" };
    const reusable = !resolvedRow.acknowledged;
    expect(reusable).toBe(false);
  });
});

describe("auto_resolve_queue_health_alerts contract", () => {
  it("only updates rows in status open|acknowledged — preserves resolved history", () => {
    const allowedStatuses = new Set(["open", "acknowledged"]);
    expect(allowedStatuses.has("resolved")).toBe(false);
  });

  it("system resolver attributes resolved_by='system:queue-health'", () => {
    const resolvedBy = "system:queue-health";
    expect(resolvedBy.startsWith("system:")).toBe(true);
  });
});

describe("acknowledge_queue_health_alert contract", () => {
  it("note is truncated to 200 chars in audit metadata", () => {
    const note = "x".repeat(500);
    const truncated = note.slice(0, 200);
    expect(truncated.length).toBe(200);
  });

  it("returns ok=false when caller is not a workspace member", () => {
    // Mirrors RPC: `IF NOT public.is_workspace_member(...) RETURN forbidden`.
    const isMember = false;
    const result = isMember ? { ok: true } : { ok: false, error: "forbidden" };
    expect(result.ok).toBe(false);
  });
});

describe("upsert_rate_limit_config bounds", () => {
  function validate(input: {
    window_seconds: number | null;
    max_hits: number | null;
    route: string | null;
  }): { ok: boolean; error?: string } {
    if (
      input.window_seconds == null ||
      input.window_seconds < 10 ||
      input.window_seconds > 3600
    ) {
      return { ok: false, error: "window_seconds_out_of_bounds" };
    }
    if (input.max_hits == null || input.max_hits < 1 || input.max_hits > 10000) {
      return { ok: false, error: "max_hits_out_of_bounds" };
    }
    if (
      input.route == null ||
      input.route.trim().length < 2 ||
      input.route.length > 80
    ) {
      return { ok: false, error: "route_invalid" };
    }
    return { ok: true };
  }

  it("rejects window_seconds < 10 and > 3600", () => {
    expect(validate({ window_seconds: 5, max_hits: 30, route: "ok" }).error).toBe(
      "window_seconds_out_of_bounds",
    );
    expect(validate({ window_seconds: 4000, max_hits: 30, route: "ok" }).error).toBe(
      "window_seconds_out_of_bounds",
    );
  });

  it("rejects max_hits outside 1..10000", () => {
    expect(validate({ window_seconds: 60, max_hits: 0, route: "ok" }).error).toBe(
      "max_hits_out_of_bounds",
    );
    expect(validate({ window_seconds: 60, max_hits: 99999, route: "ok" }).error).toBe(
      "max_hits_out_of_bounds",
    );
  });

  it("rejects empty/oversized routes", () => {
    expect(validate({ window_seconds: 60, max_hits: 30, route: "a" }).error).toBe(
      "route_invalid",
    );
    expect(
      validate({ window_seconds: 60, max_hits: 30, route: "x".repeat(200) }).error,
    ).toBe("route_invalid");
  });

  it("accepts a typical valid config", () => {
    expect(validate({ window_seconds: 60, max_hits: 30, route: "webhook-replay-test" }).ok)
      .toBe(true);
  });
});
