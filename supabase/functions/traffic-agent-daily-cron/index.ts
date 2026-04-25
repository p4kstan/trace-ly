/**
 * Daily orchestrator: runs evaluate (and lightweight simulate of top-N
 * recommendations) for every active workspace. Never mutates externally.
 *
 * Auth: requires header `x-cron-secret: <CRON_SECRET>` OR a valid user JWT
 * (so it can also be triggered manually for one workspace from the UI).
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
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

  const url = Deno.env.get("SUPABASE_URL")!;
  const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = req.headers.get("x-cron-secret");

  let svc: SupabaseClient;
  let scopedWorkspace: string | null = null;

  if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
    svc = createClient(url, sk);
  } else {
    const a = await requireUserJwt(req);
    if ("error" in a) return a.error;
    svc = a.ctx.service;
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    scopedWorkspace = body?.workspace_id ?? null;
    if (scopedWorkspace) {
      const { data: ok } = await svc.rpc("is_workspace_member", {
        _user_id: a.ctx.user.id, _workspace_id: scopedWorkspace,
      });
      if (ok !== true) return json({ error: "workspace_forbidden" }, 403);
    }
  }

  // Discover workspaces. For cron, all active workspaces.
  let workspaces: { id: string }[] = [];
  if (scopedWorkspace) {
    workspaces = [{ id: scopedWorkspace }];
  } else {
    const { data } = await svc.from("workspaces").select("id, status").eq("status", "active").limit(500);
    workspaces = (data ?? []).map((w: any) => ({ id: w.id }));
  }

  const evaluateUrl = `${url}/functions/v1/traffic-agent-evaluate`;
  const results: any[] = [];
  for (const w of workspaces) {
    try {
      const r = await fetch(evaluateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // service-to-service: send cron secret so child function uses
          // service role and skips JWT check.
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
        },
        body: JSON.stringify({ workspace_id: w.id, window_days: 7, mode: "recommendation" }),
      });
      const j = await r.json().catch(() => ({}));
      results.push({ workspace_id: w.id, status: r.status, ok: !!j?.ok, recs: j?.recommendations ?? 0 });
    } catch (e: any) {
      results.push({ workspace_id: w.id, status: 500, error: String(e?.message ?? e) });
    }
  }

  return json({ ok: true, processed: results.length, results });
});
