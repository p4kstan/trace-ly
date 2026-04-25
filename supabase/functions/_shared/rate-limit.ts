// Shared persistent rate-limiter helper for Edge Functions.
// Backed by `public.rate_limit_hit(...)` which atomically upserts a bucket
// keyed by (route, workspace_id, user_id, ip_hash, window_start).
//
// IMPORTANT: We never store the raw IP. We hash it (SHA-256, hex) before
// it leaves this module so DB rows only ever see opaque digests.
//
// Failure mode (Passo H):
//   - Default is FAIL-OPEN: if the DB call errors we still allow the request,
//     but emit a `safe` console warning so ops can detect the regression.
//   - When `failClosed=true` (or rate_limit_configs.fail_closed=true for the
//     route/workspace), an RPC failure triggers a 429-equivalent response
//     (`allowed=false`, `retryAfterSeconds = windowSeconds`). Callers MUST
//     translate that into HTTP 429.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

export interface RateLimitInput {
  route: string;
  workspaceId?: string | null;
  userId?: string | null;
  rawIp?: string | null;
  windowSeconds?: number;
  maxHits?: number;
  /** When true, RPC errors are treated as "limit exceeded". Default false. */
  failClosed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  limit: number;
  retryAfterSeconds: number;
  /** True when we returned a fallback decision because the RPC failed. */
  degraded?: boolean;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Resolves the effective rate-limit config for a (route, workspace) pair.
 *  Workspace-specific row wins; otherwise falls back to a route-wide row;
 *  otherwise returns the caller-provided defaults.
 *
 *  Failure here is non-fatal — we just keep the caller defaults.
 */
async function resolveConfig(
  supa: ReturnType<typeof createClient>,
  input: RateLimitInput,
): Promise<{ failClosed: boolean; windowSeconds: number; maxHits: number }> {
  const fallback = {
    failClosed: input.failClosed === true,
    windowSeconds: input.windowSeconds ?? 60,
    maxHits: input.maxHits ?? 30,
  };
  try {
    const { data } = await supa
      .from("rate_limit_configs")
      .select("workspace_id, fail_closed, window_seconds, max_hits")
      .eq("route", input.route)
      .or(
        input.workspaceId
          ? `workspace_id.eq.${input.workspaceId},workspace_id.is.null`
          : "workspace_id.is.null",
      )
      .limit(5);
    const rows = (data || []) as Array<Record<string, unknown>>;
    if (!rows.length) return fallback;
    // Prefer the row that targets the workspace explicitly.
    const ranked = rows.sort((a, b) => {
      const aw = a.workspace_id ? 0 : 1;
      const bw = b.workspace_id ? 0 : 1;
      return aw - bw;
    });
    const top = ranked[0] as Record<string, unknown>;
    return {
      failClosed: Boolean(top.fail_closed) || fallback.failClosed,
      windowSeconds: Number(top.window_seconds) || fallback.windowSeconds,
      maxHits: Number(top.max_hits) || fallback.maxHits,
    };
  } catch {
    return fallback;
  }
}

/**
 * Persistent rate-limit check. Default is fail-open; pass `failClosed=true`
 * (or set it in rate_limit_configs) to deny when the underlying RPC errors.
 */
export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const ip = (input.rawIp || "").split(",")[0].trim();
  const ipHash = ip ? await sha256Hex(`rl:${ip}`) : "";

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const cfg = await resolveConfig(supa, input);

  const { data, error } = await supa.rpc("rate_limit_hit", {
    _route: input.route,
    _workspace_id: input.workspaceId ?? null,
    _user_id: input.userId ?? null,
    _ip_hash: ipHash,
    _window_seconds: cfg.windowSeconds,
    _max_hits: cfg.maxHits,
  });

  if (error || !data) {
    console.warn("rate_limit_hit_failed", error?.message || "unknown", "fail_closed=", cfg.failClosed);
    if (cfg.failClosed) {
      return {
        allowed: false,
        hits: cfg.maxHits + 1,
        limit: cfg.maxHits,
        retryAfterSeconds: cfg.windowSeconds,
        degraded: true,
      };
    }
    return {
      allowed: true,
      hits: 0,
      limit: cfg.maxHits,
      retryAfterSeconds: 0,
      degraded: true,
    };
  }

  const d = data as Record<string, unknown>;
  return {
    allowed: Boolean(d.allowed),
    hits: Number(d.hits || 0),
    limit: Number(d.limit || cfg.maxHits),
    retryAfterSeconds: Number((d as Record<string, unknown>).retry_after_seconds || 0),
  };
}
