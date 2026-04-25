import { describe, it, expect } from "vitest";
import { redactString, redactValue } from "./redact";

describe("traffic-agent/redact", () => {
  it("redacts emails, phones, cpf, cnpj, bearer", () => {
    const s = "contact joe@example.com or +55 11 91234-5678 cpf 123.456.789-09 cnpj 12.345.678/0001-95 Bearer abcdef0123456789ABCDEF";
    const r = redactString(s);
    expect(r).not.toContain("joe@example.com");
    expect(r).toContain("[redacted_email]");
    expect(r).toContain("[redacted_phone]");
    expect(r).toContain("[redacted_cpf]");
    expect(r).toContain("[redacted_cnpj]");
    expect(r).toContain("[redacted_bearer]");
  });

  it("redacts sensitive object keys regardless of value type", () => {
    const v = redactValue({
      ok: true,
      customer_email: "x@y.com",
      payload_json: { secret_token: "abc" },
      nested: { authorization: "Bearer xyz", note: "fine" },
    }) as Record<string, unknown>;
    expect(v.customer_email).toBe("[redacted]");
    expect((v.payload_json as Record<string, unknown>)).toEqual("[redacted]");
    expect(((v.nested as Record<string, unknown>).authorization)).toBe("[redacted]");
    expect((v.nested as Record<string, unknown>).note).toBe("fine");
  });

  it("keeps non-PII numbers and booleans intact", () => {
    expect(redactValue({ a: 1, b: true, c: "no pii here" })).toEqual({ a: 1, b: true, c: "no pii here" });
  });
});
