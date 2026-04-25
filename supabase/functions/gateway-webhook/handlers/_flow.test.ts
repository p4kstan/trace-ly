// Integration-style logic tests for the full canonical dedup flow.
// These tests simulate the behavior of gateway-webhook → event-router →
// process-events using IN-MEMORY mocks of `event_queue` and `tracked_events`,
// reproducing the unique constraints (workspace_id, event_id, provider, destination)
// and the per-destination retry/dead-letter state machine.
//
// Coverage:
//   1. Main purchase + extra step go to separate queue rows
//   2. Same provider, multiple destinations → separate rows (no collapse)
//   3. Webhook redelivery is idempotent (no duplicate row)
//   4. F5 / browser duplicate is idempotent
//   5. One destination failing does NOT block another destination's delivery
//   6. Retry → backoff → dead_letter transitions per destination

import { describe, it, expect, beforeEach } from "vitest";
import { buildCanonicalEventIdentity } from "./_canonical.ts";
import type { NormalizedOrder } from "./_types.ts";

// ─── Mock infra ──────────────────────────────────────────────────────────
type QueueRow = {
  id: string;
  workspace_id: string;
  event_id: string;
  provider: string;
  destination: string;
  status: "queued" | "processing" | "retry" | "delivered" | "dead_letter";
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string;
  last_error: string | null;
};
type TrackedRow = {
  workspace_id: string;
  event_id: string;
  provider: string;
  destination: string;
  status: "queued" | "delivered" | "retry" | "dead_letter";
};

class FakeStore {
  queue: QueueRow[] = [];
  tracked: TrackedRow[] = [];
  private id = 0;

  /** Mimics: ON CONFLICT (workspace_id, event_id, provider, destination) DO NOTHING
   *  scoped to active statuses (queued|processing|retry). */
  enqueue(row: { workspace_id: string; event_id: string; provider: string; destination: string }) {
    const exists = this.queue.find(q =>
      q.workspace_id === row.workspace_id &&
      q.event_id === row.event_id &&
      q.provider === row.provider &&
      q.destination === row.destination &&
      ["queued", "processing", "retry"].includes(q.status)
    );
    if (exists) return { inserted: false, row: exists };
    const newRow: QueueRow = {
      id: `q${++this.id}`,
      ...row,
      status: "queued",
      attempt_count: 0,
      max_attempts: 5,
      next_retry_at: new Date().toISOString(),
      last_error: null,
    };
    this.queue.push(newRow);
    this.upsertTracked({ ...row, status: "queued" });
    return { inserted: true, row: newRow };
  }

  upsertTracked(row: TrackedRow) {
    const idx = this.tracked.findIndex(t =>
      t.workspace_id === row.workspace_id &&
      t.event_id === row.event_id &&
      t.provider === row.provider &&
      t.destination === row.destination
    );
    if (idx >= 0) this.tracked[idx].status = row.status;
    else this.tracked.push({ ...row });
  }

  markDelivered(id: string) {
    const r = this.queue.find(q => q.id === id);
    if (!r) return;
    r.status = "delivered";
    this.upsertTracked({ ...r, status: "delivered" });
  }

  fail(id: string, error: string) {
    const r = this.queue.find(q => q.id === id);
    if (!r) return;
    r.attempt_count++;
    r.last_error = error;
    if (r.attempt_count >= r.max_attempts) {
      r.status = "dead_letter";
      this.upsertTracked({ ...r, status: "dead_letter" });
    } else {
      r.status = "retry";
      // exponential backoff: 30s * 4^attempt
      const delay = 30_000 * Math.pow(4, r.attempt_count);
      r.next_retry_at = new Date(Date.now() + delay).toISOString();
      this.upsertTracked({ ...r, status: "retry" });
    }
  }
}

function makeOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    gateway: "hotmart",
    external_order_id: "EV-20260425-XYZ",
    status: "paid",
    total_value: 100,
    currency: "BRL",
    customer: {},
    items: [],
    tracking: {},
    raw_payload: {},
    ...overrides,
  } as NormalizedOrder;
}

function buildId(order: NormalizedOrder, opts: Partial<Parameters<typeof buildCanonicalEventIdentity>[0]> = {}) {
  return buildCanonicalEventIdentity({
    order,
    eventName: "Purchase",
    internalEvent: "order_paid",
    provider: "hotmart",
    externalEventId: null,
    ...opts,
  });
}

const WS = "00000000-0000-0000-0000-000000000001";

// ─── Tests ───────────────────────────────────────────────────────────────
describe("canonical flow — multi-step + multi-destination dedup", () => {
  let store: FakeStore;
  beforeEach(() => { store = new FakeStore(); });

  it("main purchase + extra step produce two distinct queue rows", () => {
    const main = buildId(makeOrder());
    const step = buildId(makeOrder({ tracking: { step_key: "shipping_fee" } }));
    expect(main.eventId).toBe("purchase:EV-20260425-XYZ");
    expect(step.eventId).toBe("purchase:EV-20260425-XYZ:step:shipping_fee");

    store.enqueue({ workspace_id: WS, event_id: main.eventId, provider: "meta_capi", destination: "PIX-1" });
    store.enqueue({ workspace_id: WS, event_id: step.eventId, provider: "meta_capi", destination: "PIX-1" });
    expect(store.queue).toHaveLength(2);
  });

  it("same provider + multiple destinations does NOT collapse", () => {
    const id = buildId(makeOrder()).eventId;
    store.enqueue({ workspace_id: WS, event_id: id, provider: "google_ads", destination: "CID-100" });
    store.enqueue({ workspace_id: WS, event_id: id, provider: "google_ads", destination: "CID-200" });
    store.enqueue({ workspace_id: WS, event_id: id, provider: "google_ads", destination: "CID-300" });
    expect(store.queue).toHaveLength(3);
    expect(new Set(store.queue.map(q => q.destination)).size).toBe(3);
  });

  it("webhook redelivery is idempotent per destination", () => {
    const id = buildId(makeOrder()).eventId;
    const r1 = store.enqueue({ workspace_id: WS, event_id: id, provider: "meta_capi", destination: "PIX-1" });
    const r2 = store.enqueue({ workspace_id: WS, event_id: id, provider: "meta_capi", destination: "PIX-1" });
    const r3 = store.enqueue({ workspace_id: WS, event_id: id, provider: "meta_capi", destination: "PIX-1" });
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(r3.inserted).toBe(false);
    expect(store.queue).toHaveLength(1);
  });

  it("F5 / browser-duplicate event_id is treated as same canonical id", () => {
    const browserId = "purchase:EV-20260425-XYZ";
    const webhookId = buildId(makeOrder()).eventId;
    expect(browserId).toBe(webhookId);
    store.enqueue({ workspace_id: WS, event_id: browserId, provider: "ga4", destination: "G-AAA" });
    store.enqueue({ workspace_id: WS, event_id: webhookId, provider: "ga4", destination: "G-AAA" });
    expect(store.queue).toHaveLength(1);
  });

  it("one destination failing does NOT block another destination delivery", () => {
    const id = buildId(makeOrder()).eventId;
    const a = store.enqueue({ workspace_id: WS, event_id: id, provider: "google_ads", destination: "CID-A" }).row;
    const b = store.enqueue({ workspace_id: WS, event_id: id, provider: "google_ads", destination: "CID-B" }).row;

    store.fail(a.id, "API 500");
    store.markDelivered(b.id);

    const rowA = store.queue.find(q => q.id === a.id)!;
    const rowB = store.queue.find(q => q.id === b.id)!;
    expect(rowA.status).toBe("retry");
    expect(rowB.status).toBe("delivered");

    const tA = store.tracked.find(t => t.destination === "CID-A")!;
    const tB = store.tracked.find(t => t.destination === "CID-B")!;
    expect(tA.status).toBe("retry");
    expect(tB.status).toBe("delivered");
  });

  it("retry → backoff → dead_letter after max_attempts per destination", () => {
    const id = buildId(makeOrder()).eventId;
    const r = store.enqueue({ workspace_id: WS, event_id: id, provider: "tiktok", destination: "TT-1" }).row;

    for (let i = 0; i < 5; i++) store.fail(r.id, `fail ${i}`);

    const final = store.queue.find(q => q.id === r.id)!;
    expect(final.status).toBe("dead_letter");
    expect(final.attempt_count).toBe(5);

    const tracked = store.tracked.find(t => t.destination === "TT-1")!;
    expect(tracked.status).toBe("dead_letter");
  });

  it("delivered destination keeps single tracked row on webhook redelivery", () => {
    const id = buildId(makeOrder()).eventId;
    const r = store.enqueue({ workspace_id: WS, event_id: id, provider: "meta_capi", destination: "PIX-1" }).row;
    store.markDelivered(r.id);
    // Webhook redelivery: active-only unique constraint allows re-enqueue,
    // but tracked_events keeps the delivered audit row.
    const r2 = store.enqueue({ workspace_id: WS, event_id: id, provider: "meta_capi", destination: "PIX-1" });
    expect(r2.inserted).toBe(true);
    const trackedRows = store.tracked.filter(t =>
      t.event_id === id && t.provider === "meta_capi" && t.destination === "PIX-1"
    );
    expect(trackedRows).toHaveLength(1);
  });
});
