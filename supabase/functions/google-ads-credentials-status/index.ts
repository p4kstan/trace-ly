import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mask(value: string | undefined | null, keepStart = 6, keepEnd = 4): string | null {
  if (!value) return null;
  if (value.length <= keepStart + keepEnd) return "•".repeat(value.length);
  return `${value.slice(0, keepStart)}${"•".repeat(8)}${value.slice(-keepEnd)}`;
}

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

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspace_id");

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    const devToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");

    let cred: any = null;
    if (workspaceId) {
      const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await service
        .from("google_ads_credentials")
        .select("customer_id, status, last_sync_at, last_error, refresh_token, token_expires_at, updated_at")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      cred = data;
    }

    return new Response(JSON.stringify({
      secrets: {
        GOOGLE_OAUTH_CLIENT_ID: { exists: !!clientId, masked: mask(clientId) },
        GOOGLE_OAUTH_CLIENT_SECRET: { exists: !!clientSecret, masked: mask(clientSecret) },
        GOOGLE_ADS_DEVELOPER_TOKEN: { exists: !!devToken, masked: mask(devToken) },
      },
      workspace_credentials: cred ? {
        customer_id: cred.customer_id,
        customer_id_formatted: cred.customer_id ? `${cred.customer_id.slice(0,3)}-${cred.customer_id.slice(3,6)}-${cred.customer_id.slice(6)}` : null,
        status: cred.status,
        has_refresh_token: !!cred.refresh_token,
        token_expires_at: cred.token_expires_at,
        last_sync_at: cred.last_sync_at,
        last_error: cred.last_error,
        updated_at: cred.updated_at,
      } : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("status error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
