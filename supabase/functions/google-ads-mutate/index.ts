import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-source",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`refresh failed: ${JSON.stringify(j)}`);
  return { access_token: j.access_token as string, expires_in: j.expires_in as number };
}

interface MutateBody {
  workspace_id: string;
  customer_id: string;
  action: string;
  // Campaign
  campaign_id?: string;
  status?: "ENABLED" | "PAUSED";
  budget_micros?: number;
  budget_resource?: string;
  // Keyword
  ad_group_criterion_id?: string;
  ad_group_id?: string;
  cpc_bid_micros?: number;
  // Negative keyword
  keyword_text?: string;
  match_type?: "EXACT" | "PHRASE" | "BROAD";
  level?: "campaign" | "ad_group";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const internalSource = req.headers.get("x-internal-source");
    const authHeader = req.headers.get("Authorization");
    const isInternal = internalSource === "mcp" || internalSource === "automation";

    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Internal callers (MCP / auto-feedback) authenticate via service-role bearer +
    // x-internal-source header. Skips per-user JWT lookup for service automation.
    if (!isInternal) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);
    } else {
      const token = authHeader.replace("Bearer ", "");
      if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
        return json({ error: "Unauthorized internal call" }, 401);
      }
    }

    const body = (await req.json()) as MutateBody;
    const {
      workspace_id, customer_id, action,
      campaign_id, status, budget_micros, budget_resource,
      ad_group_criterion_id, ad_group_id, cpc_bid_micros,
      keyword_text, match_type, level,
    } = body || {} as MutateBody;

    if (!workspace_id || !customer_id || !action) {
      return json({ error: "workspace_id, customer_id, action required" }, 400);
    }

    const { data: credList } = await service
      .from("google_ads_credentials")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("customer_id", customer_id)
      .limit(1);
    const cred = credList?.[0];
    if (!cred) return json({ error: "Google Ads not connected", reconnect: true }, 400);

    let accessToken = cred.access_token as string;
    if (!cred.token_expires_at || new Date(cred.token_expires_at).getTime() < Date.now()) {
      if (!cred.refresh_token) return json({ error: "Reconnect required", reconnect: true }, 400);
      try {
        const refreshed = await refreshAccessToken(cred.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
        await service
          .from("google_ads_credentials")
          .update({ access_token: accessToken, token_expires_at: newExpiry })
          .eq("workspace_id", workspace_id)
          .eq("customer_id", customer_id);
      } catch {
        return json({ error: "Reconnect required", reconnect: true }, 400);
      }
    }

    const developerToken = cred.developer_token || Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    const apiBase = `https://googleads.googleapis.com/v21/customers/${customer_id}`;

    const callMutate = async (url: string, payload: unknown) => {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      const text = await r.text();
      let resJson: unknown;
      try { resJson = JSON.parse(text); } catch {
        return json({ error: "non-JSON response", detail: text.slice(0, 500) }, 502);
      }
      if (!r.ok) return json({ error: "Google Ads mutate error", detail: resJson }, 502);
      return json({ ok: true, result: resJson });
    };

    // ── Campaign status ───────────────────────────────
    if (action === "update_campaign_status") {
      if (!campaign_id || !status) return json({ error: "campaign_id and status required" }, 400);
      return await callMutate(`${apiBase}/campaigns:mutate`, {
        operations: [{
          update: { resourceName: `customers/${customer_id}/campaigns/${campaign_id}`, status },
          updateMask: "status",
        }],
      });
    }

    // ── Campaign budget ───────────────────────────────
    if (action === "update_budget") {
      if (!budget_resource || !budget_micros) {
        return json({ error: "budget_resource and budget_micros required" }, 400);
      }
      return await callMutate(`${apiBase}/campaignBudgets:mutate`, {
        operations: [{
          update: { resourceName: budget_resource, amountMicros: String(budget_micros) },
          updateMask: "amount_micros",
        }],
      });
    }

    if (action === "get_campaign_budget") {
      if (!campaign_id) return json({ error: "campaign_id required" }, 400);
      const query = `SELECT campaign_budget.resource_name, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaign_id}`;
      const r = await fetch(`${apiBase}/googleAds:search`, {
        method: "POST", headers, body: JSON.stringify({ query }),
      });
      const text = await r.text();
      let resJson: any;
      try { resJson = JSON.parse(text); } catch { return json({ error: "non-JSON", detail: text.slice(0, 500) }, 502); }
      if (!r.ok) return json({ error: "search failed", detail: resJson }, 502);
      const row = resJson.results?.[0];
      return json({
        ok: true,
        budget_resource: row?.campaignBudget?.resourceName,
        budget_micros: Number(row?.campaignBudget?.amountMicros ?? 0),
      });
    }

    // ── Keyword: update CPC bid ───────────────────────
    // ad_group_criterion_id is the criterion id — Google's resource is
    // customers/{cid}/adGroupCriteria/{ad_group_id}~{criterion_id}
    if (action === "update_keyword_bid") {
      if (!ad_group_id || !ad_group_criterion_id || !cpc_bid_micros) {
        return json({ error: "ad_group_id, ad_group_criterion_id, cpc_bid_micros required" }, 400);
      }
      const resourceName = `customers/${customer_id}/adGroupCriteria/${ad_group_id}~${ad_group_criterion_id}`;
      return await callMutate(`${apiBase}/adGroupCriteria:mutate`, {
        operations: [{
          update: { resourceName, cpcBidMicros: String(cpc_bid_micros) },
          updateMask: "cpc_bid_micros",
        }],
      });
    }

    // ── Ad: pause / enable individual ad ──────────────
    if (action === "update_ad_status") {
      const ad_id = (body as any).ad_id as string | undefined;
      if (!ad_group_id || !ad_id || !status) {
        return json({ error: "ad_group_id, ad_id, status required" }, 400);
      }
      const resourceName = `customers/${customer_id}/adGroupAds/${ad_group_id}~${ad_id}`;
      return await callMutate(`${apiBase}/adGroupAds:mutate`, {
        operations: [{
          update: { resourceName, status },
          updateMask: "status",
        }],
      });
    }

    // ── Keyword: pause / enable ───────────────────────
    if (action === "update_keyword_status") {
      if (!ad_group_id || !ad_group_criterion_id || !status) {
        return json({ error: "ad_group_id, ad_group_criterion_id, status required" }, 400);
      }
      const resourceName = `customers/${customer_id}/adGroupCriteria/${ad_group_id}~${ad_group_criterion_id}`;
      return await callMutate(`${apiBase}/adGroupCriteria:mutate`, {
        operations: [{
          update: { resourceName, status },
          updateMask: "status",
        }],
      });
    }

    // ── Ad group: update default CPC bid ──────────────
    if (action === "update_ad_group_bid") {
      if (!ad_group_id || !cpc_bid_micros) {
        return json({ error: "ad_group_id and cpc_bid_micros required" }, 400);
      }
      const resourceName = `customers/${customer_id}/adGroups/${ad_group_id}`;
      return await callMutate(`${apiBase}/adGroups:mutate`, {
        operations: [{
          update: { resourceName, cpcBidMicros: String(cpc_bid_micros) },
          updateMask: "cpc_bid_micros",
        }],
      });
    }

    // ── Rename campaign ───────────────────────────────
    if (action === "rename_campaign") {
      const new_name = (body as any).new_name as string | undefined;
      if (!campaign_id || !new_name?.trim()) return json({ error: "campaign_id and new_name required" }, 400);
      return await callMutate(`${apiBase}/campaigns:mutate`, {
        operations: [{
          update: { resourceName: `customers/${customer_id}/campaigns/${campaign_id}`, name: new_name.trim() },
          updateMask: "name",
        }],
      });
    }

    // ── Rename ad group ───────────────────────────────
    if (action === "rename_ad_group") {
      const new_name = (body as any).new_name as string | undefined;
      if (!ad_group_id || !new_name?.trim()) return json({ error: "ad_group_id and new_name required" }, 400);
      return await callMutate(`${apiBase}/adGroups:mutate`, {
        operations: [{
          update: { resourceName: `customers/${customer_id}/adGroups/${ad_group_id}`, name: new_name.trim() },
          updateMask: "name",
        }],
      });
    }

    // ── Negative keyword: add at campaign or ad-group level ───────
    if (action === "add_negative_keyword") {
      if (!keyword_text || !match_type) {
        return json({ error: "keyword_text and match_type required" }, 400);
      }
      const lvl = level || (campaign_id ? "campaign" : "ad_group");

      if (lvl === "campaign") {
        if (!campaign_id) return json({ error: "campaign_id required for campaign-level" }, 400);
        return await callMutate(`${apiBase}/campaignCriteria:mutate`, {
          operations: [{
            create: {
              campaign: `customers/${customer_id}/campaigns/${campaign_id}`,
              negative: true,
              keyword: { text: keyword_text, matchType: match_type },
            },
          }],
        });
      } else {
        if (!ad_group_id) return json({ error: "ad_group_id required for ad-group-level" }, 400);
        return await callMutate(`${apiBase}/adGroupCriteria:mutate`, {
          operations: [{
            create: {
              adGroup: `customers/${customer_id}/adGroups/${ad_group_id}`,
              negative: true,
              keyword: { text: keyword_text, matchType: match_type },
            },
          }],
        });
      }
    }

    // ── Lookup: GCLID → keyword/ad_group/campaign (click_view) ──
    if (action === "lookup_keyword_by_gclid") {
      const gclid = (body as any).gclid as string | undefined;
      if (!gclid) return json({ error: "gclid required" }, 400);
      // click_view is partitioned by date — query last 90 days for safety.
      const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const query = `
        SELECT click_view.gclid, click_view.keyword, click_view.keyword_info.text,
               click_view.keyword_info.match_type, click_view.ad_group_ad,
               segments.ad_network_type, segments.date
        FROM click_view
        WHERE click_view.gclid = '${gclid.replace(/'/g, "")}'
          AND segments.date BETWEEN '${since}' AND '${today}'
      `.trim();
      const r = await fetch(`${apiBase}/googleAds:search`, {
        method: "POST", headers, body: JSON.stringify({ query }),
      });
      const text = await r.text();
      let resJson: any;
      try { resJson = JSON.parse(text); } catch {
        return json({ error: "non-JSON", detail: text.slice(0, 500) }, 502);
      }
      if (!r.ok) return json({ ok: false, error: "search failed", detail: resJson }, 502);
      const row = resJson.results?.[0];
      return json({
        ok: true,
        keyword_resource: row?.clickView?.keyword,
        keyword_text: row?.clickView?.keywordInfo?.text || null,
        match_type: row?.clickView?.keywordInfo?.matchType || null,
      });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("mutate error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
