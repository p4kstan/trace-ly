// Unit tests for canonical event_id derivation.
// These are PURE-LOGIC tests — no DB, no network, no Deno-specific APIs —
// so we run them under the project's Vitest setup.
//
// Coverage:
//   1. Main purchase: purchase:<root>
//   2. Step purchase: purchase:<root>:step:<step_key>
//   3. Webhook redelivery (same payload twice → same id)
//   4. F5 / browser duplicate (browser-supplied canonical id is trusted)
//   5. Step inferred from externalReference patterns
//   6. Order without browser event_id
//   7. Non-paid event → deterministic fallback (NEVER a UUID)
//   8. Pure-numeric prefix is NOT a step

import { describe, it, expect } from "vitest";
import {
  buildCanonicalEventIdentity,
  inferStepFromExternalRef,
  normalizeStepKey,
  resolveRootAndStep,
} from "./_canonical.ts";
import type { NormalizedOrder } from "./_types.ts";

function makeOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    external_order_id: "EV-20260425-XYZ",
    external_payment_id: null,
    status: "paid",
    payment_status: "paid",
    total_value: 100,
    currency: "BRL",
    customer: {},
    items: [],
    tracking: {},
    raw: {},
    ...overrides,
  } as NormalizedOrder;
}

describe("normalizeStepKey", () => {
  it("lowercases and strips invalid chars", () => {
    expect(normalizeStepKey("Taxa Transporte!")).toBe("taxa-transporte");
  });
  it("returns null for empty/null", () => {
    expect(normalizeStepKey(null)).toBeNull();
    expect(normalizeStepKey("")).toBeNull();
    expect(normalizeStepKey("  ")).toBeNull();
  });
  it("caps at 32 chars", () => {
    const long = "a".repeat(50);
    expect(normalizeStepKey(long)?.length).toBe(32);
  });
});

describe("inferStepFromExternalRef", () => {
  it("parses step:<key>:<root>", () => {
    expect(inferStepFromExternalRef("step:upsell_1:EV-20260425-ABC")).toEqual({
      stepKey: "upsell_1",
      rootOrderCode: "EV-20260425-ABC",
    });
  });
  it("parses key-root with non-numeric key", () => {
    expect(inferStepFromExternalRef("tmt-EV-20260425-ABC")).toEqual({
      stepKey: "tmt",
      rootOrderCode: "EV-20260425-ABC",
    });
  });
  it("rejects pure-numeric prefix (pedido-123 is NOT a step)", () => {
    expect(inferStepFromExternalRef("pedido-123")).toEqual({
      stepKey: null,
      rootOrderCode: null,
    });
  });
  it("returns nulls for empty input", () => {
    expect(inferStepFromExternalRef(null)).toEqual({ stepKey: null, rootOrderCode: null });
    expect(inferStepFromExternalRef("")).toEqual({ stepKey: null, rootOrderCode: null });
  });
});

describe("resolveRootAndStep — explicit metadata wins", () => {
  it("uses explicit root_order_code + step_key", () => {
    const order = makeOrder({
      tracking: {
        root_order_code: "EV-20260425-XYZ",
        step_key: "Taxa Transporte",
      } as any,
    });
    expect(resolveRootAndStep(order)).toEqual({
      rootOrderCode: "EV-20260425-XYZ",
      stepKey: "taxa-transporte",
    });
  });

  it("falls back to externalReference inference", () => {
    const order = makeOrder({
      external_order_id: "step:shipping_fee:EV-20260425-XYZ",
      tracking: {} as any,
    });
    const r = resolveRootAndStep(order);
    expect(r.rootOrderCode).toBe("EV-20260425-XYZ");
    expect(r.stepKey).toBe("shipping_fee");
  });

  it("treats order without step as root", () => {
    const order = makeOrder({
      external_order_id: "EV-20260425-XYZ",
      tracking: {} as any,
    });
    expect(resolveRootAndStep(order)).toEqual({
      rootOrderCode: "EV-20260425-XYZ",
      stepKey: null,
    });
  });
});

describe("buildCanonicalEventIdentity — main purchase", () => {
  it("EV-20260425-XYZ → purchase:EV-20260425-XYZ", () => {
    const r = buildCanonicalEventIdentity({
      order: makeOrder(),
      eventName: "Purchase",
      internalEvent: "order_paid",
      provider: "meta",
      externalEventId: null,
    });
    expect(r.eventId).toBe("purchase:EV-20260425-XYZ");
    expect(r.source).toBe("purchase_main");
    expect(r.rootOrderCode).toBe("EV-20260425-XYZ");
    expect(r.stepKey).toBeNull();
  });

  it("step taxa-transporte → purchase:EV-20260425-XYZ:step:taxa-transporte", () => {
    const r = buildCanonicalEventIdentity({
      order: makeOrder({
        tracking: {
          root_order_code: "EV-20260425-XYZ",
          step_key: "Taxa Transporte",
        } as any,
      }),
      eventName: "Purchase",
      internalEvent: "order_paid",
      provider: "google_ads",
      externalEventId: null,
    });
    expect(r.eventId).toBe("purchase:EV-20260425-XYZ:step:taxa-transporte");
    expect(r.source).toBe("purchase_step");
    expect(r.stepKey).toBe("taxa-transporte");
  });

  it("step=main is treated as root, not as a step", () => {
    const r = buildCanonicalEventIdentity({
      order: makeOrder({
        tracking: {
          root_order_code: "EV-20260425-XYZ",
          step_key: "main",
        } as any,
      }),
      eventName: "Purchase",
      internalEvent: "order_paid",
      provider: "meta",
      externalEventId: null,
    });
    expect(r.eventId).toBe("purchase:EV-20260425-XYZ");
    expect(r.source).toBe("purchase_main");
  });
});

describe("buildCanonicalEventIdentity — idempotency scenarios", () => {
  it("webhook redelivery produces the SAME event_id", () => {
    const order = makeOrder();
    const a = buildCanonicalEventIdentity({
      order, eventName: "Purchase", internalEvent: "order_paid",
      provider: "meta", externalEventId: "evt_1",
    });
    const b = buildCanonicalEventIdentity({
      order, eventName: "Purchase", internalEvent: "order_paid",
      provider: "meta", externalEventId: "evt_1",
    });
    expect(a.eventId).toBe(b.eventId);
    expect(a.eventId).toBe("purchase:EV-20260425-XYZ");
  });

  it("F5/browser-supplied canonical id is trusted (browser dedup)", () => {
    const order = makeOrder({
      tracking: { event_id: "purchase:EV-20260425-XYZ:step:upsell_1" } as any,
    });
    const r = buildCanonicalEventIdentity({
      order, eventName: "Purchase", internalEvent: "order_paid",
      provider: "meta", externalEventId: null,
    });
    expect(r.eventId).toBe("purchase:EV-20260425-XYZ:step:upsell_1");
    expect(r.source).toBe("browser");
    expect(r.rootOrderCode).toBe("EV-20260425-XYZ");
    expect(r.stepKey).toBe("upsell_1");
  });

  it("multiple destinations of the same provider share the SAME canonical id", () => {
    // The eventId is provider/destination-agnostic — uniqueness in
    // event_queue/tracked_events comes from the (event_id, provider, destination)
    // composite key, NOT from a different event_id per destination.
    const order = makeOrder();
    const dest1 = buildCanonicalEventIdentity({
      order, eventName: "Purchase", internalEvent: "order_paid",
      provider: "meta", externalEventId: null,
    });
    const dest2 = buildCanonicalEventIdentity({
      order, eventName: "Purchase", internalEvent: "order_paid",
      provider: "meta", externalEventId: null,
    });
    expect(dest1.eventId).toBe(dest2.eventId);
  });

  it("order without browser event_id still derives canonical id deterministically", () => {
    const order = makeOrder({ tracking: {} as any });
    const r = buildCanonicalEventIdentity({
      order, eventName: "Purchase", internalEvent: "order_paid",
      provider: "tiktok", externalEventId: null,
    });
    expect(r.eventId).toBe("purchase:EV-20260425-XYZ");
    expect(r.source).toBe("purchase_main");
  });
});

describe("buildCanonicalEventIdentity — fallback (non-paid)", () => {
  it("non-paid event returns deterministic <event>:<ref>:<provider> — never UUID", () => {
    const r = buildCanonicalEventIdentity({
      order: makeOrder({ status: "pending", payment_status: "pending" }),
      eventName: "InitiateCheckout",
      internalEvent: "checkout_started",
      provider: "meta",
      externalEventId: null,
    });
    expect(r.eventId).toBe("initiatecheckout:ev-20260425-xyz:meta");
    expect(r.source).toBe("deterministic");
    // Hard guarantee: never a UUID
    expect(r.eventId).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it("two replays of the same non-paid event share the same id", () => {
    const order = makeOrder({ status: "pending", payment_status: "pending" });
    const a = buildCanonicalEventIdentity({
      order, eventName: "AddToCart", internalEvent: "cart_updated",
      provider: "google_ads", externalEventId: null,
    });
    const b = buildCanonicalEventIdentity({
      order, eventName: "AddToCart", internalEvent: "cart_updated",
      provider: "google_ads", externalEventId: null,
    });
    expect(a.eventId).toBe(b.eventId);
  });
});
