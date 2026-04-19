import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startTime = Date.now();
  const results: Record<string, unknown> = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Database connectivity & tables
  const requiredTables = [
    "workspaces", "workspace_members", "meta_pixels", "allowed_domains",
    "events", "sessions", "event_deliveries", "api_keys",
    "identities", "conversions", "attribution_touches",
    "subscription_plans", "subscriptions", "audit_logs",
  ];

  try {
    const dbStart = Date.now();
    const tableChecks: Record<string, { exists: boolean; row_count?: number }> = {};

    for (const table of requiredTables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true });
        tableChecks[table] = { exists: !error, row_count: count ?? 0 };
        if (error) errors.push(`Table ${table}: ${error.message}`);
      } catch {
        tableChecks[table] = { exists: false };
        errors.push(`Table ${table}: not accessible`);
      }
    }

    results.database = {
      status: errors.length === 0 ? "healthy" : "degraded",
      response_time_ms: Date.now() - dbStart,
      tables: tableChecks,
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    results.database = { status: "offline", error: String(e) };
    errors.push(`Database: ${e}`);
  }

  // 2. Tracking endpoint
  try {
    const trackStart = Date.now();
    const trackUrl = `${supabaseUrl}/functions/v1/track`;
    const trackResp = await fetch(trackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });
    results.tracking = {
      status: trackResp.status < 500 ? "online" : "offline",
      response_time_ms: Date.now() - trackStart,
      http_status: trackResp.status,
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    results.tracking = { status: "offline", error: String(e) };
    errors.push(`Tracking endpoint: ${e}`);
  }

  // 3. Recent events stats
  try {
    const { data: recentEvent } = await supabase
      .from("events")
      .select("id, event_name, created_at, processing_status")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: pendingCount } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("processing_status", "pending");

    const { count: failedDeliveries } = await supabase
      .from("event_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed");

    const { data: lastDelivery } = await supabase
      .from("event_deliveries")
      .select("id, provider, status, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    results.event_processing = {
      status: "online",
      last_event_received: recentEvent?.created_at ?? null,
      last_event_name: recentEvent?.event_name ?? null,
      pending_events: pendingCount ?? 0,
      failed_deliveries: failedDeliveries ?? 0,
      last_delivery: lastDelivery,
      checked_at: new Date().toISOString(),
    };

    if ((pendingCount ?? 0) > 100) warnings.push(`${pendingCount} pending events in queue`);
    if ((failedDeliveries ?? 0) > 0) warnings.push(`${failedDeliveries} failed deliveries`);
  } catch (e) {
    results.event_processing = { status: "error", error: String(e) };
  }

  // 4. Meta Pixels status
  try {
    const { data: pixels } = await supabase
      .from("meta_pixels")
      .select("id, name, pixel_id, is_active, access_token_encrypted, test_event_code");

    const pixelStatuses = (pixels ?? []).map((p) => ({
      name: p.name,
      pixel_id: p.pixel_id,
      is_active: p.is_active,
      has_access_token: !!p.access_token_encrypted,
      has_test_code: !!p.test_event_code,
    }));

    results.meta_api = {
      status: (pixels ?? []).length > 0 ? "configured" : "not_configured",
      pixels: pixelStatuses,
      checked_at: new Date().toISOString(),
    };

    if ((pixels ?? []).length === 0) warnings.push("No Meta Pixels configured");
    for (const p of pixels ?? []) {
      if (!p.access_token_encrypted) warnings.push(`Pixel ${p.name}: missing access token`);
    }
  } catch (e) {
    results.meta_api = { status: "error", error: String(e) };
  }

  // 5. API Keys
  try {
    const { data: keys } = await supabase
      .from("api_keys")
      .select("id, name, status, last_used_at");

    results.api_keys = {
      status: (keys ?? []).length > 0 ? "configured" : "not_configured",
      total: (keys ?? []).length,
      active: (keys ?? []).filter((k) => k.status === "active").length,
      checked_at: new Date().toISOString(),
    };

    if ((keys ?? []).length === 0) warnings.push("No API keys configured");
  } catch (e) {
    results.api_keys = { status: "error", error: String(e) };
  }

  // 6. Workspaces
  try {
    const { count } = await supabase
      .from("workspaces")
      .select("*", { count: "exact", head: true });

    results.workspaces = {
      status: (count ?? 0) > 0 ? "configured" : "not_configured",
      total: count ?? 0,
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    results.workspaces = { status: "error", error: String(e) };
  }

  // 7. SDK check
  results.sdk = {
    status: "info",
    endpoint: `${supabaseUrl}/functions/v1/track`,
    sdk_url: "/sdk.js",
    checked_at: new Date().toISOString(),
  };

  // 8. Security
  try {
    const { data: domains } = await supabase
      .from("allowed_domains")
      .select("id, domain");

    const domainCount = (domains ?? []).length;
    results.security = {
      status: domainCount > 0 ? "configured" : "not_configured",
      domain_validation: domainCount > 0 ? "configured" : "not_configured",
      allowed_domains: (domains ?? []).map((d) => d.domain),
      rls_enabled: true,
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    results.security = { status: "error", error: String(e) };
  }

  // 9. Integrations
  const metaStatus = results.meta_api ? (results.meta_api as Record<string, unknown>).status as string : "unknown";
  let gatewaysActive = 0;
  try {
    const { count } = await supabase
      .from("gateway_integrations")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");
    gatewaysActive = count ?? 0;
  } catch { /* ignore */ }

  const anyConfigured = metaStatus === "configured" || gatewaysActive > 0;
  results.integrations = {
    status: anyConfigured ? "configured" : "not_configured",
    meta: metaStatus,
    gateways_active: gatewaysActive,
    google_ads: "not_configured",
    tiktok: "not_configured",
    shopify: "not_configured",
    woocommerce: "not_configured",
    checked_at: new Date().toISOString(),
  };

  // Summary
  const overallStatus = errors.length === 0 ? (warnings.length === 0 ? "healthy" : "warnings") : "degraded";

  const response = {
    status: overallStatus,
    total_time_ms: Date.now() - startTime,
    checked_at: new Date().toISOString(),
    services: results,
    errors,
    warnings,
    environment: {
      region: Deno.env.get("DENO_REGION") ?? "unknown",
      runtime: "deno",
    },
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
