import { describe, it, expect } from "vitest";
import {
  decideReplay,
  detectRawPII,
  shouldSkipExternalDispatch,
} from "./replay-guards";

describe("replay-guards (Passo O)", () => {
  it("rejects calls without a JWT", () => {
    const r = decideReplay({
      hasJwt: false, isWorkspaceAdmin: false, testMode: true, payload: {},
    });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toBe("missing_jwt");
  });

  it("rejects callers that are not workspace admin", () => {
    const r = decideReplay({
      hasJwt: true, isWorkspaceAdmin: false, testMode: true, payload: {},
    });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toBe("not_workspace_admin");
  });

  it("requires test_mode === true (no truthy strings, no missing field)", () => {
    for (const tm of [false, undefined, null, "true", 1, 0]) {
      const r = decideReplay({
        hasJwt: true, isWorkspaceAdmin: true, testMode: tm, payload: {},
      });
      expect(r.allow).toBe(false);
      if (!r.allow) expect(r.reason).toBe("test_mode_required");
    }
  });

  it("rejects raw PII anywhere in the payload tree", () => {
    const r = decideReplay({
      hasJwt: true, isWorkspaceAdmin: true, testMode: true,
      payload: {
        order: { customer: { email: "leak@example.com", cpf: "12345678901" } },
      },
    });
    expect(r.allow).toBe(false);
    if (!r.allow) {
      expect(r.reason).toBe("raw_pii_detected");
      expect(r.details).toEqual(
        expect.arrayContaining(["order.customer.email", "order.customer.cpf"]),
      );
    }
  });

  it("ALLOWS hashed identifiers (email_hash / phone_sha256)", () => {
    expect(detectRawPII({ customer: { email_hash: "x".repeat(64) } })).toEqual([]);
    expect(detectRawPII({ phone_sha256: "y".repeat(64) })).toEqual([]);
  });

  it("rejects production traffic without verified signature", () => {
    const r = decideReplay({
      hasJwt: true, isWorkspaceAdmin: true, testMode: true, payload: { ok: 1 },
      productionTraffic: true, signatureVerified: false,
    });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toBe("missing_signature");
  });

  it("accepts a clean replay request from a workspace admin", () => {
    const r = decideReplay({
      hasJwt: true, isWorkspaceAdmin: true, testMode: true,
      payload: { transaction_id: "tx_1", customer: { email_hash: "a".repeat(64) } },
    });
    expect(r.allow).toBe(true);
  });

  it("test_mode OR dry_run forces dispatcher to skip external destinations", () => {
    expect(shouldSkipExternalDispatch({ testMode: true })).toBe(true);
    expect(shouldSkipExternalDispatch({ testMode: false, dryRun: true })).toBe(true);
    expect(shouldSkipExternalDispatch({ testMode: false, dryRun: false })).toBe(false);
    expect(shouldSkipExternalDispatch({ testMode: false })).toBe(false);
  });
});
