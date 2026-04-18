import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const appOrigin = "https://trace-ly.lovable.app";

    if (errorParam) {
      return Response.redirect(`${appOrigin}/ga4-analytics?ga4=error&reason=${encodeURIComponent(errorParam)}`, 302);
    }
    if (!code || !stateRaw) return new Response("Missing code/state", { status: 400 });

    let state: any;
    try { state = JSON.parse(atob(stateRaw)); } catch { return new Response("Bad state", { status: 400 }); }

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${supabaseUrl}/functions/v1/ga4-oauth-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("ga4 token exchange failed", tokenJson);
      return Response.redirect(`${appOrigin}/ga4-analytics?ga4=error&reason=token_exchange`, 302);
    }

    const { access_token, refresh_token, expires_in } = tokenJson;
    const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000).toISOString();

    // List GA4 accounts/properties via Admin API to auto-pick the first one
    const accountsRes = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const accountsJson = await accountsRes.json();
    const summary = accountsJson?.accountSummaries?.[0];
    const propSummary = summary?.propertySummaries?.[0];
    const propertyId = propSummary?.property?.replace("properties/", "") || "";
    const propertyName = propSummary?.displayName || "";
    const accountId = summary?.account?.replace("accounts/", "") || "";
    const accountName = summary?.displayName || "";

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    await service.from("ga4_credentials").upsert({
      workspace_id: state.workspace_id,
      property_id: propertyId || "pending",
      property_name: propertyName,
      account_id: accountId,
      account_name: accountName,
      access_token,
      refresh_token: refresh_token ?? null,
      token_expires_at: expiresAt,
      status: propertyId ? "connected" : "needs_property_selection",
      last_sync_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,property_id" });

    return Response.redirect(`${appOrigin}${state.return_url || "/ga4-analytics"}?ga4=connected`, 302);
  } catch (e) {
    console.error("ga4-oauth-callback error", e);
    return new Response(`Callback error: ${e}`, { status: 500 });
  }
});
