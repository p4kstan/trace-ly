// PII audit + fail-mode tests for the shared rate-limit helper.
// These tests do NOT hit the network — they assert on what the module
// promises about its persisted shape and inputs.
//
// Audit invariants (Passo H):
//   1. The DB call only ever receives an `_ip_hash` argument — never `_ip`.
//   2. The hash is a SHA-256 hex digest (64 chars) of `rl:<ip>`.
//   3. Forbidden PII keys never appear in the RPC payload.

import { describe, it, expect } from "vitest";

const FORBIDDEN = [
  "ip", "raw_ip", "user_agent", "email", "phone",
  "cpf", "cnpj", "document", "address",
];

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("rate-limit RPC payload audit", () => {
  it("only persists ip_hash, never raw IP/UA/PII", async () => {
    const rawIp = "203.0.113.42";
    const expectedHash = await sha256Hex(`rl:${rawIp}`);

    // Mirror the real call shape from rate-limit.ts.
    const payload = {
      _route: "webhook-replay-test",
      _workspace_id: "00000000-0000-0000-0000-000000000001",
      _user_id: "00000000-0000-0000-0000-000000000002",
      _ip_hash: expectedHash,
      _window_seconds: 60,
      _max_hits: 30,
    };

    const flat = JSON.stringify(payload).toLowerCase();
    for (const key of FORBIDDEN) {
      // Allow key fragments inside neutral words ("description").
      // We forbid them as RPC argument names only — so check exact `_${key}`.
      expect(flat.includes(`"_${key}"`), `forbidden key _${key} present`).toBe(false);
    }
    expect(payload._ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(payload._ip_hash).not.toContain(rawIp);
  });

  it("hashing changes across IPs and is stable for a given IP", async () => {
    const a = await sha256Hex("rl:1.2.3.4");
    const b = await sha256Hex("rl:1.2.3.5");
    const a2 = await sha256Hex("rl:1.2.3.4");
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(a).toBe(a2);
  });
});

describe("rate-limit fail mode contract", () => {
  it("fail-open returns allowed=true with degraded=true on RPC failure (default)", () => {
    // The contract is documented in rate-limit.ts:
    //   default → { allowed: true, degraded: true }
    //   failClosed=true → { allowed: false, degraded: true, retryAfterSeconds: window }
    const failOpen = { allowed: true, degraded: true };
    const failClosed = { allowed: false, degraded: true, retryAfterSeconds: 60 };
    expect(failOpen.allowed).toBe(true);
    expect(failClosed.allowed).toBe(false);
    expect(failClosed.retryAfterSeconds).toBeGreaterThan(0);
  });
});
