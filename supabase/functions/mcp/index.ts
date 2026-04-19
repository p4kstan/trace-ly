import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  execCampaignsPause,
  execCampaignsResume,
  execCampaignsUpdateBudget,
  execAdGroupsSetStatus,
  execAdGroupsUpdateBid,
  execBidModifiersUpdate,
  execKeywordsUpdateBid,
  execKeywordsSetStatus,
  execNegativeKeywordsAdd,
} from "./tools-write.ts";
import {
  getEnrichedConversions,
  getRoiSnapshot,
  getKeywordBehavior,
  getRecentAutomationActions,
} from "./tools-read-enriched.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Helpers ──────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateMcpToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "mcp_";
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function validateToken(supabase: ReturnType<typeof createClient>, token: string) {
  const tokenHash = await hashToken(token);
  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("revoked", false)
    .maybeSingle();

  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  // Update last_used_at
  await supabase.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data;
}

function hasPermission(tokenPerms: string[], required: string[]): boolean {
  if (tokenPerms.includes("admin")) return true;
  return required.every((r) => tokenPerms.includes(r));
}

// ── MCP Tools registry ──────────────────────────────────────────────
const MCP_TOOLS = [
  // Read
  { name: "analytics.get_events", description: "Retorna eventos recentes do workspace", permissions: ["read"] },
  { name: "analytics.get_conversions", description: "Retorna conversões e receita", permissions: ["read"] },
  { name: "analytics.get_enriched_conversions", description: "Conversões com gclid/fbclid/utm cruzados", permissions: ["read"] },
  { name: "analytics.get_roi_snapshot", description: "ROI 7d por canal + atribuição híbrida", permissions: ["read"] },
  { name: "tracking.get_sessions", description: "Retorna sessões ativas", permissions: ["read"] },
  { name: "tracking.get_pixels", description: "Retorna pixels configurados", permissions: ["read"] },
  { name: "system.get_logs", description: "Retorna logs do sistema", permissions: ["read"] },
  { name: "system.get_errors", description: "Retorna erros e falhas recentes", permissions: ["read"] },
  { name: "system.get_performance", description: "Retorna métricas de performance", permissions: ["read", "analyze"] },
  { name: "system.get_automation_actions", description: "Histórico de ações dos agentes", permissions: ["read"] },
  { name: "workspace.get_settings", description: "Retorna configurações do workspace", permissions: ["read"] },
  { name: "queue.get_status", description: "Retorna status da fila de eventos", permissions: ["read"] },
  { name: "deliveries.get_failed", description: "Retorna entregas com falha", permissions: ["read"] },
  { name: "analytics.get_keyword_behavior", description: "Sinais comportamentais (scroll/dwell/CTA) por keyword + flags de keywords engajadas sem conversão", permissions: ["read"] },
  // Write (require 'write' permission — log every action in automation_actions)
  { name: "campaigns.pause", description: "Pausa uma campanha do Google Ads", permissions: ["write"] },
  { name: "campaigns.resume", description: "Reativa uma campanha do Google Ads", permissions: ["write"] },
  { name: "campaigns.update_budget", description: "Atualiza o orçamento diário (BRL) de uma campanha", permissions: ["write"] },
  { name: "keywords.update_bid", description: "Ajusta CPC máximo de uma palavra-chave específica baseado no ROI real", permissions: ["write"] },
  { name: "keywords.set_status", description: "Pausa ou ativa uma palavra-chave específica", permissions: ["write"] },
  { name: "ad_groups.update_bid", description: "Ajusta CPC default de um ad group inteiro", permissions: ["write"] },
  { name: "ad_groups.set_status", description: "Pausa/reativa um ad group (dry-run hoje)", permissions: ["write"] },
  { name: "negative_keywords.add", description: "Adiciona palavra-chave negativa em campanha ou ad group", permissions: ["write"] },
  { name: "bid_modifiers.update", description: "Ajusta bid modifier por critério (dry-run hoje)", permissions: ["write"] },
];

// ── Tool executors ───────────────────────────────────────────────────
async function executeTool(
  supabase: ReturnType<typeof createClient>,
  toolName: string,
  workspaceId: string,
  params: Record<string, unknown> = {},
) {
  const limit = Math.min(Number(params.limit) || 50, 200);

  switch (toolName) {
    case "analytics.get_events": {
      const { data } = await supabase
        .from("events")
        .select("id, event_name, event_time, source, processing_status, page_path")
        .eq("workspace_id", workspaceId)
        .order("event_time", { ascending: false })
        .limit(limit);
      return { events: data || [], count: (data || []).length };
    }
    case "analytics.get_conversions": {
      const { data } = await supabase
        .from("conversions")
        .select("id, conversion_type, value, currency, attributed_source, attributed_campaign, happened_at")
        .eq("workspace_id", workspaceId)
        .order("happened_at", { ascending: false })
        .limit(limit);
      const total = (data || []).reduce((s, c) => s + (c.value || 0), 0);
      return { conversions: data || [], count: (data || []).length, total_value: total };
    }
    case "tracking.get_sessions": {
      const { data, count } = await supabase
        .from("sessions" as any)
        .select("*", { count: "exact", head: false })
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return { sessions: data || [], count: count || 0 };
    }
    case "tracking.get_pixels": {
      const { data } = await supabase
        .from("meta_pixels")
        .select("id, name, pixel_id, is_active, test_event_code")
        .eq("workspace_id", workspaceId);
      return { pixels: data || [], count: (data || []).length };
    }
    case "system.get_logs": {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return { logs: data || [], count: (data || []).length };
    }
    case "system.get_errors": {
      const { data } = await supabase
        .from("event_deliveries")
        .select("id, provider, status, error_message, attempt_count, created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit);
      return { errors: data || [], count: (data || []).length };
    }
    case "system.get_performance": {
      const { count: totalEvents } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      const { count: pendingQueue } = await supabase
        .from("event_queue")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "queued");
      const { count: failedDeliveries } = await supabase
        .from("event_deliveries")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "failed");
      return {
        total_events: totalEvents || 0,
        pending_queue: pendingQueue || 0,
        failed_deliveries: failedDeliveries || 0,
        health: (failedDeliveries || 0) === 0 ? "healthy" : "degraded",
      };
    }
    case "workspace.get_settings": {
      const { data } = await supabase
        .from("workspaces")
        .select("id, name, slug, plan, status, created_at")
        .eq("id", workspaceId)
        .single();
      return { workspace: data };
    }
    case "queue.get_status": {
      const statuses = ["queued", "processing", "delivered", "retry", "dead_letter"];
      const counts: Record<string, number> = {};
      for (const s of statuses) {
        const { count } = await supabase
          .from("event_queue")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", s);
        counts[s] = count || 0;
      }
      return { queue: counts };
    }
    case "deliveries.get_failed": {
      const { data } = await supabase
        .from("dead_letter_events")
        .select("id, source_type, provider, error_message, retry_count, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return { dead_letters: data || [], count: (data || []).length };
    }
    case "analytics.get_enriched_conversions":
      return await getEnrichedConversions(supabase, workspaceId, Number(params.limit) || 50);
    case "analytics.get_roi_snapshot":
      return await getRoiSnapshot(supabase, workspaceId);
    case "analytics.get_keyword_behavior":
      return await getKeywordBehavior(supabase, workspaceId, Number(params.window_days) || 14);
    case "system.get_automation_actions":
      return await getRecentAutomationActions(supabase, workspaceId, Number(params.limit) || 20);
    default:
      return { error: "Tool not found" };
  }
}

// Write tools dispatcher — separate from executeTool because they need ctx (token id)
// and they record into automation_actions for audit/UI.
async function executeWriteTool(
  ctx: { supabase: ReturnType<typeof createClient>; workspaceId: string; tokenId: string },
  toolName: string,
  params: Record<string, any>,
) {
  switch (toolName) {
    case "campaigns.pause":
      return await execCampaignsPause(ctx, params as any);
    case "campaigns.resume":
      return await execCampaignsResume(ctx, params as any);
    case "campaigns.update_budget":
      return await execCampaignsUpdateBudget(ctx, params as any);
    case "keywords.update_bid":
      return await execKeywordsUpdateBid(ctx, params as any);
    case "keywords.set_status":
      return await execKeywordsSetStatus(ctx, params as any);
    case "ad_groups.update_bid":
      return await execAdGroupsUpdateBid(ctx, params as any);
    case "ad_groups.set_status":
      return await execAdGroupsSetStatus(ctx, params as any);
    case "negative_keywords.add":
      return await execNegativeKeywordsAdd(ctx, params as any);
    case "bid_modifiers.update":
      return await execBidModifiersUpdate(ctx, params as any);
    default:
      return { ok: false, error: "Unknown write tool" };
  }
}

// ── Route handler ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const path = url.pathname.split("/").filter(Boolean);
  const action = path[path.length - 1] || "mcp";

  try {
    // ── POST /mcp/token → create token (requires auth) ──
    if (action === "token" && req.method === "POST") {
      const authHeader = req.headers.get("authorization") || "";
      const jwt = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);

      const body = await req.json().catch(() => ({}));
      const workspaceId = body.workspace_id;
      if (!workspaceId) return json({ error: "workspace_id required" }, 400);

      // Verify membership
      const { data: member } = await supabase.rpc("is_workspace_member", {
        _user_id: user.id,
        _workspace_id: workspaceId,
      });
      if (!member) return json({ error: "Not a workspace member" }, 403);

      // Generate token and hash
      const tokenPlain = generateMcpToken();
      const tokenHash = await hashToken(tokenPlain);
      const permissions = body.permissions || ["read"];
      const expiresAt = body.expires_in_days
        ? new Date(Date.now() + body.expires_in_days * 86400000).toISOString()
        : null;

      const { data: created, error: insertErr } = await supabase
        .from("mcp_tokens")
        .insert({
          workspace_id: workspaceId,
          token_hash: tokenHash,
          name: body.name || "MCP Token",
          permissions,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (insertErr) return json({ error: insertErr.message }, 500);
      // Return plaintext token ONLY once — it's never stored
      return json({ token: tokenPlain, id: created.id, expires_at: created.expires_at, permissions });
    }

    // ── POST /mcp/revoke → revoke token (requires auth) ──
    if (action === "revoke" && req.method === "POST") {
      const authHeader = req.headers.get("authorization") || "";
      const jwt = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);

      const body = await req.json().catch(() => ({}));
      if (!body.token_id) return json({ error: "token_id required" }, 400);

      const { error } = await supabase
        .from("mcp_tokens")
        .update({ revoked: true })
        .eq("id", body.token_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── GET /mcp/tools → list available tools (token auth) ──
    if (action === "tools" && req.method === "GET") {
      const token = url.searchParams.get("token") || req.headers.get("x-mcp-token") || "";
      const validated = await validateToken(supabase, token);
      if (!validated) return json({ error: "Invalid or expired token" }, 401);

      const available = MCP_TOOLS.filter((t) => hasPermission(validated.permissions, t.permissions));
      return json({ tools: available, total: available.length });
    }

    // ── GET /mcp/context → full workspace context (token auth) ──
    if (action === "context" && req.method === "GET") {
      const token = url.searchParams.get("token") || req.headers.get("x-mcp-token") || "";
      const validated = await validateToken(supabase, token);
      if (!validated) return json({ error: "Invalid or expired token" }, 401);
      if (!hasPermission(validated.permissions, ["read"])) return json({ error: "Insufficient permissions" }, 403);

      const wid = validated.workspace_id;
      const startTime = Date.now();

      const [events, conversions, performance, queue, pixels] = await Promise.all([
        executeTool(supabase, "analytics.get_events", wid, { limit: 10 }),
        executeTool(supabase, "analytics.get_conversions", wid, { limit: 10 }),
        executeTool(supabase, "system.get_performance", wid),
        executeTool(supabase, "queue.get_status", wid),
        executeTool(supabase, "tracking.get_pixels", wid),
      ]);

      return json({
        workspace_id: wid,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        context: { events, conversions, performance, queue, pixels },
      });
    }

    // ── POST /mcp/execute → execute a tool (token auth) ──
    if ((action === "execute" || action === "connect") && req.method === "POST") {
      const token = req.headers.get("x-mcp-token") || "";
      const validated = await validateToken(supabase, token);
      if (!validated) return json({ error: "Invalid or expired token" }, 401);

      const body = await req.json().catch(() => ({}));
      const toolName = body.tool;
      if (!toolName) return json({ error: "tool required" }, 400);

      const toolDef = MCP_TOOLS.find((t) => t.name === toolName);
      if (!toolDef) return json({ error: `Tool '${toolName}' not found` }, 404);
      if (!hasPermission(validated.permissions, toolDef.permissions))
        return json({ error: "Insufficient permissions" }, 403);

      const startTime = Date.now();
      const isWrite = toolDef.permissions.includes("write");
      const result = isWrite
        ? await executeWriteTool(
            { supabase, workspaceId: validated.workspace_id, tokenId: validated.id },
            toolName,
            body.params || {},
          )
        : await executeTool(supabase, toolName, validated.workspace_id, body.params || {});
      const duration = Date.now() - startTime;

      // Log the call
      await supabase.from("mcp_logs").insert({
        workspace_id: validated.workspace_id,
        token_id: validated.id,
        tool: toolName,
        request_json: body.params || {},
        response_json: result,
        duration_ms: duration,
        status: "success",
      });

      return json({ tool: toolName, result, duration_ms: duration });
    }

    // ── Default: info ──
    return json({
      service: "CapiTrack AI MCP Server",
      version: "1.0.0",
      endpoints: [
        "POST /mcp/token — Generate MCP token (requires auth)",
        "POST /mcp/revoke — Revoke a token (requires auth)",
        "GET  /mcp/tools — List available tools (requires MCP token)",
        "GET  /mcp/context — Full workspace context (requires MCP token)",
        "POST /mcp/execute — Execute a tool (requires MCP token)",
      ],
      tools: MCP_TOOLS.map((t) => t.name),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
