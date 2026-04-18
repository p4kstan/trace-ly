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
    const payload = {
      event,
      destination,
      workspace_id: workspaceId,
      // Pass through for process-events compatibility
      items: [{
        workspace_id: workspaceId,
        event_id: event.id,
        provider,
        payload_json: event,
        attempt_count: 0,
        max_attempts: 5,
        destination: destination.id,
      }],
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    const latency = Date.now() - start;

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

    // Route event to each destination
    const results: RouteResult[] = [];
    const routePromises = destinations.map(async (dest) => {
      // Check if there's a mapping rule for this provider
      const providerRules = rules.filter(
        r => r.external_platform === dest.provider || r.provider === dest.provider
      );

      // If rules exist but none match this event, skip
      if (providerRules.length > 0) {
        const hasMatch = providerRules.some(
          r => r.internal_event_name === event.event_name || r.gateway_event === event.event_name
        );
        if (!hasMatch) {
          results.push({ provider: dest.provider, status: "skipped", latency_ms: 0 });
          return;
        }
      }

      // Map event name if needed
      const mappedRule = providerRules.find(
        r => r.internal_event_name === event.event_name || r.gateway_event === event.event_name
      );
      const mappedEvent = {
        ...event,
        mapped_event_name: mappedRule?.external_event_name || mappedRule?.marketing_event || event.event_name,
      };

      const result = await dispatchToProvider(dest.provider, mappedEvent, dest, workspace_id);
      results.push(result);
    });

    await Promise.all(routePromises);

    // Update event processing status
    const allDelivered = results.every(r => r.status === "delivered" || r.status === "skipped");
    const anyDelivered = results.some(r => r.status === "delivered");
    const newStatus = allDelivered ? "delivered" : anyDelivered ? "partial" : "failed";
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
