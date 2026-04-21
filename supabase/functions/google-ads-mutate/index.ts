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

    // ── Toggle ad group status ────────────────────────
    if (action === "update_ad_group_status") {
      if (!ad_group_id || !status) return json({ error: "ad_group_id and status required" }, 400);
      return await callMutate(`${apiBase}/adGroups:mutate`, {
        operations: [{
          update: { resourceName: `customers/${customer_id}/adGroups/${ad_group_id}`, status },
          updateMask: "status",
        }],
      });
    }

    // ── Bidding strategy (campaign) ───────────────────
    // Supported: MAXIMIZE_CONVERSIONS, MAXIMIZE_CONVERSION_VALUE, TARGET_CPA,
    //            TARGET_ROAS, MANUAL_CPC, MAXIMIZE_CLICKS
    if (action === "update_bidding_strategy") {
      const strategy = (body as any).strategy as string | undefined;
      const target_cpa_micros = (body as any).target_cpa_micros as number | undefined;
      const target_roas = (body as any).target_roas as number | undefined;
      if (!campaign_id || !strategy) return json({ error: "campaign_id and strategy required" }, 400);

      const update: Record<string, unknown> = { resourceName: `customers/${customer_id}/campaigns/${campaign_id}` };
      const masks: string[] = [];

      switch (strategy) {
        case "MAXIMIZE_CONVERSIONS":
          update.maximizeConversions = target_cpa_micros ? { targetCpaMicros: String(target_cpa_micros) } : {};
          masks.push("maximize_conversions");
          break;
        case "MAXIMIZE_CONVERSION_VALUE":
          update.maximizeConversionValue = target_roas ? { targetRoas: target_roas } : {};
          masks.push("maximize_conversion_value");
          break;
        case "TARGET_CPA":
          if (!target_cpa_micros) return json({ error: "target_cpa_micros required" }, 400);
          update.targetCpa = { targetCpaMicros: String(target_cpa_micros) };
          masks.push("target_cpa");
          break;
        case "TARGET_ROAS":
          if (!target_roas) return json({ error: "target_roas required" }, 400);
          update.targetRoas = { targetRoas: target_roas };
          masks.push("target_roas");
          break;
        case "MANUAL_CPC":
          update.manualCpc = {};
          masks.push("manual_cpc");
          break;
        case "MAXIMIZE_CLICKS":
          update.targetSpend = {};
          masks.push("target_spend");
          break;
        default:
          return json({ error: `unsupported strategy: ${strategy}` }, 400);
      }

      return await callMutate(`${apiBase}/campaigns:mutate`, {
        operations: [{ update, updateMask: masks.join(",") }],
      });
    }

    // ── Bid modifier on a campaign criterion (device, age, gender, etc.) ──
    // Used to do +20% / -50% on a segment, or fully exclude (negative=true).
    if (action === "update_campaign_criterion_bid_modifier") {
      const criterion_id = (body as any).criterion_id as string | undefined;
      const bid_modifier = (body as any).bid_modifier as number | undefined; // 1.0 = no change, 1.2 = +20%
      if (!campaign_id || !criterion_id || bid_modifier == null) {
        return json({ error: "campaign_id, criterion_id, bid_modifier required" }, 400);
      }
      const resourceName = `customers/${customer_id}/campaignCriteria/${campaign_id}~${criterion_id}`;
      return await callMutate(`${apiBase}/campaignCriteria:mutate`, {
        operations: [{
          update: { resourceName, bidModifier: bid_modifier },
          updateMask: "bid_modifier",
        }],
      });
    }

    // ── Bid modifier on an ad-group criterion (demographics) ──────────
    if (action === "update_ad_group_criterion_bid_modifier") {
      const criterion_id = (body as any).criterion_id as string | undefined;
      const bid_modifier = (body as any).bid_modifier as number | undefined;
      if (!ad_group_id || !criterion_id || bid_modifier == null) {
        return json({ error: "ad_group_id, criterion_id, bid_modifier required" }, 400);
      }
      const resourceName = `customers/${customer_id}/adGroupCriteria/${ad_group_id}~${criterion_id}`;
      return await callMutate(`${apiBase}/adGroupCriteria:mutate`, {
        operations: [{
          update: { resourceName, bidModifier: bid_modifier },
          updateMask: "bid_modifier",
        }],
      });
    }

    // ── Edit Responsive Search Ad text (headlines / descriptions) ─────
    // Google Ads API does NOT allow updating text of an existing ad — you must
    // create a new ad and remove the old one. We do exactly that.
    if (action === "edit_responsive_search_ad") {
      const ad_id = (body as any).ad_id as string | undefined;
      const headlines = ((body as any).headlines as string[] | undefined) || [];
      const descriptions = ((body as any).descriptions as string[] | undefined) || [];
      const final_urls = ((body as any).final_urls as string[] | undefined) || [];
      const path1 = (body as any).path1 as string | undefined;
      const path2 = (body as any).path2 as string | undefined;
      if (!ad_group_id || !ad_id || headlines.length < 3 || descriptions.length < 2 || final_urls.length === 0) {
        return json({
          error: "ad_group_id, ad_id, ≥3 headlines, ≥2 descriptions, final_urls required",
        }, 400);
      }

      // 1) Create new ad with same ad group
      const createUrl = `${apiBase}/adGroupAds:mutate`;
      const newAdPayload = {
        operations: [{
          create: {
            adGroup: `customers/${customer_id}/adGroups/${ad_group_id}`,
            status: "ENABLED",
            ad: {
              finalUrls: final_urls,
              responsiveSearchAd: {
                headlines: headlines.slice(0, 15).map((t) => ({ text: t })),
                descriptions: descriptions.slice(0, 4).map((t) => ({ text: t })),
                ...(path1 ? { path1 } : {}),
                ...(path2 ? { path2 } : {}),
              },
            },
          },
        }],
      };
      const createRes = await fetch(createUrl, { method: "POST", headers, body: JSON.stringify(newAdPayload) });
      const createTxt = await createRes.text();
      let createJson: any; try { createJson = JSON.parse(createTxt); } catch { return json({ error: "non-JSON on create", detail: createTxt.slice(0, 500) }, 502); }
      if (!createRes.ok) return json({ error: "create new ad failed", detail: createJson }, 502);

      // 2) Remove old ad
      const oldResource = `customers/${customer_id}/adGroupAds/${ad_group_id}~${ad_id}`;
      const removeRes = await fetch(createUrl, {
        method: "POST", headers,
        body: JSON.stringify({ operations: [{ remove: oldResource }] }),
      });
      const removeTxt = await removeRes.text();
      let removeJson: any; try { removeJson = JSON.parse(removeTxt); } catch { removeJson = { raw: removeTxt.slice(0, 200) }; }
      if (!removeRes.ok) {
        // New ad was created — surface a partial-success warning.
        return json({
          ok: true,
          warning: "new ad created but failed to remove old ad",
          create: createJson, remove_error: removeJson,
        });
      }
      return json({ ok: true, create: createJson, remove: removeJson });
    }

    // ── Duplicate an ad (creates a copy in the same ad group) ─────────
    if (action === "duplicate_ad") {
      const ad_id = (body as any).ad_id as string | undefined;
      if (!ad_group_id || !ad_id) return json({ error: "ad_group_id, ad_id required" }, 400);

      // Fetch source ad first
      const q = `
        SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines,
               ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1,
               ad_group_ad.ad.responsive_search_ad.path2, ad_group_ad.ad.type
        FROM ad_group_ad
        WHERE ad_group_ad.ad.id = ${ad_id}
      `.trim();
      const sr = await fetch(`${apiBase}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: q }) });
      const sj = await sr.json();
      const src = sj.results?.[0]?.adGroupAd?.ad;
      if (!src?.responsiveSearchAd) return json({ error: "ad not found or unsupported type" }, 400);

      return await callMutate(`${apiBase}/adGroupAds:mutate`, {
        operations: [{
          create: {
            adGroup: `customers/${customer_id}/adGroups/${ad_group_id}`,
            status: "PAUSED",
            ad: {
              finalUrls: src.finalUrls || [],
              responsiveSearchAd: {
                headlines: src.responsiveSearchAd.headlines,
                descriptions: src.responsiveSearchAd.descriptions,
                ...(src.responsiveSearchAd.path1 ? { path1: src.responsiveSearchAd.path1 } : {}),
                ...(src.responsiveSearchAd.path2 ? { path2: src.responsiveSearchAd.path2 } : {}),
              },
            },
          },
        }],
      });
    }

    // ── Create a new positive keyword in an ad group ─────────────────
    if (action === "create_keyword") {
      if (!ad_group_id || !keyword_text || !match_type) {
        return json({ error: "ad_group_id, keyword_text, match_type required" }, 400);
      }
      const op: Record<string, unknown> = {
        adGroup: `customers/${customer_id}/adGroups/${ad_group_id}`,
        status: "ENABLED",
        keyword: { text: keyword_text.trim(), matchType: match_type },
      };
      if (cpc_bid_micros) op.cpcBidMicros = String(cpc_bid_micros);
      return await callMutate(`${apiBase}/adGroupCriteria:mutate`, {
        operations: [{ create: op }],
      });
    }

    // ── Duplicate a keyword (same text, different ad group OR same group paused) ──
    if (action === "duplicate_keyword") {
      const target_ad_group_id = ((body as any).target_ad_group_id as string | undefined) || ad_group_id;
      if (!ad_group_criterion_id || !ad_group_id || !target_ad_group_id) {
        return json({ error: "ad_group_id, ad_group_criterion_id required" }, 400);
      }
      // Fetch source keyword
      const q = `
        SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
               ad_group_criterion.cpc_bid_micros
        FROM ad_group_criterion
        WHERE ad_group_criterion.criterion_id = ${ad_group_criterion_id}
          AND ad_group.id = ${ad_group_id}
      `.trim();
      const sr = await fetch(`${apiBase}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: q }) });
      const sj = await sr.json();
      const src = sj.results?.[0]?.adGroupCriterion;
      if (!src?.keyword) return json({ error: "keyword not found" }, 400);

      const op: Record<string, unknown> = {
        adGroup: `customers/${customer_id}/adGroups/${target_ad_group_id}`,
        status: "PAUSED",
        keyword: { text: src.keyword.text, matchType: src.keyword.matchType },
      };
      if (src.cpcBidMicros) op.cpcBidMicros = src.cpcBidMicros;
      return await callMutate(`${apiBase}/adGroupCriteria:mutate`, { operations: [{ create: op }] });
    }

    // ── Create a new ad group inside the campaign ────────────────────
    if (action === "create_ad_group") {
      const new_name = (body as any).new_name as string | undefined;
      if (!campaign_id || !new_name?.trim()) return json({ error: "campaign_id and new_name required" }, 400);
      const op: Record<string, unknown> = {
        campaign: `customers/${customer_id}/campaigns/${campaign_id}`,
        name: new_name.trim(),
        status: "ENABLED",
        type: "SEARCH_STANDARD",
      };
      if (cpc_bid_micros) op.cpcBidMicros = String(cpc_bid_micros);
      return await callMutate(`${apiBase}/adGroups:mutate`, { operations: [{ create: op }] });
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
