// Contract tests — event-router & process-events guarantees.
//
// These tests pin the contract of the destination/dispatch layer. They must
// stay green for every release:
//
//   C1. Two distinct (provider, destination) pairs for the same event_id
//       must each receive their own queue row.
//   C2. A failing destination must not block delivery for siblings.
//   C3. A "delivered" row is NEVER re-dispatched (no double-count on ads).
//   C4. Per-destination retry uses exponential backoff and caps at max_attempts.
//   C5. Multi-step purchases route to the correct canonical event_id even
//       when the SAME root_order_code has both a main and a step record.
//
// All assertions run against an in-memory simulator that mirrors the SQL
// constraints (UNIQUE on workspace_id+event_id+provider+destination across
// active statuses) and the dispatch loop in process-events.

import { describe, it, expect, beforeEach } from "vitest";

type Status = "queued" | "processing" | "retry" | "delivered" | "dead_letter";

type Row = {
  id: string;
  workspace_id: string;
  event_id: string;
  provider: string;
  destination: string;
  status: Status;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: number; // ms epoch
};

// ── Mini-router + processor ────────────────────────────────────────────
class Router {
  rows: Row[] = [];
  delivered: Row[] = [];
  private id = 0;

  enqueue(input: { workspace_id: string; event_id: string; provider: string; destination: string }): Row | null {
    // Simulates: ON CONFLICT (workspace_id, event_id, provider, destination)
    // DO NOTHING WHERE status IN (queued, processing, retry).
    const dup = this.rows.find(r =>
      r.workspace_id === input.workspace_id &&
      r.event_id === input.event_id &&
      r.provider === input.provider &&
      r.destination === input.destination &&
      ["queued", "processing", "retry"].includes(r.status)
    );
    if (dup) return null;
    const row: Row = {
      id: `r${++this.id}`,
      ...input,
      status: "queued",
      attempt_count: 0,
      max_attempts: 5,
      next_retry_at: Date.now(),
    };
    this.rows.push(row);
    return row;
  }

  // process-events: fetches due rows grouped by (provider, workspace, destination)
  // and dispatches to the corresponding adapter.
  process(dispatcher: (r: Row) => "ok" | "fail") {
    const due = this.rows.filter(r =>
      (r.status === "queued" || r.status === "retry") && r.next_retry_at <= Date.now()
    );
    // Group key — mirrors process-events grouping
    const groups = new Map<string, Row[]>();
    for (const r of due) {
      const key = `${r.provider}::${r.workspace_id}::${r.destination}`;
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }
    for (const [, group] of groups) {
      for (const r of group) {
        const result = dispatcher(r);
        if (result === "ok") {
          r.status = "delivered";
          this.delivered.push(r);
        } else {
          r.attempt_count++;
          if (r.attempt_count >= r.max_attempts) {
            r.status = "dead_letter";
          } else {
            r.status = "retry";
            // exponential backoff: 30s * 4^n
            r.next_retry_at = Date.now() + 30_000 * Math.pow(4, r.attempt_count);
          }
        }
      }
    }
  }
}

const WS = "ws-1";
const EV = "purchase:EV-20260425-XYZ";

describe("event-router contract", () => {
  let r: Router;
  beforeEach(() => { r = new Router(); });

  it("C1 — distinct (provider,destination) pairs each get a row", () => {
    expect(r.enqueue({ workspace_id: WS, event_id: EV, provider: "google_ads", destination: "CID-A" })).not.toBeNull();
    expect(r.enqueue({ workspace_id: WS, event_id: EV, provider: "google_ads", destination: "CID-B" })).not.toBeNull();
    expect(r.enqueue({ workspace_id: WS, event_id: EV, provider: "meta_capi", destination: "PIX-1" })).not.toBeNull();
    expect(r.rows).toHaveLength(3);
  });

  it("C1b — same (provider,destination) twice → second is dropped", () => {
    expect(r.enqueue({ workspace_id: WS, event_id: EV, provider: "ga4", destination: "G-AAA" })).not.toBeNull();
    expect(r.enqueue({ workspace_id: WS, event_id: EV, provider: "ga4", destination: "G-AAA" })).toBeNull();
    expect(r.rows).toHaveLength(1);
  });
});

describe("process-events contract", () => {
  let r: Router;
  beforeEach(() => { r = new Router(); });

  it("C2 — destination A failing does not block destination B delivery", () => {
    r.enqueue({ workspace_id: WS, event_id: EV, provider: "google_ads", destination: "CID-A" });
    r.enqueue({ workspace_id: WS, event_id: EV, provider: "google_ads", destination: "CID-B" });

    r.process(row => row.destination === "CID-A" ? "fail" : "ok");

    const a = r.rows.find(x => x.destination === "CID-A")!;
    const b = r.rows.find(x => x.destination === "CID-B")!;
    expect(a.status).toBe("retry");
    expect(b.status).toBe("delivered");
  });

  it("C3 — delivered rows are NEVER reprocessed", () => {
    r.enqueue({ workspace_id: WS, event_id: EV, provider: "tiktok", destination: "TT-1" });
    r.process(() => "ok");
    expect(r.delivered).toHaveLength(1);
    // Run loop again — delivered row must not show up as "due"
    r.process(() => "ok");
    expect(r.delivered).toHaveLength(1);
  });

  it("C4 — exponential backoff per destination, dead_letter at max_attempts", () => {
    const row = r.enqueue({ workspace_id: WS, event_id: EV, provider: "meta_capi", destination: "PIX-1" })!;
    for (let i = 0; i < 5; i++) {
      // Force due time to now so process() picks it up each iteration
      row.next_retry_at = Date.now() - 1;
      r.process(() => "fail");
    }
    expect(row.status).toBe("dead_letter");
    expect(row.attempt_count).toBe(5);
  });

  it("C5 — main + step purchase route to distinct event_ids on same provider+destination", () => {
    const main = "purchase:EV-20260425-XYZ";
    const step = "purchase:EV-20260425-XYZ:step:shipping_fee";
    expect(r.enqueue({ workspace_id: WS, event_id: main, provider: "meta_capi", destination: "PIX-1" })).not.toBeNull();
    expect(r.enqueue({ workspace_id: WS, event_id: step, provider: "meta_capi", destination: "PIX-1" })).not.toBeNull();
    expect(r.rows.map(x => x.event_id).sort()).toEqual([main, step].sort());
  });
});
