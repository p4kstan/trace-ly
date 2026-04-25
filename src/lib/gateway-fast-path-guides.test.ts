import { describe, it, expect } from "vitest";
import {
  GATEWAY_FAST_PATH_GUIDES,
  getFastPathGuide,
} from "./gateway-fast-path-guides";

describe("gateway-fast-path-guides", () => {
  it("ships guides for woocommerce/braip/cartpanda/perfectpay", () => {
    const ids = GATEWAY_FAST_PATH_GUIDES.map((g) => g.id).sort();
    expect(ids).toEqual(["braip", "cartpanda", "perfectpay", "woocommerce"]);
  });

  it("every guide requires transaction_id, root_order_code and status", () => {
    for (const g of GATEWAY_FAST_PATH_GUIDES) {
      const required = g.fields.filter((f) => f.required).map((f) => f.name);
      expect(required).toContain("transaction_id");
      expect(required).toContain("root_order_code");
      expect(required).toContain("status");
    }
  });

  it("every guide enforces signed webhook in production", () => {
    for (const g of GATEWAY_FAST_PATH_GUIDES) {
      expect(g.signatureRequirement.length).toBeGreaterThan(20);
      expect(g.checklist.join("\n")).toMatch(/Secret|HMAC|Token/);
    }
  });

  it("every guide explains multi-step propagation", () => {
    for (const g of GATEWAY_FAST_PATH_GUIDES) {
      expect(g.multiStep).toMatch(/step|root|upsell|bump/i);
      expect(g.propagation.join("\n")).toMatch(/root_order_code/);
    }
  });

  it("getFastPathGuide returns undefined for unknown ids", () => {
    expect(getFastPathGuide("does-not-exist")).toBeUndefined();
    expect(getFastPathGuide("braip")?.label).toBe("Braip");
  });

  it("webhook URLs use canonical ?provider= pattern (no hardcoded keys)", () => {
    for (const g of GATEWAY_FAST_PATH_GUIDES) {
      expect(g.webhookUrlPattern).toMatch(/\?provider=/);
      expect(g.webhookUrlPattern).not.toMatch(/token=|secret=|key=/);
    }
  });
});
