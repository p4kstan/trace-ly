/**
 * Search RAG knowledge for a workspace.
 * Body: { workspace_id, query, limit? }
 * Uses tsvector full-text + ILIKE fallback. Returns short snippets only.
 */
import { requireUserJwt } from "../_shared/edge-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const a = await requireUserJwt(req);
  if ("error" in a) return a.error;
  const ctx = a.ctx;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const wid = body?.workspace_id;
  const q = String(body?.query ?? "").trim().slice(0, 500);
  const limit = Math.max(1, Math.min(Number(body?.limit ?? 5), 20));
  if (!wid || q.length < 2) return json({ error: "missing_fields" }, 400);

  const { data: ok } = await ctx.service.rpc("is_workspace_member", {
    _user_id: ctx.user.id, _workspace_id: wid,
  });
  if (ok !== true) return json({ error: "workspace_forbidden" }, 403);

  let rows: any[] = [];
  try {
    const tsq = q.split(/\s+/).filter(Boolean).join(" & ");
    const { data } = await ctx.service
      .from("traffic_agent_knowledge_chunks")
      .select("id, document_id, chunk_index, content, metadata")
      .eq("workspace_id", wid)
      .textSearch("search_vector", tsq, { type: "websearch" })
      .limit(limit);
    rows = data ?? [];
  } catch { /* fall through */ }

  if (rows.length === 0) {
    const { data } = await ctx.service
      .from("traffic_agent_knowledge_chunks")
      .select("id, document_id, chunk_index, content, metadata")
      .eq("workspace_id", wid)
      .ilike("content", `%${q}%`)
      .limit(limit);
    rows = data ?? [];
  }

  return json({
    ok: true,
    results: rows.map((r) => ({
      chunk_id: r.id, document_id: r.document_id, chunk_index: r.chunk_index,
      snippet: String(r.content ?? "").slice(0, 280), metadata: r.metadata ?? {}, score: 0,
    })),
  });
});
