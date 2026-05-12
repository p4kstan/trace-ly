// Meta CAPI helper: validate token and list ad accounts + pixels via Graph API.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH = "https://graph.facebook.com/v21.0";

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  business_name?: string;
  pixels: { id: string; name: string }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.access_token || "").trim();
    if (!token) {
      return json({ error: "access_token obrigatório" }, 400);
    }

    // 1. Validate token + get user info
    const meRes = await fetch(`${GRAPH}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = await meRes.json();
    if (!meRes.ok) {
      return json({ error: me?.error?.message || "Token inválido", details: me }, 400);
    }

    // 2. List ad accounts
    const adRes = await fetch(
      `${GRAPH}/me/adaccounts?fields=id,account_id,name,business{name}&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const adData = await adRes.json();
    if (!adRes.ok) {
      return json({ error: adData?.error?.message || "Falha ao listar ad accounts", details: adData }, 400);
    }

    const accounts: AdAccount[] = [];
    const adAccounts: any[] = adData?.data || [];

    // 3. For each ad account, list its pixels (in parallel, capped)
    const slice = adAccounts.slice(0, 50);
    await Promise.all(
      slice.map(async (acc: any) => {
        try {
          const pxRes = await fetch(
            `${GRAPH}/${acc.id}/adspixels?fields=id,name&limit=50`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const pxData = await pxRes.json();
          const pixels = (pxData?.data || []).map((p: any) => ({ id: p.id, name: p.name || p.id }));
          accounts.push({
            id: acc.id,
            account_id: acc.account_id,
            name: acc.name,
            business_name: acc.business?.name,
            pixels,
          });
        } catch {
          accounts.push({
            id: acc.id,
            account_id: acc.account_id,
            name: acc.name,
            business_name: acc.business?.name,
            pixels: [],
          });
        }
      }),
    );

    // 4. Aggregate unique pixels across all accounts (helpful for selection)
    const pixelMap = new Map<string, { id: string; name: string; ad_account_ids: string[] }>();
    for (const acc of accounts) {
      for (const px of acc.pixels) {
        const existing = pixelMap.get(px.id);
        if (existing) existing.ad_account_ids.push(acc.account_id);
        else pixelMap.set(px.id, { id: px.id, name: px.name, ad_account_ids: [acc.account_id] });
      }
    }

    return json({
      ok: true,
      user: { id: me.id, name: me.name },
      ad_accounts: accounts,
      pixels: Array.from(pixelMap.values()),
    });
  } catch (e) {
    return json({ error: (e as Error).message || "erro interno" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
