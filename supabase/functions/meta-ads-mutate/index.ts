/**
 * meta-ads-mutate — aplica ações no Meta Marketing API v22.0.
 *
 * Body:
 *   { workspace_id, account_id, action, ... }
 *
 * Actions:
 *   - update_campaign_status { campaign_id, status: "ACTIVE"|"PAUSED" }
 *   - update_adset_status    { adset_id, status: "ACTIVE"|"PAUSED" }
 *   - update_campaign_budget { campaign_id, daily_budget_brl }
 *   - update_adset_budget    { adset_id, daily_budget_brl }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-source",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const META_API = "https://graph.facebook.com/v22.0";

interface Body {
  workspace_id: string;
  account_id: string;          // sem prefixo act_
  action: string;
  campaign_id?: string;
  adset_id?: string;
  status?: "ACTIVE" | "PAUSED";
  daily_budget_brl?: number;   // R$ (será convertido para centavos)
}

async function metaPost(token: string, path: string, params: Record<string, string>) {
  const form = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${META_API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await r.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: r.ok, status: r.status, data: parsed };
}

async function metaGet(token: string, path: string, fields?: string) {
  const url = new URL(`${META_API}/${path}`);
  if (fields) url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  const r = await fetch(url.toString());
  const text = await r.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: r.ok, status: r.status, data: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const internal = req.headers.get("x-internal-source");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (internal !== "mcp" && internal !== "automation") {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: u, error: ue } = await userClient.auth.getUser();
      if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);
    } else {
      const token = authHeader.replace("Bearer ", "");
      if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return json({ error: "Unauthorized internal call" }, 401);
    }

    const body = (await req.json()) as Body;
    const { workspace_id, account_id, action } = body || {} as Body;
    if (!workspace_id || !account_id || !action) {
      return json({ error: "workspace_id, account_id, action required" }, 400);
    }

    const normalized = String(account_id).replace(/^act_/, "");

    const { data: accs } = await service.from("meta_ad_accounts")
      .select("*")
      .eq("workspace_id", workspace_id)
      .or(`ad_account_id.eq.${normalized},ad_account_id.eq.act_${normalized}`)
      .limit(1);
    const acc = accs?.[0];
    if (!acc?.access_token) return json({ error: "Meta account not connected", reconnect: true, account_id: normalized }, 400);

    const token = acc.access_token as string;

    if (action === "update_campaign_status") {
      if (!body.campaign_id || !body.status) return json({ error: "campaign_id and status required" }, 400);
      const r = await metaPost(token, body.campaign_id, { status: body.status });
      if (!r.ok) return json({ error: "meta_api_error", detail: r.data }, 502);
      return json({ ok: true, result: r.data });
    }

    if (action === "update_adset_status") {
      if (!body.adset_id || !body.status) return json({ error: "adset_id and status required" }, 400);
      const r = await metaPost(token, body.adset_id, { status: body.status });
      if (!r.ok) return json({ error: "meta_api_error", detail: r.data }, 502);
      return json({ ok: true, result: r.data });
    }

    if (action === "update_campaign_budget") {
      if (!body.campaign_id || !body.daily_budget_brl) return json({ error: "campaign_id and daily_budget_brl required" }, 400);
      const cents = Math.round(Number(body.daily_budget_brl) * 100);
      const r = await metaPost(token, body.campaign_id, { daily_budget: String(cents) });
      if (!r.ok) return json({ error: "meta_api_error", detail: r.data }, 502);
      return json({ ok: true, result: r.data });
    }

    if (action === "update_adset_budget") {
      if (!body.adset_id || !body.daily_budget_brl) return json({ error: "adset_id and daily_budget_brl required" }, 400);
      const cents = Math.round(Number(body.daily_budget_brl) * 100);
      const r = await metaPost(token, body.adset_id, { daily_budget: String(cents) });
      if (!r.ok) return json({ error: "meta_api_error", detail: r.data }, 502);
      return json({ ok: true, result: r.data });
    }

    if (action === "get_campaign") {
      if (!body.campaign_id) return json({ error: "campaign_id required" }, 400);
      const r = await metaGet(token, body.campaign_id, "id,name,status,daily_budget,lifetime_budget");
      if (!r.ok) return json({ error: "meta_api_error", detail: r.data }, 502);
      return json({ ok: true, result: r.data });
    }

    if (action === "get_adset") {
      if (!body.adset_id) return json({ error: "adset_id required" }, 400);
      const r = await metaGet(token, body.adset_id, "id,name,status,daily_budget,lifetime_budget");
      if (!r.ok) return json({ error: "meta_api_error", detail: r.data }, 502);
      return json({ ok: true, result: r.data });
    }

    return json({ error: `unsupported action: ${action}` }, 400);
  } catch (e) {
    console.error("meta-ads-mutate error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
