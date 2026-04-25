// Shared persistent rate-limiter helper for Edge Functions.
// Backed by `public.rate_limit_hit(...)` which atomically upserts a bucket
// keyed by (route, workspace_id, user_id, ip_hash, window_start).
//
// IMPORTANT: We never store the raw IP. We hash it (SHA-256, hex) before
// it leaves this module so DB rows only ever see opaque digests.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

export interface RateLimitInput {
  route: string;
  workspaceId?: string | null;
  userId?: string | null;
  rawIp?: string | null;
  windowSeconds?: number;
  maxHits?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  limit: number;
  retryAfterSeconds: number;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Persistent rate-limit check. Fail-open if the DB call errors so a bad
 * deploy of the helper does not lock everyone out.
 */
export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const ip = (input.rawIp || "").split(",")[0].trim();
  const ipHash = ip ? await sha256Hex(`rl:${ip}`) : "";

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supa.rpc("rate_limit_hit", {
    _route: input.route,
    _workspace_id: input.workspaceId ?? null,
    _user_id: input.userId ?? null,
    _ip_hash: ipHash,
    _window_seconds: input.windowSeconds ?? 60,
    _max_hits: input.maxHits ?? 30,
  });

  if (error || !data) {
    // Fail-open but log via safe console.
    console.warn("rate_limit_hit_failed", error?.message || "unknown");
    return {
      allowed: true,
      hits: 0,
      limit: input.maxHits ?? 30,
      retryAfterSeconds: 0,
    };
  }

  const d = data as Record<string, unknown>;
  return {
    allowed: Boolean(d.allowed),
    hits: Number(d.hits || 0),
    limit: Number(d.limit || (input.maxHits ?? 30)),
    retryAfterSeconds: Number((d as any).retry_after_seconds || 0),
  };
}
