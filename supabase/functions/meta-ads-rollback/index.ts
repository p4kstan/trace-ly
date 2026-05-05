/**
 * meta-ads-rollback — reverte uma ação Meta Ads registrada em ai_actions_log.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function buildInverse(payload: any, before: any): any | null {
  if (!payload?.action) return null;

  if (payload.action === "update_campaign_status" || payload.action === "update_adset_status") {
    return { ...payload, status: payload.status === "PAUSED" ? "ACTIVE" : "PAUSED" };
  }
  if (payload.action === "update_campaign_budget" && before?.daily_budget_brl) {
    return { ...payload, daily_budget_brl: before.daily_budget_brl };
  }
  if (payload.action === "update_adset_budget" && before?.daily_budget_brl) {
    return { ...payload, daily_budget_brl: before.daily_budget_brl };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { action_log_id } = await req.json();
    if (!action_log_id) return json({ error: "action_log_id required" }, 400);

    const { data: log, error: logErr } = await userClient
      .from("ai_actions_log")
      .select("*")
      .eq("id", action_log_id)
      .maybeSingle();

    if (logErr || !log) return json({ error: "Action log not found or no access" }, 404);
    if (log.status !== "applied") return json({ error: `Cannot rollback (status=${log.status})` }, 400);

    const inverse = log.rollback_payload || buildInverse(log.mutation_payload, log.before_snapshot);
    if (!inverse) return json({ error: "Rollback not supported for this action type" }, 400);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const r = await fetch(`${supaUrl}/functions/v1/meta-ads-mutate`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(inverse),
    });
    const result = await r.json();
    if (!r.ok) {
      await service.from("ai_actions_log").update({
        mutation_response: { ...(log.mutation_response || {}), rollback_error: result },
      }).eq("id", action_log_id);
      return json({ error: "Rollback mutation failed", detail: result }, 502);
    }

    await service.from("ai_actions_log").update({
      status: "rolled_back",
      rolled_back_at: new Date().toISOString(),
      rollback_payload: inverse,
      mutation_response: { ...(log.mutation_response || {}), rollback_result: result },
    }).eq("id", action_log_id);

    return json({ ok: true, result });
  } catch (e) {
    console.error("meta-ads-rollback error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
