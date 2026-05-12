// Thin adapter: receives an `event_id` and enqueues one row per active
// destination into `event_queue`. The durable worker (`process-events`)
// owns ALL provider dispatch, dedupe-vs-registry and retry/backoff logic.
//
// Why thin? The previous implementation duplicated dispatch + dedup
// branches that already live in `process-events`, producing two
// concurrent delivery paths and inconsistent EMQ between identical
// events. After this refactor:
//   track  ──►  events row  ──►  event-router (enqueue only)
//                                    │
//                                    ▼
//                              event_queue  ◄── pg_cron (1m)
//                                    │
//                                    ▼
//                              process-events (single source of truth)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { installSafeConsole } from "../_shared/install-safe-console.ts";

installSafeConsole("event-router");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Behavioural events MUST NOT reach ad-platform CAPIs — they pollute the
// queue and trigger "no identifier" rejections. process-events also
// enforces this, but filtering at enqueue time keeps the queue clean.
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
const isCapiProvider = (p: string) => CAPI_PROVIDERS.has(p);
const isConversion = (n: string) => CONVERSION_EVENT_NAMES.has(n);

async function getActiveDestinations(workspaceId: string) {
  const [gwRes, idRes] = await Promise.all([
    supabase
      .from("gateway_integrations")
      .select("id, provider, name, public_config_json, settings_json")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    supabase
      .from("integration_destinations")
      .select("id, provider, display_name, destination_id, config_json, is_active")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
  ]);

  const fromGateway = (gwRes.data || []).map((d: any) => ({
    id: d.id,
    provider: d.provider,
    name: d.name,
    config_json: d.public_config_json || {},
    _source: "gateway_integrations",
  }));

  const fromDestinations = (idRes.data || []).map((d: any) => ({
    id: d.id,
    provider: d.provider,
    name: d.display_name,
    destination_id: d.destination_id,
    config_json: d.config_json || {},
    _source: "integration_destinations",
  }));

  // Dedupe by provider+id; new table wins over legacy.
  const byKey = new Map<string, any>();
  for (const d of fromGateway) byKey.set(`${d.provider}::${d.id}`, d);
  for (const d of fromDestinations) byKey.set(`${d.provider}::${d.destination_id || d.id}`, d);
  return Array.from(byKey.values());
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

function normalizePayload(event: any, session: any, identity: any) {
  const ud = event.user_data_json || {};
  const cd = event.custom_data_json || {};
  const sess = session || {};
  const ident = identity || {};

  return {
    event_name: event.event_name,
    event_id: event.event_id || event.id,
    browser_event_id: event.event_id || null,
    event_time: event.event_time,
    event_source_url: event.event_source_url,
    action_source: event.action_source || "website",
    customer: {
      email: ud.email || null,
      email_hash: ud.email_hash || ud.em || ident.email_hash || null,
      phone: ud.phone || null,
      phone_hash: ud.phone_hash || ud.ph || ident.phone_hash || null,
      external_id: ud.external_id || ident.external_id || null,
      first_name: ud.first_name || null,
      last_name: ud.last_name || null,
      city: ud.city || null,
      state: ud.state || null,
      country: ud.country || null,
      zip: ud.zip || null,
    },
    session: {
      session_id: event.session_id || sess.id || null,
      fbp: ud.fbp || sess.fbp || null,
      fbc: ud.fbc || sess.fbc || null,
      ga_client_id: sess.ga_client_id || ud.ga_client_id || cd.ga_client_id || null,
      client_id: sess.ga_client_id || ud.ga_client_id || cd.ga_client_id || null,
      gclid: cd.gclid || sess.gclid || null,
      gbraid: cd.gbraid || sess.gbraid || null,
      wbraid: cd.wbraid || sess.wbraid || null,
      fbclid: cd.fbclid || sess.fbclid || null,
      ttclid: cd.ttclid || sess.ttclid || null,
      msclkid: cd.msclkid || sess.msclkid || null,
      utm_source: cd.utm_source || sess.utm_source || null,
      utm_medium: cd.utm_medium || sess.utm_medium || null,
      utm_campaign: cd.utm_campaign || sess.utm_campaign || null,
      utm_content: cd.utm_content || sess.utm_content || null,
      utm_term: cd.utm_term || sess.utm_term || null,
      ip: sess.client_ip || ud.client_ip_address || null,
      ip_hash: sess.ip_hash || null,
      user_agent: sess.user_agent || ud.client_user_agent || null,
      landing_page: sess.landing_page || null,
      referrer: sess.referrer || null,
    },
    order: {
      external_order_id: cd.transaction_id || cd.order_id || event.event_id,
      total_value: cd.value != null ? Number(cd.value) : 0,
      currency: cd.currency || "BRL",
      items: cd.items || [],
    },
    custom_data: cd,
    user_data: ud,
    identity_id: event.identity_id || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { event_id, workspace_id } = body;

    if (!event_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "event_id and workspace_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", event_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (evErr || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [destinations, rules, sessRes, identRes] = await Promise.all([
      getActiveDestinations(workspace_id),
      getRoutingRules(workspace_id, event.event_name),
      event.session_id
        ? supabase.from("sessions")
          .select("id, ga_client_id, client_ip, ip_hash, user_agent, fbp, fbc, gclid, gbraid, wbraid, fbclid, ttclid, msclkid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, referrer")
          .eq("id", event.session_id).maybeSingle()
        : Promise.resolve({ data: null }),
      event.identity_id
        ? supabase.from("identities")
          .select("id, email_hash, phone_hash, external_id")
          .eq("id", event.identity_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (destinations.length === 0) {
      await supabase.from("events").update({ processing_status: "no_destinations" }).eq("id", event_id);
      return new Response(
        JSON.stringify({ status: "ok", message: "No active destinations", enqueued: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalized = normalizePayload(event, sessRes.data, identRes.data);
    const queueRows: any[] = [];
    const skipped: { provider: string; reason: string }[] = [];

    for (const dest of destinations) {
      // CAPI providers: only conversions.
      if (isCapiProvider(dest.provider) && !isConversion(event.event_name)) {
        skipped.push({ provider: dest.provider, reason: "non_conversion_event" });
        continue;
      }

      // Honour explicit routing rules when defined for this provider.
      const providerRules = rules.filter(
        (r: any) => r.external_platform === dest.provider || r.provider === dest.provider,
      );
      if (providerRules.length > 0) {
        const matched = providerRules.find(
          (r: any) => r.internal_event_name === event.event_name || r.gateway_event === event.event_name,
        );
        if (!matched) {
          skipped.push({ provider: dest.provider, reason: "no_matching_rule" });
          continue;
        }
        normalized.event_name = matched.external_event_name || matched.marketing_event || event.event_name;
      }

      queueRows.push({
        workspace_id,
        event_id: event.id,
        provider: dest.provider,
        destination: dest.id,
        payload_json: { ...normalized, destination: dest },
        status: "queued",
        attempt_count: 0,
        max_attempts: 8,
        next_retry_at: new Date().toISOString(),
      });
    }

    if (queueRows.length === 0) {
      await supabase.from("events").update({ processing_status: "skipped" }).eq("id", event_id);
      return new Response(
        JSON.stringify({ status: "ok", enqueued: 0, skipped }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: qErr } = await supabase
      .from("event_queue")
      .upsert(queueRows, {
        onConflict: "workspace_id,event_id,provider,destination",
        ignoreDuplicates: true,
      });

    if (qErr) {
      console.error("[event-router] event_queue upsert error:", qErr);
      await supabase.from("events").update({ processing_status: "failed" }).eq("id", event_id);
      return new Response(
        JSON.stringify({ error: "enqueue_failed", details: qErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("events").update({ processing_status: "queued" }).eq("id", event_id);
    console.log(`[event-router] enqueued=${queueRows.length} skipped=${skipped.length} event=${event.event_name}`);

    return new Response(
      JSON.stringify({
        status: "ok",
        event_id,
        enqueued: queueRows.length,
        skipped,
        providers: queueRows.map((r) => r.provider),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("EventRouter error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
