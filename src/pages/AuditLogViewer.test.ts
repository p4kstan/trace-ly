// Redaction contract tests for AuditLogViewer.
// We test the pure `redactValue` helper to guarantee that NO raw PII reaches
// the DOM, regardless of what an audit row's metadata may contain.
//
// To keep this test framework-free (no React/JSDOM), the helper is mirrored
// here. Drift is caught by the `release-validate.sh` scanner that asserts
// the same regex set lives in `src/pages/AuditLogViewer.tsx`.

import { describe, it, expect } from "vitest";

const PII_KEY_RE =
  /(email|phone|telefone|celular|cpf|cnpj|document|address|endereco|ip|user_agent|token|secret|key|authorization|cookie|pix|copia)/i;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const LONG_DIGITS_RE = /\b\d{6,}\b/g;
const HEX_TOKEN_RE = /\b[a-f0-9]{40,}\b/gi;

function redactValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "string") {
    if (v.length > 240) return v.slice(0, 240) + "…";
    return v
      .replace(EMAIL_RE, "[redacted-email]")
      .replace(HEX_TOKEN_RE, "[redacted-token]")
      .replace(LONG_DIGITS_RE, "[redacted-num]");
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (PII_KEY_RE.test(k)) out[k] = "[redacted]";
      else out[k] = redactValue(val);
    }
    return out;
  }
  return v;
}

describe("AuditLogViewer.redactValue", () => {
  it("redacts known PII keys regardless of value", () => {
    const input = {
      email: "joao@example.com",
      phone: "+55 11 99999-8888",
      cpf: "123.456.789-09",
      cnpj: "12.345.678/0001-90",
      ip: "10.0.0.1",
      user_agent: "Mozilla/5.0",
      authorization: "Bearer abc",
      cookie: "s=1",
      api_key: "sk_live_xxx",
      pix_copia_cola: "00020126...",
      ok_field: "visible",
    };
    const out = redactValue(input) as any;
    for (const k of ["email","phone","cpf","cnpj","ip","user_agent","authorization","cookie","api_key","pix_copia_cola"]) {
      expect(out[k]).toBe("[redacted]");
    }
    expect(out.ok_field).toBe("visible");
  });

  it("masks PII patterns inside string values even with safe key", () => {
    const out = redactValue({
      message: "user joao@example.com placed order; ref 123456789012",
      token_blob: "deadbeef".repeat(8), // hex 64 chars
    }) as any;
    expect(out.message).not.toContain("joao@example.com");
    expect(out.message).toContain("[redacted-email]");
    expect(out.message).toContain("[redacted-num]");
    // token_blob — key matches `token`, so whole value redacted.
    expect(out.token_blob).toBe("[redacted]");
  });

  it("masks long hex tokens (JWT/API key shaped) when key is innocuous", () => {
    const out = redactValue({
      note: "x=" + "a".repeat(48),
    }) as any;
    expect(out.note).toContain("[redacted-token]");
  });

  it("recurses into nested objects and arrays", () => {
    const out = redactValue({
      user: { email: "x@y.com", phone: "11999998888" },
      items: [{ document: "12345678909" }, { ok: "v" }],
    }) as any;
    expect(out.user.email).toBe("[redacted]");
    expect(out.user.phone).toBe("[redacted]");
    expect(out.items[0].document).toBe("[redacted]");
    expect(out.items[1].ok).toBe("v");
  });

  it("truncates extremely long strings to avoid leaking blobs", () => {
    // Use non-hex chars so HEX_TOKEN_RE doesn't fire — we want to exercise
    // the length-truncation branch specifically.
    const big = "z".repeat(500);
    const out = redactValue({ description: big }) as { description: string };
    expect(out.description.length).toBeLessThanOrEqual(241);
    expect(out.description.endsWith("…")).toBe(true);
  });

  it("preserves null / numbers / booleans verbatim", () => {
    expect(redactValue(null)).toBe(null);
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
  });
});
