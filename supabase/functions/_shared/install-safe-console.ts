// Wraps the global `console` so every log emitted by this Edge Function
// (and any nested handler module) is automatically scrubbed of PII / secrets
// by `sanitizeForLog`.
//
// This is intentionally non-invasive — call `installSafeConsole("scope")`
// once at the top of an Edge Function entry-point and existing code keeps
// using `console.log/warn/error` unchanged.
//
// It is idempotent: re-installing for the same scope is a no-op.

import { sanitizeForLog } from "./safe-logger.ts";

const INSTALLED = Symbol.for("capi.safeConsole.installed");

export function installSafeConsole(scope: string): void {
  const c = console as unknown as Record<string | symbol, unknown>;
  if (c[INSTALLED]) return;
  c[INSTALLED] = scope;

  const prefix = `[${scope}]`;
  const wrap = (orig: (...a: unknown[]) => void) => (...args: unknown[]) => {
    try {
      const safe = args.map((a) => sanitizeForLog(a));
      orig(prefix, ...safe);
    } catch {
      // Last-resort: never let logging crash the worker.
      orig(prefix, "[log_redaction_failed]");
    }
  };

  console.log   = wrap(console.log.bind(console));
  console.info  = wrap(console.info.bind(console));
  console.warn  = wrap(console.warn.bind(console));
  console.error = wrap(console.error.bind(console));
  console.debug = wrap(console.debug.bind(console));
}
