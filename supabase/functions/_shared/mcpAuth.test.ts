// Tests for shared mcpAuth helper.
// Verifies hashing and token generation properties only — no DB/network calls.

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateMcpToken, sha256Hex } from "./mcpAuth.ts";

Deno.test("generateMcpToken returns capi_mcp_ prefix", () => {
  const { token, prefix } = generateMcpToken();
  assert(token.startsWith("capi_mcp_"), "token must start with capi_mcp_");
  assert(prefix.startsWith("capi_mcp_"), "prefix must start with capi_mcp_");
  assert(token.length > prefix.length, "full token longer than prefix");
});

Deno.test("generateMcpToken yields unique tokens", () => {
  const a = generateMcpToken().token;
  const b = generateMcpToken().token;
  assertNotEquals(a, b);
});

Deno.test("sha256Hex is deterministic 64 hex chars", async () => {
  const h1 = await sha256Hex("capi_mcp_demo");
  const h2 = await sha256Hex("capi_mcp_demo");
  assertEquals(h1, h2);
  assertEquals(h1.length, 64);
  assert(/^[0-9a-f]{64}$/.test(h1));
});

Deno.test("sha256Hex differs across inputs (no raw token leak by hashing)", async () => {
  const h1 = await sha256Hex("capi_mcp_aaa");
  const h2 = await sha256Hex("capi_mcp_bbb");
  assertNotEquals(h1, h2);
});
