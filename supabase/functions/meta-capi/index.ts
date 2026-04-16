import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.103.0/cors";
import { selectAccounts, extractTag } from "../_shared/account-router.ts";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = "https://graph.facebook.com";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Unified account shape for both legacy meta_pixels and new meta_ad_accounts
interface MetaAccount {
  id: string;
  pixel_id: string;
  access_token: string;
  test_event_code?: string | null;
  routing_mode?: string | null;
  routing_domains?: string[] | null;
  routing_tags?: string[] | null;
  is_default?: boolean | null;
  source: "pixel" | "ad_account";
}

// Standard Meta events mapping
const STANDARD_EVENTS = [
  "PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist",
  "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead",
  "CompleteRegistration", "Contact", "CustomizeProduct", "Donate",
  "FindLocation", "Schedule", "StartTrial", "SubmitApplication", "Subscribe",
];

interface MetaEventData {
  event_name: string;
  event_time: number;
  event_id?: string;
  event_source_url?: string;
  action_source: string;
  user_data: {
    em?: string[];
    ph?: string[];
    fn?: string[];
    ln?: string[];
    ct?: string[];
    st?: string[];
    zp?: string[];
    country?: string[];
    external_id?: string[];
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  };
  custom_data?: {
    value?: number;
    currency?: string;
    content_name?: string;
    content_category?: string;
    content_ids?: string[];
    content_type?: string;
    contents?: Array<{ id: string; quantity: number }>;
    num_items?: number;
    order_id?: string;
    search_string?: string;
    status?: string;
    [key: string]: unknown;
  };
}

async function hashSHA256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { event_ids, workspace_id } = body;

    if (!event_ids || !Array.isArray(event_ids) || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "event_ids (array) and workspace_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load all Meta destinations: legacy meta_pixels + new meta_ad_accounts
    const [{ data: legacyPixels }, { data: adAccounts }] = await Promise.all([
      supabase
        .from("meta_pixels")
        .select("id, pixel_id, access_token_encrypted, test_event_code")
        .eq("workspace_id", workspace_id)
        .eq("is_active", true),
      supabase
        .from("meta_ad_accounts")
        .select("id, pixel_id, access_token, routing_mode, routing_domains, routing_tags, is_default")
        .eq("workspace_id", workspace_id)
        .eq("status", "connected"),
    ]);

    const accounts: MetaAccount[] = [
      ...(legacyPixels || []).map((p: any): MetaAccount => ({
        id: p.id,
        pixel_id: p.pixel_id,
        access_token: p.access_token_encrypted,
        test_event_code: p.test_event_code,
        routing_mode: "all",
        is_default: true,
        source: "pixel",
      })),
      ...((adAccounts || []) as any[])
        .filter((a) => a.pixel_id && a.access_token)
        .map((a): MetaAccount => ({
          id: a.id,
          pixel_id: a.pixel_id,
          access_token: a.access_token,
          routing_mode: a.routing_mode,
          routing_domains: a.routing_domains,
          routing_tags: a.routing_tags,
          is_default: a.is_default,
          source: "ad_account",
        })),
    ];

    if (accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active Meta destinations found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get events to deliver
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select(`
        id, event_name, event_id, event_time, event_source_url, action_source,
        page_path, user_data_json, custom_data_json, identity_id
      `)
      .in("id", event_ids)
      .eq("workspace_id", workspace_id);

    if (eventsError || !events?.length) {
      return new Response(
        JSON.stringify({ error: "No events found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get associated sessions for fbp/fbc
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, identity_id, fbp, fbc, ip_hash, user_agent")
      .in("identity_id", events.map(e => e.identity_id).filter(Boolean));

    const sessionMap = new Map(sessions?.map(s => [s.identity_id, s]) || []);

    // Get identities for user data
    const identityIds = events.map(e => e.identity_id).filter(Boolean);
    const { data: identities } = await supabase
      .from("identities")
      .select("id, email_hash, phone_hash, external_id")
      .in("id", identityIds);

    const identityMap = new Map(identities?.map(i => [i.id, i]) || []);

    const results: Array<{
      event_id: string;
      pixel_id: string;
      status: string;
      response?: unknown;
      error?: string;
    }> = [];

    // Send events to each account, applying per-event routing
    for (const account of accounts) {
      if (!account.access_token) continue;

      // Filter events that should be routed to this account (domain/tag/all)
      const eventsForAccount = events.filter((event) => {
        const ctx = {
          url: event.event_source_url,
          tag: extractTag(event as any),
        };
        return selectAccounts([account], ctx).length > 0;
      });

      if (eventsForAccount.length === 0) {
        console.log(`No events routed to ${account.source}:${account.pixel_id}`);
        continue;
      }

      // Build Meta event data array
      const metaEvents: MetaEventData[] = [];

      for (const event of eventsForAccount) {
        const identity = event.identity_id ? identityMap.get(event.identity_id) : null;
        const session = event.identity_id ? sessionMap.get(event.identity_id) : null;
        const userData = event.user_data_json || {};
        const customData = event.custom_data_json || {};

        // Build user_data with hashed PII
        const userDataPayload: MetaEventData["user_data"] = {
          client_ip_address: session?.ip_hash || undefined,
          client_user_agent: session?.user_agent || undefined,
          fbc: session?.fbc || undefined,
          fbp: session?.fbp || undefined,
        };

        if (identity?.email_hash) userDataPayload.em = [identity.email_hash];
        if (identity?.phone_hash) userDataPayload.ph = [identity.phone_hash];
        if (identity?.external_id) userDataPayload.external_id = [identity.external_id];

        if (userData.email) userDataPayload.em = [await hashSHA256(userData.email as string)];
        if (userData.phone) userDataPayload.ph = [await hashSHA256(userData.phone as string)];
        if (userData.first_name) userDataPayload.fn = [await hashSHA256(userData.first_name as string)];
        if (userData.last_name) userDataPayload.ln = [await hashSHA256(userData.last_name as string)];
        if (userData.city) userDataPayload.ct = [await hashSHA256(userData.city as string)];
        if (userData.state) userDataPayload.st = [await hashSHA256(userData.state as string)];
        if (userData.zip) userDataPayload.zp = [await hashSHA256(userData.zip as string)];
        if (userData.country) userDataPayload.country = [await hashSHA256(userData.country as string)];

        const metaEvent: MetaEventData = {
          event_name: event.event_name,
          event_time: Math.floor(new Date(event.event_time).getTime() / 1000),
          event_id: event.event_id || event.id,
          event_source_url: event.event_source_url || undefined,
          action_source: event.action_source || "website",
          user_data: userDataPayload,
        };

        if (customData.value || customData.currency || Object.keys(customData).length > 0) {
          metaEvent.custom_data = {};
          if (customData.value) metaEvent.custom_data.value = Number(customData.value);
          if (customData.currency) metaEvent.custom_data.currency = String(customData.currency);
          if (customData.content_name) metaEvent.custom_data.content_name = String(customData.content_name);
          if (customData.content_category) metaEvent.custom_data.content_category = String(customData.content_category);
          if (customData.content_ids) metaEvent.custom_data.content_ids = customData.content_ids;
          if (customData.content_type) metaEvent.custom_data.content_type = String(customData.content_type);
          if (customData.num_items) metaEvent.custom_data.num_items = Number(customData.num_items);
          if (customData.order_id) metaEvent.custom_data.order_id = String(customData.order_id);
        }

        metaEvents.push(metaEvent);
      }

      const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${account.pixel_id}/events`;
      const requestBody: Record<string, unknown> = {
        data: metaEvents,
        access_token: account.access_token,
      };
      if (account.test_event_code) requestBody.test_event_code = account.test_event_code;

      console.log(`Sending ${metaEvents.length} events to Meta ${account.source} pixel ${account.pixel_id}`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();

      // Update last_sync / last_error on the source row
      if (account.source === "ad_account") {
        await supabase
          .from("meta_ad_accounts")
          .update({
            last_sync_at: new Date().toISOString(),
            last_error: response.ok ? null : JSON.stringify(responseData).slice(0, 500),
          })
          .eq("id", account.id);
      }

      for (const event of eventsForAccount) {
        const deliveryStatus = response.ok ? "delivered" : "failed";

        await supabase.from("event_deliveries").insert({
          event_id: event.id,
          workspace_id,
          provider: "meta",
          destination: account.pixel_id,
          status: deliveryStatus,
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
          request_json: { pixel_id: account.pixel_id, event_count: metaEvents.length, source: account.source },
          response_json: responseData,
          error_message: response.ok ? null : JSON.stringify(responseData),
        });

        if (response.ok) {
          await supabase.from("events").update({ processing_status: "delivered" }).eq("id", event.id);
        }

        results.push({
          event_id: event.id,
          pixel_id: account.pixel_id,
          status: deliveryStatus,
          response: responseData,
          error: response.ok ? undefined : responseData?.error?.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        delivered: results.filter(r => r.status === "delivered").length,
        failed: results.filter(r => r.status === "failed").length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Meta CAPI error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
