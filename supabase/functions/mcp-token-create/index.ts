// Create an MCP API token for the Codex agent.
// Returns the FULL token only once. Stores only SHA-256 hash.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { generateMcpToken, sha256Hex } from "../_shared/mcpAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SCOPES = [
  "traffic-agent:read",
  "traffic-agent:evaluate",
  "traffic-agent:simulate",
  "traffic-agent:dry_run",
  "rag:read",
];
const ALLOWED_SCOPES = new Set([...DEFAULT_SCOPES, "rag:write"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "missing_authorization_header" });
  const jwt = auth.slice(7).trim();

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(500, { error: "auth_not_configured" });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return json(401, { error: "invalid_jwt" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const workspaceId = String(body?.workspace_id || "").trim();
  const name = String(body?.name || "").trim();
  if (!workspaceId) return json(400, { error: "missing_workspace_id" });
  if (!name || name.length > 80) return json(400, { error: "invalid_name" });

  const scopesIn: string[] = Array.isArray(body?.scopes) ? body.scopes : DEFAULT_SCOPES;
  const scopes = scopesIn.filter((s) => typeof s === "string" && ALLOWED_SCOPES.has(s));
  if (scopes.length === 0) return json(400, { error: "no_valid_scopes" });

  let expiresAt: string | null = null;
  if (body?.expires_at) {
    const t = new Date(body.expires_at);
    if (isNaN(t.getTime()) || t.getTime() < Date.now()) return json(400, { error: "invalid_expires_at" });
    expiresAt = t.toISOString();
  }

  const serviceClient = createClient(url, service);

  // Admin gate.
  const { data: isAdmin, error: re } = await serviceClient.rpc("is_workspace_admin", {
    _user_id: u.user.id,
    _workspace_id: workspaceId,
  });
  if (re) return json(500, { error: "membership_check_failed" });
  if (isAdmin !== true) return json(403, { error: "forbidden_admin_only" });

  const { token, prefix } = generateMcpToken();
  const hash = await sha256Hex(token);

  const { data: row, error: ie } = await serviceClient
    .from("mcp_api_tokens")
    .insert({
      workspace_id: workspaceId,
      name,
      token_prefix: prefix,
      token_hash: hash,
      scopes,
      expires_at: expiresAt,
      created_by: u.user.id,
    })
    .select("id, name, token_prefix, scopes, expires_at, created_at")
    .single();

  if (ie || !row) return json(500, { error: "create_failed" });

  // Audit (no token, no hash).
  await serviceClient.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor_user_id: u.user.id,
    action: "mcp_token_create",
    entity_type: "mcp_api_token",
    entity_id: row.id,
    metadata_json: { name, scopes, expires_at: expiresAt },
  }).then(() => {}, () => {});

  return json(200, {
    ok: true,
    id: row.id,
    name: row.name,
    token_prefix: row.token_prefix,
    scopes: row.scopes,
    expires_at: row.expires_at,
    created_at: row.created_at,
    // ONLY returned here; never again.
    token,
  });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
