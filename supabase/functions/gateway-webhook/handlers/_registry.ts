// GatewayRegistry — central lookup for gateway-specific handlers.
//
// To add a new gateway:
//   1. Create a handler file in this folder implementing GatewayHandler
//   2. Import it here and register it in HANDLERS
//   3. (Optional) Add detection rules in detectProvider() in ../index.ts
//
// Handlers extracted from the monolithic index.ts so far:
//   - hotmart, kiwify, yampi, eduzz
// The remaining handlers live in index.ts and will be migrated incrementally
// to keep production stable. The router checks this registry first, then
// falls back to legacy handlers.

import type { GatewayHandler } from "./_types.ts";
import { hotmartHandler } from "./hotmart.ts";
import { kiwifyHandler } from "./kiwify.ts";
import { yampiHandler } from "./yampi.ts";
import { eduzzHandler } from "./eduzz.ts";

export const HANDLERS: Record<string, GatewayHandler> = {
  hotmart: hotmartHandler,
  kiwify: kiwifyHandler,
  yampi: yampiHandler,
  eduzz: eduzzHandler,
};

/** Returns the registered handler for `provider`, or null if not found. */
export function getRegisteredHandler(provider: string): GatewayHandler | null {
  return HANDLERS[provider] || null;
}
