import { describe, it, expect } from "vitest";
import {
  GATEWAY_ADAPTER_CONTRACTS,
  validateAdapterPayload,
  getAdapterContract,
} from "./gateway-adapter-contracts";

describe("gateway-adapter-contracts", () => {
  it("ships a contract for every gateway with a deployed handler", () => {
    const shipped = GATEWAY_ADAPTER_CONTRACTS.filter((c) => c.shippedHandler);
    expect(shipped.length).toBeGreaterThanOrEqual(8);
    for (const c of shipped) {
      expect(c.providerSlug).toBeTruthy();
      expect(c.fields.find((f) => f.field === "transaction_id")?.requirement).toBe("required");
      expect(c.fields.find((f) => f.field === "root_order_code")?.requirement).toBe("required");
      expect(c.fields.find((f) => f.field === "status")?.requirement).toBe("required");
    }
  });

  it("getAdapterContract returns undefined for unknown ids", () => {
    expect(getAdapterContract("does-not-exist")).toBeUndefined();
    expect(getAdapterContract("stripe")?.id).toBe("stripe");
  });

  it("flags missing required fields as errors", () => {
    const c = getAdapterContract("yampi")!;
    const issues = validateAdapterPayload(c, {});
    const errs = issues.filter((i) => i.severity === "error");
    // transaction_id / order_code / root_order_code / external_reference / amount / currency / status
    expect(errs.length).toBeGreaterThanOrEqual(6);
    expect(errs.some((i) => i.field === "transaction_id")).toBe(true);
    expect(errs.some((i) => i.field === "root_order_code")).toBe(true);
  });

  it("rejects raw PII in the customer block", () => {
    const c = getAdapterContract("hotmart")!;
    const issues = validateAdapterPayload(c, {
      transaction_id: "tx_1",
      order_code: "o_1",
      root_order_code: "o_1",
      external_reference: "step:main:o_1",
      amount: 100,
      currency: "BRL",
      status: "paid",
      customer: { email: "should-not-be-here@example.com" },
    });
    const piiErr = issues.find(
      (i) => i.severity === "error" && i.field === "customer.email" && i.reason.includes("raw PII"),
    );
    expect(piiErr).toBeDefined();
  });

  it("accepts a fully-shaped canonical payload", () => {
    const c = getAdapterContract("stripe")!;
    const issues = validateAdapterPayload(c, {
      transaction_id: "pi_123",
      order_code: "o_42",
      root_order_code: "o_42",
      external_reference: "step:main:o_42",
      step_key: "main",
      amount: 4990,
      currency: "BRL",
      status: "paid",
      customer: {
        email_hash: "a".repeat(64),
        phone_hash: "b".repeat(64),
      },
      tracking: { session_id: "s_1", gclid: "G-CaseSensitive_1" },
    });
    const errs = issues.filter((i) => i.severity === "error");
    expect(errs).toEqual([]);
  });

  it("rejects an unknown canonical status bucket", () => {
    const c = getAdapterContract("kiwify")!;
    const issues = validateAdapterPayload(c, {
      transaction_id: "x",
      order_code: "y",
      root_order_code: "y",
      external_reference: "step:main:y",
      amount: 1,
      currency: "BRL",
      status: "settled-on-mars",
    });
    expect(
      issues.some((i) => i.field === "status" && i.severity === "error"),
    ).toBe(true);
  });
});
