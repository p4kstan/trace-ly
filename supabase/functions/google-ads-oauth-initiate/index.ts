import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { workspace_id, customer_id, account_label, return_url } = await req.json();
    if (!workspace_id || !customer_id) {
      return new Response(JSON.stringify({ error: "workspace_id and customer_id required" }), { status: 400, headers: corsHeaders });
    }

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-ads-oauth-callback`;

    // State carries workspace_id + customer_id + return_url, signed-ish (base64). Real signing not critical here since callback verifies via DB lookup.
    const cleanedCid = customer_id.replace(/-/g, "");
    const state = btoa(JSON.stringify({
      workspace_id,
      customer_id: cleanedCid,
      account_label: account_label || null,
      return_url: return_url || "/contas-conectadas",
      user_id: userData.user.id,
      ts: Date.now(),
    }));

    // Persist pending row (multi-account: unique on workspace_id + customer_id)
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: existing } = await service
      .from("google_ads_credentials")
      .select("customer_id, is_default")
      .eq("workspace_id", workspace_id)
      .eq("customer_id", cleanedCid)
      .maybeSingle();
    if (existing) {
      await service.from("google_ads_credentials")
        .update({ status: "pending", account_label: account_label || undefined })
        .eq("workspace_id", workspace_id)
        .eq("customer_id", cleanedCid);
    } else {
      // Check if any account exists — first one becomes default
      const { count } = await service
        .from("google_ads_credentials")
        .select("customer_id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id);
      await service.from("google_ads_credentials").insert({
        workspace_id,
        customer_id: cleanedCid,
        status: "pending",
        account_label: account_label || null,
        is_default: (count || 0) === 0,
        routing_mode: "all",
        routing_domains: [],
        routing_tags: [],
      });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/adwords",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return new Response(JSON.stringify({ auth_url: authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("oauth-initiate error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
