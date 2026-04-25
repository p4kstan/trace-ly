/**
 * Index a knowledge document into traffic_agent_knowledge_documents + _chunks.
 * Body: { workspace_id, title, source_type, provider?, content, metadata? }
 * - Redacts PII before chunking.
 * - Uses tsvector (search_vector) for retrieval. No embeddings yet (pgvector
 *   not enabled). Migration kept embedding column nullable for future use.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { requireUserJwt } from "../_shared/edge-auth.ts";
import { redactString } from "../_shared/traffic-agent-redact.ts";
import { chunkText } from "../_shared/traffic-agent-chunker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const a = await requireUserJwt(req);
  if ("error" in a) return a.error;
  const ctx = a.ctx;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const wid = body?.workspace_id;
  const title = String(body?.title ?? "").trim().slice(0, 200);
  const source = String(body?.source_type ?? "manual").slice(0, 50);
  const provider = body?.provider ? String(body.provider).slice(0, 50) : null;
  const content = String(body?.content ?? "");
  const metadata = body?.metadata ?? {};
  if (!wid || !title || content.length < 10) return json({ error: "missing_fields" }, 400);

  const { data: ok } = await ctx.service.rpc("is_workspace_member", {
    _user_id: ctx.user.id, _workspace_id: wid,
  });
  if (ok !== true) return json({ error: "workspace_forbidden" }, 403);

  const redacted = redactString(content);
  const docHash = await sha256(redacted);

  const { data: doc, error: docErr } = await ctx.service
    .from("traffic_agent_knowledge_documents")
    .insert({
      workspace_id: wid, title, source_type: source, provider,
      content_hash: docHash, metadata, active: true, created_by: ctx.user.id,
    })
    .select().single();
  if (docErr) return json({ error: "insert_doc_failed", detail: docErr.message }, 500);

  const chunks = chunkText(redacted, { maxChars: 1200, overlap: 120 });
  const rows = await Promise.all(chunks.map(async (c, i) => ({
    workspace_id: wid, document_id: doc.id, chunk_index: i,
    content: c, content_hash: await sha256(c), metadata: { title, source_type: source, provider },
  })));
  if (rows.length > 0) {
    const { error: chErr } = await ctx.service.from("traffic_agent_knowledge_chunks").insert(rows);
    if (chErr) return json({ error: "insert_chunks_failed", detail: chErr.message }, 500);
  }
  return json({ ok: true, document_id: doc.id, chunks: rows.length });
});
