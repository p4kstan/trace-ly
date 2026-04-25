// Revoke an MCP token. Sets revoked_at; never deletes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

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
  const tokenId = String(body?.token_id || "").trim();
  if (!tokenId) return json(400, { error: "missing_token_id" });

  const serviceClient = createClient(url, service);
  const { data: row, error: fe } = await serviceClient
    .from("mcp_api_tokens")
    .select("id, workspace_id, revoked_at")
    .eq("id", tokenId)
    .maybeSingle();
  if (fe || !row) return json(404, { error: "not_found" });

  const { data: isAdmin, error: re } = await serviceClient.rpc("is_workspace_admin", {
    _user_id: u.user.id,
    _workspace_id: row.workspace_id,
  });
  if (re) return json(500, { error: "membership_check_failed" });
  if (isAdmin !== true) return json(403, { error: "forbidden_admin_only" });

  if (row.revoked_at) return json(200, { ok: true, already_revoked: true });

  const { error: ue2 } = await serviceClient
    .from("mcp_api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId);
  if (ue2) return json(500, { error: "revoke_failed" });

  await serviceClient.from("audit_logs").insert({
    workspace_id: row.workspace_id,
    actor_user_id: u.user.id,
    action: "mcp_token_revoke",
    entity_type: "mcp_api_token",
    entity_id: tokenId,
    metadata_json: {},
  }).then(() => {}, () => {});

  return json(200, { ok: true });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
