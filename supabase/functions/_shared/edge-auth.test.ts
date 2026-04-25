import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { shouldRequireSignature } from "./edge-auth.ts";

Deno.test("shouldRequireSignature: production traffic always requires a signature", () => {
  assertEquals(shouldRequireSignature({ testMode: false, hasJwtMember: false }), true);
  assertEquals(shouldRequireSignature({ testMode: false, hasJwtMember: true }), true);
});

Deno.test("shouldRequireSignature: test_mode bypass needs authenticated workspace member", () => {
  // test_mode + JWT member ⇒ allow (this is the only bypass).
  assertEquals(shouldRequireSignature({ testMode: true, hasJwtMember: true }), false);
  // test_mode without JWT ⇒ STILL require signature.
  assertEquals(shouldRequireSignature({ testMode: true, hasJwtMember: false }), true);
});
