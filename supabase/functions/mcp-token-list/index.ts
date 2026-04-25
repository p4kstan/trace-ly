// List MCP tokens for a workspace. Never returns token_hash or full token.
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
  const workspaceId = String(body?.workspace_id || "").trim();
  if (!workspaceId) return json(400, { error: "missing_workspace_id" });

  const serviceClient = createClient(url, service);
  const { data: ok, error: re } = await serviceClient.rpc("is_workspace_member", {
    _user_id: u.user.id,
    _workspace_id: workspaceId,
  });
  if (re) return json(500, { error: "membership_check_failed" });
  if (ok !== true) return json(403, { error: "forbidden" });

  const { data, error } = await serviceClient
    .from("mcp_api_tokens")
    .select("id, name, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at, created_by")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return json(500, { error: "list_failed" });
  return json(200, { ok: true, tokens: data ?? [] });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
