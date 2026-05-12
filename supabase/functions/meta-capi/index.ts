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
  opt_out?: boolean;
  data_processing_options?: string[];
  data_processing_options_country?: number;
  data_processing_options_state?: number;
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
      .select("id, identity_id, fbp, fbc, ip_hash, client_ip, user_agent, fbclid")
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
        const eventTimeMs = new Date(event.event_time).getTime();

        // Build user_data with hashed PII.
        // CRITICAL: client_ip_address must be the RAW IP (Meta hashes it server-side).
        const rawIp = (session as any)?.client_ip || (userData.client_ip_address as string) || undefined;

        // fbc: cookie real OR construir fb.1.<event_time_ms>.<fbclid>
        let fbc = session?.fbc || (userData.fbc as string) || undefined;
        if (!fbc) {
          const fbclid = (session as any)?.fbclid || (userData.fbclid as string) || (customData.fbclid as string);
          if (fbclid) fbc = `fb.1.${eventTimeMs}.${fbclid}`;
        }

        const userDataPayload: MetaEventData["user_data"] = {
          client_ip_address: rawIp,
          client_user_agent: session?.user_agent || (userData.client_user_agent as string) || undefined,
          fbc,
          fbp: session?.fbp || (userData.fbp as string) || undefined,
        };

        if (identity?.email_hash) userDataPayload.em = [identity.email_hash];
        if (identity?.phone_hash) userDataPayload.ph = [identity.phone_hash];
        // external_id: hashar (Meta aceita raw, mas hashing é privacy-safe e consistente)
        if (identity?.external_id) userDataPayload.external_id = [await hashSHA256(String(identity.external_id))];

        if (userData.email) userDataPayload.em = [await hashSHA256(userData.email as string)];
        if (userData.phone) userDataPayload.ph = [await hashSHA256(String(userData.phone).replace(/\D/g, ""))];
        if (userData.first_name) userDataPayload.fn = [await hashSHA256(userData.first_name as string)];
        if (userData.last_name) userDataPayload.ln = [await hashSHA256(userData.last_name as string)];
        if (userData.city) userDataPayload.ct = [await hashSHA256(String(userData.city).replace(/\s+/g, ""))];
        if (userData.state) userDataPayload.st = [await hashSHA256(String(userData.state).replace(/\s+/g, ""))];
        if (userData.zip) userDataPayload.zp = [await hashSHA256(String(userData.zip).replace(/\D/g, ""))];
        if (userData.country) userDataPayload.country = [await hashSHA256(String(userData.country).slice(0, 2).toLowerCase())];

        const metaEvent: MetaEventData = {
          event_name: event.event_name,
          event_time: Math.floor(eventTimeMs / 1000),
          // Prefer browser-supplied event_id (fbq eventID) for browser↔CAPI dedup.
          event_id: event.event_id || (event as any).browser_event_id || event.id,
          event_source_url: event.event_source_url || undefined,
          action_source: event.action_source || "website",
          user_data: userDataPayload,
        };

        // ── Custom data: e-commerce completo ──
        const cd: Record<string, unknown> = {};
        if (customData.value != null) cd.value = Number(customData.value);
        if (customData.currency) cd.currency = String(customData.currency).toUpperCase();
        if (customData.content_name) cd.content_name = String(customData.content_name);
        if (customData.content_category) cd.content_category = String(customData.content_category);
        if (customData.content_ids) cd.content_ids = customData.content_ids;
        if (customData.contents) {
          cd.contents = (customData.contents as any[]).map((i: any) => {
            const c: Record<string, unknown> = {
              id: String(i.id || i.product_id || "item"),
              quantity: Number(i.quantity || 1),
            };
            if (i.item_price != null || i.unit_price != null || i.price != null) {
              c.item_price = Number(i.item_price ?? i.unit_price ?? i.price);
            }
            if (i.title || i.product_name) c.title = String(i.title || i.product_name);
            return c;
          });
          cd.content_type = customData.content_type || "product";
        }
        if (customData.num_items != null) cd.num_items = Number(customData.num_items);
        if (customData.order_id) cd.order_id = String(customData.order_id);
        if (customData.search_string) cd.search_string = String(customData.search_string);
        if (customData.status) cd.status = String(customData.status);
        if (customData.predicted_ltv != null) cd.predicted_ltv = Number(customData.predicted_ltv);
        if (customData.subscription_id) cd.subscription_id = String(customData.subscription_id);
        if (Object.keys(cd).length > 0) metaEvent.custom_data = cd;

        // LGPD/CCPA opt-out & data processing options
        if ((customData as any).opt_out === true) (metaEvent as any).opt_out = true;
        if (Array.isArray((customData as any).data_processing_options)) {
          (metaEvent as any).data_processing_options = (customData as any).data_processing_options;
          if ((customData as any).data_processing_options_country != null)
            (metaEvent as any).data_processing_options_country = Number((customData as any).data_processing_options_country);
          if ((customData as any).data_processing_options_state != null)
            (metaEvent as any).data_processing_options_state = Number((customData as any).data_processing_options_state);
        }

        metaEvents.push(metaEvent);
      }

      const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${account.pixel_id}/events`;
      const requestBody: Record<string, unknown> = {
        data: metaEvents,
        access_token: account.access_token,
        partner_agent: "capitrack-1.0",
      };
      if (account.test_event_code) requestBody.test_event_code = account.test_event_code;

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
