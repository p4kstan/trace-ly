/**
 * google-ads-assets — gerencia extensões/assets de campanha Google Ads.
 *
 * Body comum: { workspace_id, customer_id, campaign_id, action }
 *
 * Actions:
 *   - "list"           → lista sitelinks, callouts e structured snippets vinculados à campanha
 *   - "create_sitelink" → { link_text, final_urls:[], description1?, description2? }
 *   - "create_callout"  → { callout_text }
 *   - "create_snippet"  → { header, values: string[] }   header = "Brands"|"Services"|...
 *   - "remove"          → { asset_resource_name }   (remove o link CampaignAsset, não deleta o asset global)
 *
 * Toda escrita usa a Google Ads API v21:
 *   1) cria/usa o asset em /assets:mutate
 *   2) vincula via /campaignAssets:mutate com fieldType (SITELINK / CALLOUT / STRUCTURED_SNIPPET)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function refreshAccessToken(refreshToken: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`refresh failed: ${JSON.stringify(j)}`);
  return { access_token: j.access_token as string, expires_in: j.expires_in as number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u, error: uerr } = await userClient.auth.getUser();
    if (uerr || !u?.user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { workspace_id, customer_id, campaign_id, action } = body || {};
    if (!workspace_id || !customer_id || !action) return json({ error: "workspace_id, customer_id, action required" }, 400);

    // Resolve credentials
    const { data: credList } = await service.from("google_ads_credentials")
      .select("*").eq("workspace_id", workspace_id).eq("customer_id", customer_id).limit(1);
    const cred = credList?.[0];
    if (!cred) return json({ error: "Google Ads não conectado", reconnect: true }, 400);

    let accessToken = cred.access_token as string;
    if (!cred.token_expires_at || new Date(cred.token_expires_at).getTime() < Date.now()) {
      const r = await refreshAccessToken(cred.refresh_token);
      accessToken = r.access_token;
      await service.from("google_ads_credentials").update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + (r.expires_in - 60) * 1000).toISOString(),
      }).eq("workspace_id", workspace_id).eq("customer_id", customer_id);
    }

    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": cred.developer_token || Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!,
      "Content-Type": "application/json",
    };
    const apiBase = `https://googleads.googleapis.com/v21/customers/${customer_id}`;

    const callMutate = async (url: string, payload: unknown) => {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      const text = await r.text();
      let j: any; try { j = JSON.parse(text); } catch { return { ok: false, status: 502, body: { error: "non-JSON", detail: text.slice(0, 500) } }; }
      return { ok: r.ok, status: r.status, body: j };
    };

    // ─── LIST ───────────────────────────────────────────────────
    if (action === "list") {
      if (!campaign_id) return json({ error: "campaign_id required" }, 400);
      const q = `
        SELECT campaign.id,
               campaign_asset.resource_name, campaign_asset.field_type, campaign_asset.status,
               asset.resource_name, asset.id, asset.type,
               asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2,
               asset.final_urls,
               asset.callout_asset.callout_text,
               asset.structured_snippet_asset.header, asset.structured_snippet_asset.values
        FROM campaign_asset
        WHERE campaign.id = ${campaign_id}
          AND campaign_asset.field_type IN ('SITELINK','CALLOUT','STRUCTURED_SNIPPET')
      `.trim();
      const r = await fetch(`${apiBase}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query: q }) });
      const j = await r.json();
      if (!r.ok) return json({ error: "search failed", detail: j }, 502);
      const rows = (j.results || []).map((row: any) => {
        const a = row.asset || {};
        const ca = row.campaignAsset || {};
        return {
          asset_id: String(a.id || ""),
          asset_resource: a.resourceName,
          campaign_asset_resource: ca.resourceName,
          field_type: ca.fieldType,
          status: ca.status,
          link_text: a.sitelinkAsset?.linkText,
          description1: a.sitelinkAsset?.description1,
          description2: a.sitelinkAsset?.description2,
          final_urls: a.finalUrls || [],
          callout_text: a.calloutAsset?.calloutText,
          snippet_header: a.structuredSnippetAsset?.header,
          snippet_values: a.structuredSnippetAsset?.values || [],
        };
      });
      return json({ ok: true, rows });
    }

    // ─── REMOVE link ────────────────────────────────────────────
    if (action === "remove") {
      const campaign_asset_resource = body.campaign_asset_resource as string | undefined;
      if (!campaign_asset_resource) return json({ error: "campaign_asset_resource required" }, 400);
      const r = await callMutate(`${apiBase}/campaignAssets:mutate`, {
        operations: [{ remove: campaign_asset_resource }],
      });
      if (!r.ok) return json({ error: "remove failed", detail: r.body }, 502);
      return json({ ok: true, result: r.body });
    }

    // helper: create asset, then link it
    const createAndLink = async (assetCreate: Record<string, unknown>, fieldType: "SITELINK" | "CALLOUT" | "STRUCTURED_SNIPPET") => {
      if (!campaign_id) return json({ error: "campaign_id required" }, 400);
      const ar = await callMutate(`${apiBase}/assets:mutate`, { operations: [{ create: assetCreate }] });
      if (!ar.ok) return json({ error: "asset create failed", detail: ar.body }, 502);
      const assetResource = ar.body?.results?.[0]?.resourceName;
      if (!assetResource) return json({ error: "asset created but no resourceName returned", detail: ar.body }, 502);

      const lr = await callMutate(`${apiBase}/campaignAssets:mutate`, {
        operations: [{
          create: {
            campaign: `customers/${customer_id}/campaigns/${campaign_id}`,
            asset: assetResource,
            fieldType,
          },
        }],
      });
      if (!lr.ok) return json({ error: "asset link failed", detail: lr.body, asset: assetResource }, 502);
      return json({ ok: true, asset: assetResource, link: lr.body });
    };

    // ─── CREATE SITELINK ────────────────────────────────────────
    if (action === "create_sitelink") {
      const link_text = String(body.link_text || "").trim();
      const final_urls = Array.isArray(body.final_urls) ? body.final_urls.filter(Boolean) : [];
      if (!link_text || final_urls.length === 0) return json({ error: "link_text and final_urls required" }, 400);
      if (link_text.length > 25) return json({ error: "link_text máx 25 chars" }, 400);
      const sitelinkAsset: Record<string, unknown> = { linkText: link_text };
      if (body.description1) sitelinkAsset.description1 = String(body.description1).slice(0, 35);
      if (body.description2) sitelinkAsset.description2 = String(body.description2).slice(0, 35);
      return await createAndLink({ finalUrls: final_urls, sitelinkAsset }, "SITELINK");
    }

    // ─── CREATE CALLOUT ─────────────────────────────────────────
    if (action === "create_callout") {
      const callout_text = String(body.callout_text || "").trim();
      if (!callout_text) return json({ error: "callout_text required" }, 400);
      if (callout_text.length > 25) return json({ error: "callout_text máx 25 chars" }, 400);
      return await createAndLink({ calloutAsset: { calloutText: callout_text } }, "CALLOUT");
    }

    // ─── CREATE STRUCTURED SNIPPET ──────────────────────────────
    if (action === "create_snippet") {
      const header = String(body.header || "").trim();
      const values = Array.isArray(body.values) ? body.values.map((v: any) => String(v).trim()).filter(Boolean) : [];
      if (!header || values.length < 3) return json({ error: "header e ao menos 3 values requeridos" }, 400);
      return await createAndLink({ structuredSnippetAsset: { header, values: values.slice(0, 10) } }, "STRUCTURED_SNIPPET");
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("assets error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
