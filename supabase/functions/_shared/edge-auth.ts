// Shared auth helpers for Edge Functions — Passo N.
// Pure helpers; never log secrets, never echo Authorization headers.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

export interface AuthContext {
  user: { id: string; email?: string | null };
  jwt: string;
  /** Service-role client for server-side checks (RLS bypassed; we gate manually). */
  service: SupabaseClient;
}

/**
 * Require a valid Supabase JWT from `Authorization: Bearer <token>`.
 * Returns null on failure with a `Response` ready to send.
 */
export async function requireUserJwt(req: Request): Promise<
  { ctx: AuthContext } | { error: Response }
> {
  const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return { error: jsonError(401, "missing_authorization_header") };
  }
  const jwt = auth.slice(7).trim();
  if (!jwt) return { error: jsonError(401, "empty_jwt") };

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return { error: jsonError(500, "auth_not_configured") };

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return { error: jsonError(401, "invalid_jwt") };

  const serviceClient = createClient(url, service);
  return {
    ctx: {
      user: { id: data.user.id, email: data.user.email ?? null },
      jwt,
      service: serviceClient,
    },
  };
}

/**
 * Require workspace membership via `is_workspace_member` RPC.
 * Pass `requireAdmin=true` to require owner/admin via `is_workspace_admin`.
 */
export async function requireWorkspaceAccess(
  ctx: AuthContext,
  workspaceId: string,
  requireAdmin = false,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!workspaceId || typeof workspaceId !== "string") {
    return { ok: false, response: jsonError(400, "missing_workspace_id") };
  }
  const fn = requireAdmin ? "is_workspace_admin" : "is_workspace_member";
  const { data, error } = await ctx.service.rpc(fn, {
    _user_id: ctx.user.id,
    _workspace_id: workspaceId,
  });
  if (error) return { ok: false, response: jsonError(500, "membership_check_failed") };
  if (data !== true) return { ok: false, response: jsonError(403, "workspace_forbidden") };
  return { ok: true };
}

/**
 * Reject unsigned webhook payloads in production.
 * Returns true ONLY when running in test_mode AND the caller is an authenticated
 * workspace member (verified upstream). All other unsigned hits are rejected.
 */
export function shouldRequireSignature(opts: {
  testMode: boolean;
  hasJwtMember: boolean;
}): boolean {
  if (opts.testMode && opts.hasJwtMember) return false;
  return true;
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
