// Shared MCP token authentication helper.
// Accepts either a Supabase JWT (existing flow) OR a `capi_mcp_...` MCP token.
// Never logs the raw token. Token is hashed (SHA-256, hex) before lookup.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

export interface McpAuthContext {
  user: { id: string | null; email?: string | null };
  /** Workspace this caller is acting on. */
  workspaceId: string;
  /** 'jwt' for Supabase user JWT, 'mcp_token' for capi_mcp_* tokens. */
  authMethod: "jwt" | "mcp_token";
  /** Token id (only set for mcp_token). */
  tokenId?: string;
  scopes: string[];
  /** Service-role client (RLS bypassed; gate manually). */
  service: SupabaseClient;
}

const MCP_TOKEN_PREFIX = "capi_mcp_";

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Extract Bearer token (JWT or MCP) and resolve to an auth context bound to
 * a workspace_id. Returns either { ctx } or { error: Response }.
 *
 * For MCP tokens, workspace_id is derived from the token row.
 * For JWTs, the caller must provide `workspaceId` (we verify membership).
 */
export async function requireMcpAuth(
  req: Request,
  opts: { workspaceId?: string; requireAdmin?: boolean } = {},
): Promise<{ ctx: McpAuthContext } | { error: Response }> {
  const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return { error: jsonErr(401, "missing_authorization_header") };
  const token = auth.slice(7).trim();
  if (!token) return { error: jsonErr(401, "empty_token") };

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return { error: jsonErr(500, "auth_not_configured") };

  const serviceClient = createClient(url, service);

  // Path 1: MCP token.
  if (token.startsWith(MCP_TOKEN_PREFIX)) {
    const hash = await sha256Hex(token);
    const { data: row, error } = await serviceClient
      .from("mcp_api_tokens")
      .select("id, workspace_id, scopes, expires_at, revoked_at")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !row) return { error: jsonErr(401, "invalid_mcp_token") };
    if (row.revoked_at) return { error: jsonErr(401, "mcp_token_revoked") };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { error: jsonErr(401, "mcp_token_expired") };
    }
    if (opts.workspaceId && opts.workspaceId !== row.workspace_id) {
      return { error: jsonErr(403, "workspace_mismatch") };
    }

    // Best-effort last_used_at update — never block on failure.
    serviceClient
      .from("mcp_api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id)
      .then(() => {}, () => {});

    return {
      ctx: {
        user: { id: null },
        workspaceId: row.workspace_id,
        authMethod: "mcp_token",
        tokenId: row.id,
        scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
        service: serviceClient,
      },
    };
  }

  // Path 2: Supabase JWT.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return { error: jsonErr(401, "invalid_jwt") };
  if (!opts.workspaceId) return { error: jsonErr(400, "missing_workspace_id") };

  const fn = opts.requireAdmin ? "is_workspace_admin" : "is_workspace_member";
  const { data: ok, error: re } = await serviceClient.rpc(fn, {
    _user_id: u.user.id,
    _workspace_id: opts.workspaceId,
  });
  if (re) return { error: jsonErr(500, "membership_check_failed") };
  if (ok !== true) return { error: jsonErr(403, "workspace_forbidden") };

  return {
    ctx: {
      user: { id: u.user.id, email: u.user.email ?? null },
      workspaceId: opts.workspaceId,
      authMethod: "jwt",
      scopes: ["*"],
      service: serviceClient,
    },
  };
}

export function hasScope(ctx: McpAuthContext, scope: string): boolean {
  return ctx.scopes.includes("*") || ctx.scopes.includes(scope);
}

export function generateMcpToken(): { token: string; prefix: string } {
  // 32 random bytes -> 43-char base64url. Combined with capi_mcp_ prefix.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const token = `${MCP_TOKEN_PREFIX}${b64}`;
  // Show first 12 chars of body for UI hints (capi_mcp_ABC1234XYZ…).
  const prefix = token.slice(0, MCP_TOKEN_PREFIX.length + 8);
  return { token, prefix };
}

function jsonErr(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
