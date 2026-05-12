// Validação: mostra quais conversion_action_id do Google Ads vão receber o
// evento `Lead` disparado por whatsapp-click, e checa via Google Ads API se
// o counting_type da Conversion Action está como MANY_PER_CLICK (= 1 conversão
// por clique, contagem por quantidade) ou ONE_PER_CLICK (apenas 1 por sessão).
//
// Auth: requer JWT do usuário logado e workspace_id no body. Não expõe
// credenciais nem refresh_token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
const GOOGLE_ADS_API_VERSION = "v21";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

interface CAInfo {
  id: string;
  name: string;
  status: string;
  category: string;
  type: string;
  counting_type: string; // ONE_PER_CLICK | MANY_PER_CLICK
  include_in_conversions_metric: boolean;
  primary_for_goal: boolean;
}

async function fetchConversionAction(
  customerId: string,
  loginCustomerId: string | null,
  developerToken: string,
  accessToken: string,
  conversionActionId: string,
): Promise<{ ok: true; data: CAInfo } | { ok: false; error: string }> {
  const query = `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.status,
      conversion_action.category,
      conversion_action.type,
      conversion_action.counting_type,
      conversion_action.include_in_conversions_metric,
      conversion_action.primary_for_goal
    FROM conversion_action
    WHERE conversion_action.id = ${conversionActionId}
    LIMIT 1
  `;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
    { method: "POST", headers, body: JSON.stringify({ query }) },
  );
  const txt = await res.text();
  if (!res.ok) return { ok: false, error: `Google Ads API ${res.status}: ${txt.slice(0, 300)}` };
  const parsed = JSON.parse(txt);
  const row = parsed?.results?.[0]?.conversionAction;
  if (!row) return { ok: false, error: "Conversion action não encontrada nessa conta" };
  return {
    ok: true,
    data: {
      id: String(row.id ?? conversionActionId),
      name: row.name ?? "",
      status: row.status ?? "UNKNOWN",
      category: row.category ?? "UNKNOWN",
      type: row.type ?? "UNKNOWN",
      counting_type: row.countingType ?? "UNKNOWN",
      include_in_conversions_metric: !!row.includeInConversionsMetric,
      primary_for_goal: !!row.primaryForGoal,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  try {
    // Auth: usuário logado
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return jsonRes({ error: "Missing auth" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return jsonRes({ error: "Invalid auth" }, 401);

    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body.workspace_id || "");
    if (!workspaceId) return jsonRes({ error: "workspace_id required" }, 400);

    const { data: isMember } = await admin.rpc("is_workspace_member" as never, {
      _user_id: userId, _workspace_id: workspaceId,
    } as never);
    if (!isMember) return jsonRes({ error: "forbidden" }, 403);

    // 1. Destinos Google Ads do workspace
    const { data: integrations } = await admin
      .from("integration_destinations")
      .select("id, destination_id, display_name, is_active, config_json, last_event_at, events_sent_count")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_ads");

    const { data: registry } = await admin
      .from("ad_conversion_destinations")
      .select("id, destination_id, display_name, account_id, conversion_action_id, event_name, status, send_enabled")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_ads");

    // 2. Credenciais default do workspace
    const { data: creds } = await admin
      .from("google_ads_credentials")
      .select("refresh_token, customer_id, login_customer_id, developer_token")
      .eq("workspace_id", workspaceId)
      .eq("status", "connected")
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Eventos Lead recentes do whatsapp-click (últimos 7 dias)
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { count: recentLeads } = await admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("event_name", "Lead")
      .eq("source", "whatsapp_click")
      .gte("created_at", since);

    const { count: totalClicks } = await admin
      .from("whatsapp_clicks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", since);

    // 4. Para cada destino, valida na Google Ads API o counting_type
    const destinations = [] as Array<Record<string, unknown>>;
    for (const dest of integrations || []) {
      const cfg = (dest.config_json || {}) as Record<string, unknown>;
      const conversionActionId = String(
        cfg.conversion_action_id ?? dest.destination_id ?? "",
      ).replace(/\D/g, "");
      const customerId = String(cfg.customer_id ?? "").replace(/\D/g, "");

      // Filtros de event_name no registry (se existir)
      const registryRow = (registry || []).find(
        (r) => r.account_id === customerId || r.destination_id === conversionActionId,
      );
      const acceptsLead =
        !registryRow || // sem registry = fallback aceita TODOS os eventos
        !registryRow.event_name ||
        registryRow.event_name === "Lead";

      let apiCheck: CAInfo | null = null;
      let apiError: string | null = null;
      if (creds?.refresh_token && customerId && conversionActionId) {
        const accessToken = await refreshAccessToken(creds.refresh_token);
        if (!accessToken) {
          apiError = "Falha ao renovar token OAuth do Google Ads";
        } else {
          const result = await fetchConversionAction(
            customerId,
            creds.login_customer_id ? String(creds.login_customer_id).replace(/\D/g, "") : null,
            creds.developer_token || GOOGLE_ADS_DEVELOPER_TOKEN,
            accessToken,
            conversionActionId,
          );
          if (result.ok) apiCheck = result.data;
          else apiError = result.error;
        }
      } else {
        apiError = !creds?.refresh_token
          ? "Sem credenciais Google Ads conectadas"
          : !customerId
          ? "customer_id ausente no destino"
          : "conversion_action_id ausente no destino";
      }

      const issues: string[] = [];
      if (!apiCheck && apiError) issues.push(apiError);
      if (apiCheck) {
        if (apiCheck.status !== "ENABLED") issues.push(`Conversion action está ${apiCheck.status} (não ENABLED)`);
        if (apiCheck.counting_type === "ONE_PER_CLICK") {
          issues.push("counting_type=ONE_PER_CLICK → conta apenas 1 por sessão. Para 1 conversão = 1 clique no WhatsApp, mude para MANY_PER_CLICK no Google Ads.");
        }
        if (!apiCheck.include_in_conversions_metric) {
          issues.push("Conversion action não está incluída na métrica 'Conversões' (include_in_conversions_metric=false). Sua campanha não vai otimizar por isso.");
        }
      }
      if (!acceptsLead) issues.push(`Registry filtra event_name='${registryRow?.event_name}' — Leads do WhatsApp NÃO chegam neste destino`);

      destinations.push({
        destination_id: conversionActionId || dest.destination_id,
        display_name: dest.display_name,
        is_active: dest.is_active,
        customer_id: customerId,
        conversion_action_id: conversionActionId,
        accepts_lead_event: acceptsLead,
        registry_event_filter: registryRow?.event_name ?? null,
        last_event_at: dest.last_event_at,
        events_sent_count: dest.events_sent_count,
        api_check: apiCheck,
        api_error: apiError,
        issues,
        ok: issues.length === 0,
      });
    }

    return jsonRes({
      ok: true,
      workspace_id: workspaceId,
      summary: {
        google_ads_destinations: destinations.length,
        whatsapp_clicks_7d: totalClicks ?? 0,
        lead_events_dispatched_7d: recentLeads ?? 0,
        match_rate_pct: totalClicks
          ? Math.round(((recentLeads ?? 0) / totalClicks) * 100)
          : null,
      },
      destinations,
    });
  } catch (err) {
    console.error("whatsapp-validate-google-ads", err);
    return jsonRes({ error: String((err as Error)?.message || err) }, 500);
  }
});
