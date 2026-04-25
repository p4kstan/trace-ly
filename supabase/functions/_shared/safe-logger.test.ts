// Tests for the shared safe logger / PII redactor.
// Runs under both Vitest (Node) and Deno test (no env-specific APIs used).

import { describe, it, expect } from "vitest";
import { sanitizeForLog, redactionStats, setSafeLoggerDebug, isSafeLoggerDebug } from "./safe-logger.ts";

describe("sanitizeForLog", () => {
  it("redacts known PII keys (email, phone, cpf, document)", () => {
    const out = sanitizeForLog({
      customer: {
        email: "joao@example.com",
        phone: "+55 11 99999-8888",
        cpf: "123.456.789-09",
        document: "12345678909",
        full_name: "Joao Silva",
        email_hash: "abcd1234",
      },
    }) as any;
    expect(out.customer.email).toBe("[REDACTED]");
    expect(out.customer.phone).toBe("[REDACTED]");
    expect(out.customer.cpf).toBe("[REDACTED]");
    expect(out.customer.document).toBe("[REDACTED]");
    expect(out.customer.full_name).toBe("[REDACTED]");
    // Hashed variant must survive.
    expect(out.customer.email_hash).toBe("abcd1234");
  });

  it("redacts secrets (token, authorization, cookie, api_key)", () => {
    const out = sanitizeForLog({
      authorization: "Bearer eyJabc.def.ghi",
      access_token: "secret-token-123",
      api_key: "sk_live_xxx",
      cookie: "session=abc",
      label: "ok",
    }) as any;
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.access_token).toBe("[REDACTED]");
    expect(out.api_key).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    expect(out.label).toBe("ok");
  });

  it("masks PII patterns inside string values regardless of key", () => {
    const out = sanitizeForLog({
      message: "Contact joao@example.com or call +55 11 99999-8888 — CPF 123.456.789-09",
    }) as any;
    expect(out.message).not.toContain("joao@example.com");
    expect(out.message).toContain("[REDACTED_EMAIL]");
    expect(out.message).toContain("[REDACTED_PHONE]");
    expect(out.message).toContain("[REDACTED_CPF]");
  });

  it("masks JWTs and Pix EMV strings", () => {
    // Each JWT segment must be ≥ 8 chars after the leading "eyJ".
    const jwt = "eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY.SflKxwRJSMeKKF2QT4fwpMeJf36";
    const pix = "00020126" + "a".repeat(60);
    const out = sanitizeForLog({ note: `token=${jwt} pix=${pix}` }) as any;
    expect(out.note).toContain("[REDACTED_JWT]");
    expect(out.note).toContain("[REDACTED_PIX_EMV]");
  });

  it("handles depth and array caps without throwing", () => {
    let nested: any = { v: 1 };
    for (let i = 0; i < 20; i++) nested = { child: nested };
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const out = sanitizeForLog({ nested, arr }) as any;
    expect(JSON.stringify(out)).toContain("[REDACTED_DEPTH]");
    expect(out.arr.length).toBeLessThanOrEqual(51); // 50 items + truncation marker
  });

  it("preserves primitives and null", () => {
    expect(sanitizeForLog(null)).toBe(null);
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(true)).toBe(true);
    expect(sanitizeForLog("hello")).toBe("hello");
  });
});
