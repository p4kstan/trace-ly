import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Public endpoint (Google redirects here). No JWT required.
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    const appOrigin = "https://trace-ly.lovable.app";

    if (errorParam) {
      return Response.redirect(`${appOrigin}/setup-google?gads=error&reason=${encodeURIComponent(errorParam)}`, 302);
    }
    if (!code || !stateRaw) {
      return new Response("Missing code/state", { status: 400 });
    }

    let state: any;
    try {
      state = JSON.parse(atob(stateRaw));
    } catch {
      return new Response("Bad state", { status: 400 });
    }

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-ads-oauth-callback`;

    // Exchange code -> tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("token exchange failed", tokenJson);
      return Response.redirect(`${appOrigin}/setup-google?gads=error&reason=token_exchange`, 302);
    }

    const { access_token, refresh_token, expires_in } = tokenJson;
    const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000).toISOString();

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Multi-conta: upsert por (workspace_id, customer_id) — permite N contas por workspace.
    // Se for a primeira conta do workspace, marca como default.
    const { count } = await service
      .from("google_ads_credentials")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", state.workspace_id);

    const isFirst = !count || count === 0;

    await service.from("google_ads_credentials").upsert({
      workspace_id: state.workspace_id,
      customer_id: state.customer_id,
      access_token,
      refresh_token: refresh_token ?? null,
      token_expires_at: expiresAt,
      status: "connected",
      last_error: null,
      developer_token: Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? null,
      ...(isFirst ? { is_default: true, account_label: state.account_label || "Conta principal" } : {}),
    }, { onConflict: "workspace_id,customer_id" });

    return Response.redirect(`${appOrigin}${state.return_url || "/setup-google"}?gads=connected`, 302);
  } catch (e) {
    console.error("oauth-callback error", e);
    return new Response(`Callback error: ${e}`, { status: 500 });
  }
});
