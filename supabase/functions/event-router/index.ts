import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Provider edge function mapping
const PROVIDER_FUNCTIONS: Record<string, string> = {
  meta: "meta-capi",
  ga4: "ga4-events",
  google_ads: "google-ads-capi",
  tiktok: "tiktok-events",
};

// Whitelist: only conversion events should reach ad-platform CAPIs.
// Behavioral signals (MouseActivity/Scroll/Dwell/PageView) MUST NOT be dispatched
// to google_ads/meta — they pollute the queue and trigger "no identifier" rejections
// that show up in Google's diagnostics as failed imports.
const CONVERSION_EVENT_NAMES = new Set([
  "Purchase", "purchase",
  "Subscribe", "subscribe",
  "StartTrial", "start_trial",
  "CompleteRegistration", "complete_registration",
  "Lead", "lead",
  "order_paid", "order_approved",
  "payment_paid", "payment_authorized",
  "pix_paid", "boleto_paid",
  "subscription_started", "subscription_renewed",
]);
const CAPI_PROVIDERS = new Set(["google_ads", "meta", "meta_capi", "tiktok"]);
function isConversionOnlyProvider(provider: string): boolean {
  return CAPI_PROVIDERS.has(provider);
}
function isConversionEvent(eventName: string): boolean {
  return CONVERSION_EVENT_NAMES.has(eventName);
}

interface RouteResult {
  provider: string;
  status: "delivered" | "failed" | "skipped";
  latency_ms: number;
  error?: string;
}

async function getActiveDestinations(workspaceId: string) {
  // Lê de DUAS tabelas: gateway_integrations (legado) + integration_destinations (novo)
  // e normaliza num formato único pro dispatcher
  const [gwRes, idRes] = await Promise.all([
    supabase
      .from("gateway_integrations")
      .select("id, provider, name, status, credentials_encrypted, public_config_json, settings_json")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    supabase
      .from("integration_destinations")
      .select("id, provider, display_name, destination_id, access_token_encrypted, config_json, is_active")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
  ]);

  const fromGateway = (gwRes.data || []).map((d: any) => ({
    id: d.id,
    provider: d.provider,
    name: d.name,
    // gateway_integrations legacy fields kept for downstream compat
    credentials_encrypted: d.credentials_encrypted,
    public_config_json: d.public_config_json,
    settings_json: d.settings_json,
    config_json: d.public_config_json || {},
    _source: "gateway_integrations",
  }));

  const fromDestinations = (idRes.data || []).map((d: any) => ({
    id: d.id,
    provider: d.provider,
    name: d.display_name,
    destination_id: d.destination_id,
    access_token_encrypted: d.access_token_encrypted,
    config_json: d.config_json || {},
    _source: "integration_destinations",
  }));

  // Dedupe por provider — prioriza integration_destinations (mais novo) sobre gateway_integrations
  const byProvider = new Map<string, any>();
  for (const d of fromGateway) byProvider.set(d.provider, d);
  for (const d of fromDestinations) byProvider.set(d.provider, d); // overwrite

  return Array.from(byProvider.values());
}

async function getRoutingRules(workspaceId: string, eventName: string) {
  const { data } = await supabase
    .from("event_mappings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true)
    .or(`internal_event_name.eq.${eventName},gateway_event.eq.${eventName},internal_event_name.is.null`);
  return data || [];
}

/**
 * Normaliza um evento da tabela `events` no formato `payload_json` esperado
 * pelos dispatchers downstream (google-ads-capi, ga4-events, meta-capi, tiktok-events),
 * que originalmente foram escritos pra consumir items vindos do gateway-webhook.
 */
function normalizeEventToQueuePayload(event: any) {
  const ud = event.user_data_json || {};
  const cd = event.custom_data_json || {};

  return {
    event_name: event.event_name,
    event_id: event.event_id || event.id,
    event_time: event.event_time,
    event_source_url: event.event_source_url,
    customer: {
      email: ud.email || null,
      email_hash: ud.email_hash || null,
      phone: ud.phone || null,
      phone_hash: ud.phone_hash || null,
      external_id: ud.external_id || null,
      first_name: ud.first_name || null,
      last_name: ud.last_name || null,
      city: ud.city || null,
      state: ud.state || null,
      country: ud.country || null,
      zip: ud.zip || null,
    },
    session: {
      fbp: ud.fbp || null,
      fbc: ud.fbc || null,
      ga_client_id: ud.ga_client_id || null,
      gclid: cd.gclid || null,
      gbraid: cd.gbraid || null,
      wbraid: cd.wbraid || null,
      fbclid: cd.fbclid || null,
      ttclid: cd.ttclid || null,
      msclkid: cd.msclkid || null,
      utm_source: cd.utm_source || null,
      utm_medium: cd.utm_medium || null,
      utm_campaign: cd.utm_campaign || null,
      utm_content: cd.utm_content || null,
      utm_term: cd.utm_term || null,
      ip: ud.client_ip_address || null,
      user_agent: ud.client_user_agent || null,
    },
    order: {
      external_order_id: cd.transaction_id || cd.order_id || event.event_id,
      total_value: cd.value != null ? Number(cd.value) : 0,
      currency: cd.currency || "BRL",
      items: cd.items || [],
    },
    custom_data: cd,
    user_data: ud,
  };
}

async function dispatchToProvider(
  provider: string,
  event: any,
  destination: any,
  workspaceId: string,
): Promise<RouteResult> {
  const start = Date.now();
  const fnName = PROVIDER_FUNCTIONS[provider];
  
  if (!fnName) {
    return { provider, status: "skipped", latency_ms: 0, error: `No handler for ${provider}` };
  }

  try {
    const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
    const normalizedPayload = normalizeEventToQueuePayload(event);

    const payload = {
      event,
      destination,
      workspace_id: workspaceId,
      // Pass through for process-events compatibility (queue item format)
      items: [{
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        event_id: event.id,
        provider,
        payload_json: normalizedPayload,
        attempt_count: 0,
        max_attempts: 5,
        destination: destination.id,
        created_at: event.event_time || new Date().toISOString(),
      }],
    };

    console.log(`[dispatch] provider=${provider} fn=${fnName} dest_id=${destination.id} dest_provider=${destination.provider}`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json().catch(() => ({ raw: "non-json response" }));
    const latency = Date.now() - start;

    console.log(`[dispatch:result] provider=${provider} status=${res.status} ok=${res.ok} body=${JSON.stringify(result).slice(0,300)}`);

    // Log to integration_logs
    await supabase.from("integration_logs").insert({
      workspace_id: workspaceId,
      provider,
      destination_id: destination.id,
      event_id: event.id,
      event_name: event.event_name,
      request_json: { fn: fnName, event_name: event.event_name },
      response_json: result,
      status: res.ok ? "delivered" : "failed",
      status_code: res.status,
      error_message: res.ok ? null : JSON.stringify(result),
      latency_ms: latency,
    });

    return {
      provider,
      status: res.ok ? "delivered" : "failed",
      latency_ms: latency,
      error: res.ok ? undefined : JSON.stringify(result),
    };
  } catch (err) {
    const latency = Date.now() - start;
    await supabase.from("integration_logs").insert({
      workspace_id: workspaceId,
      provider,
      destination_id: destination.id,
      event_id: event.id,
      event_name: event.event_name,
      status: "failed",
      error_message: String(err),
      latency_ms: latency,
    });
    return { provider, status: "failed", latency_ms: latency, error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { event_id, workspace_id } = body;

    if (!event_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "event_id and workspace_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the event
    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", event_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (evErr || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active destinations and routing rules in parallel
    const [destinations, rules] = await Promise.all([
      getActiveDestinations(workspace_id),
      getRoutingRules(workspace_id, event.event_name),
    ]);

    console.log(`[event-router] event=${event.event_name} dests=${destinations.length} providers=${destinations.map((d:any)=>d.provider).join(",")}`);

    if (destinations.length === 0) {
      // Update event status
      await supabase.from("events").update({ processing_status: "no_destinations" }).eq("id", event_id);
      return new Response(
        JSON.stringify({ status: "ok", message: "No active destinations", routes: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // P0: High-value conversion events go to event_queue (durable + exponential retry)
    // instead of fire-and-forget fetch. Guarantees delivery even on Google/Meta 429/5xx.
    const CONVERSION_EVENTS = new Set([
      "Purchase", "purchase",
      "Subscribe", "subscribe",
      "StartTrial", "start_trial",
      "CompleteRegistration", "complete_registration",
      "Lead", "lead",
    ]);
    const isConversion = CONVERSION_EVENTS.has(event.event_name);
    const cdValue = Number((event.custom_data_json as any)?.value || 0);
    const isHighValue = isConversion && cdValue > 0;
    console.log(`[event-router] priority=${isHighValue ? "high" : "normal"} event=${event.event_name} value=${cdValue}`);

    const results: RouteResult[] = [];
    const queueRows: any[] = [];
    const normalizedPayload = normalizeEventToQueuePayload(event);

    // ── DEDUP RULE (Purchase/Lead): same order_id + event_name within 24h
    // is recorded in `duplicate_detections`. If the SAME source already sent
    // it (e.g. webhook reentregue), we skip the dispatch entirely. If a
    // DIFFERENT source already sent it (pixel + CAPI), we still dispatch
    // (Google/Meta will dedupe on their side via order_id) but log as
    // detected — visible in the /duplicates page.
    const cd = (event.custom_data_json as any) || {};
    const dedupOrderId = String(
      cd.transaction_id || cd.order_id ||
      normalizedPayload.order?.external_order_id || ""
    ).trim();
    const dedupValue = Number(cd.value || normalizedPayload.order?.total_value || 0);
    const dedupCurrency = String(cd.currency || normalizedPayload.order?.currency || "BRL");
    const sourceLabel = `capi_dispatch:${event.source || "track"}`;

    let duplicateInfo: { is_duplicate: boolean; previous_sources?: string[] } = { is_duplicate: false };
    if (isConversion && dedupOrderId) {
      const { data: dupRes, error: dupErr } = await supabase.rpc("detect_duplicate_conversion", {
        _workspace_id: workspace_id,
        _order_id: dedupOrderId,
        _event_name: event.event_name,
        _source: sourceLabel,
        _event_id: event.event_id || event.id,
        _value: dedupValue,
        _currency: dedupCurrency,
        _window_hours: 24,
      });
      if (dupErr) {
        console.warn("[event-router] dedup rpc error:", dupErr.message);
      } else if (dupRes && (dupRes as any).is_duplicate) {
        duplicateInfo = dupRes as any;
        console.warn(`[event-router] DUPLICATE detected order_id=${dedupOrderId} event=${event.event_name} prev_sources=${JSON.stringify((dupRes as any).previous_sources)}`);
      }
    }

    const routePromises = destinations.map(async (dest) => {
      // P0 Filter: behavioral events MUST NOT reach ad-platform CAPIs.
      if (isConversionOnlyProvider(dest.provider) && !isConversionEvent(event.event_name)) {
        console.log(`[event-router] skip provider=${dest.provider} reason=non_conversion_event event=${event.event_name}`);
        results.push({ provider: dest.provider, status: "skipped", latency_ms: 0 });
        return;
      }

      // Block re-dispatch if the SAME source (webhook re-delivery) tried
      // to re-send the exact same order_id+event_name in the last 24h.
      // Different sources (pixel + capi) are allowed through — Google/Meta
      // dedupe via order_id on their side.
      if (
        duplicateInfo.is_duplicate &&
        Array.isArray(duplicateInfo.previous_sources) &&
        duplicateInfo.previous_sources.includes(sourceLabel)
      ) {
        console.warn(`[event-router] BLOCKED duplicate dispatch provider=${dest.provider} order_id=${dedupOrderId}`);
        results.push({ provider: dest.provider, status: "skipped", latency_ms: 0, error: "duplicate_same_source_24h" });
        return;
      }

      const providerRules = rules.filter(
        r => r.external_platform === dest.provider || r.provider === dest.provider
      );

      if (providerRules.length > 0) {
        const hasMatch = providerRules.some(
          r => r.internal_event_name === event.event_name || r.gateway_event === event.event_name
        );
        if (!hasMatch) {
          results.push({ provider: dest.provider, status: "skipped", latency_ms: 0 });
          return;
        }
      }

      const mappedRule = providerRules.find(
        r => r.internal_event_name === event.event_name || r.gateway_event === event.event_name
      );
      const mappedEvent = {
        ...event,
        mapped_event_name: mappedRule?.external_event_name || mappedRule?.marketing_event || event.event_name,
      };

      // High-value conversions: enqueue for durable delivery + exponential retry
      // handled by `process-events` worker.
      if (isHighValue) {
        queueRows.push({
          workspace_id: workspace_id,
          event_id: event.id,
          provider: dest.provider,
          destination: dest.id,
          payload_json: { ...normalizedPayload, mapped_event_name: mappedEvent.mapped_event_name, destination: dest },
          status: "queued",
          attempt_count: 0,
          max_attempts: 8,
          next_retry_at: new Date().toISOString(),
        });
        results.push({ provider: dest.provider, status: "delivered", latency_ms: 0 });
        return;
      }

      const result = await dispatchToProvider(dest.provider, mappedEvent, dest, workspace_id);
      results.push(result);
    });

    await Promise.all(routePromises);

    if (queueRows.length > 0) {
      // P0: upsert com ignoreDuplicates evita inserir 2x quando webhook é reentregue
      // pelo gateway. Unique index parcial em (workspace_id, event_id, provider) garante a dedup.
      const { error: qErr } = await supabase
        .from("event_queue")
        .upsert(queueRows, {
          onConflict: "workspace_id,event_id,provider",
          ignoreDuplicates: true,
        });
      if (qErr) {
        console.error("[event-router] event_queue upsert error, falling back to direct dispatch:", qErr);
        for (const dest of destinations) {
          await dispatchToProvider(dest.provider, event, dest, workspace_id).catch((e) =>
            console.error("fallback dispatch error", e)
          );
        }
      } else {
        console.log(`[event-router] enqueued ${queueRows.length} high-value conversion deliveries`);
      }
    }

    const allDelivered = results.every(r => r.status === "delivered" || r.status === "skipped");
    const anyDelivered = results.some(r => r.status === "delivered");
    const newStatus = isHighValue ? "queued" : (allDelivered ? "delivered" : anyDelivered ? "partial" : "failed");
    await supabase.from("events").update({ processing_status: newStatus }).eq("id", event_id);

    return new Response(
      JSON.stringify({
        status: "ok",
        event_id,
        routes: results,
        processing_status: newStatus,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("EventRouter error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
