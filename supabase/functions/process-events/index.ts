import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = "https://graph.facebook.com";

// ── SHA-256 helper ──
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Exponential backoff: 30s, 2m, 8m, 30m, 2h ──
function nextRetryDelay(attempt: number): number {
  const baseMs = 30_000; // 30 seconds
  return Math.min(baseMs * Math.pow(4, attempt), 2 * 60 * 60 * 1000); // cap at 2h
}

// ── Build Meta CAPI payload from queue item ──
async function buildMetaPayload(queueItem: any) {
  const p = queueItem.payload_json;
  const customer = p.customer || {};
  const session = p.session || {};
  const order = p.order || {};

  const userData: Record<string, unknown> = {};
  if (customer.email) userData.em = [await sha256(customer.email.toLowerCase().trim())];
  if (customer.phone) userData.ph = [await sha256(customer.phone.replace(/\D/g, ""))];
  if (customer.name) {
    const parts = customer.name.trim().split(/\s+/);
    userData.fn = [await sha256(parts[0].toLowerCase())];
    if (parts.length > 1) userData.ln = [await sha256(parts[parts.length - 1].toLowerCase())];
  }
  if (p.identity_id) userData.external_id = [p.identity_id];
  if (session.fbp) userData.fbp = session.fbp;
  if (session.fbc) userData.fbc = session.fbc;
  if (session.ip_hash) userData.client_ip_address = session.ip_hash;
  if (session.user_agent) userData.client_user_agent = session.user_agent;

  return {
    event_name: p.marketing_event,
    event_time: Math.floor(Date.now() / 1000),
    event_id: queueItem.event_id || crypto.randomUUID(),
    action_source: "website",
    event_source_url: session.landing_page || undefined,
    user_data: userData,
    custom_data: {
      value: order.total_value,
      currency: order.currency,
      order_id: order.external_order_id,
      content_type: "product",
      num_items: order.items?.length || 1,
      contents: order.items?.map((i: any) => ({ id: i.product_id || i.product_name || "item", quantity: i.quantity })),
      content_ids: order.items?.map((i: any) => String(i.product_id || i.product_name)),
    },
  };
}

// ── Send single event to Meta ──
async function sendToMeta(pixelId: string, accessToken: string, testEventCode: string | null, metaEvent: any): Promise<{ ok: boolean; response: any }> {
  const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${pixelId}/events`;
  const body: Record<string, unknown> = { data: [metaEvent], access_token: accessToken };
  if (testEventCode) body.test_event_code = testEventCode;

  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  return { ok: res.ok, response: data };
}

/**
 * Process queued events with exponential backoff retry.
 * 
 * POST /process-events
 * Body: { workspace_id?: string, limit?: number }
 * 
 * If workspace_id is omitted, processes all queued events globally.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { workspace_id, limit = 50 } = body;

    // Fetch queued items ready for processing
    let query = supabase.from("event_queue")
      .select("*")
      .in("status", ["queued", "retry"])
      .lte("next_retry_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);

    if (workspace_id) query = query.eq("workspace_id", workspace_id);

    const { data: queueItems, error: fetchErr } = await query;

    if (fetchErr || !queueItems?.length) {
      return new Response(JSON.stringify({ status: "ok", message: "No items to process", count: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const item of queueItems) {
      // Mark as processing
      await supabase.from("event_queue").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", item.id);

      try {
        // Get pixel credentials
        const { data: pixel } = await supabase.from("meta_pixels")
          .select("pixel_id, access_token_encrypted, test_event_code")
          .eq("pixel_id", item.destination)
          .eq("workspace_id", item.workspace_id)
          .eq("is_active", true)
          .single();

        if (!pixel?.access_token_encrypted) {
          // No valid pixel — dead letter
          await supabase.from("event_queue").update({
            status: "dead_letter", last_error: "Pixel not found or no access token",
            attempt_count: item.attempt_count + 1, updated_at: new Date().toISOString(),
          }).eq("id", item.id);

          await supabase.from("dead_letter_events").insert({
            workspace_id: item.workspace_id, source_type: "event_queue", source_id: item.id,
            provider: "meta", payload_json: item.payload_json,
            error_message: "Pixel not found or inactive", retry_count: item.attempt_count + 1,
          });
          deadLettered++;
          continue;
        }

        // Build and send
        const metaEvent = await buildMetaPayload(item);
        const result = await sendToMeta(pixel.pixel_id, pixel.access_token_encrypted, pixel.test_event_code, metaEvent);

        // Log delivery
        await supabase.from("event_deliveries").insert({
          event_id: item.event_id || crypto.randomUUID(),
          workspace_id: item.workspace_id, provider: "meta", destination: pixel.pixel_id,
          status: result.ok ? "delivered" : "failed",
          attempt_count: item.attempt_count + 1, last_attempt_at: new Date().toISOString(),
          request_json: { event_name: metaEvent.event_name, pixel_id: pixel.pixel_id },
          response_json: result.response,
          error_message: result.ok ? null : JSON.stringify(result.response),
        });

        if (result.ok) {
          // Success — mark delivered
          await supabase.from("event_queue").update({
            status: "delivered", attempt_count: item.attempt_count + 1, updated_at: new Date().toISOString(),
          }).eq("id", item.id);

          // Update event processing status
          if (item.event_id) {
            await supabase.from("events").update({ processing_status: "delivered" }).eq("id", item.event_id);
          }
          delivered++;
        } else {
          // Failed — retry or dead letter
          const newAttempt = item.attempt_count + 1;
          if (newAttempt >= item.max_attempts) {
            // Exhausted retries — dead letter
            await supabase.from("event_queue").update({
              status: "dead_letter", attempt_count: newAttempt,
              last_error: JSON.stringify(result.response), updated_at: new Date().toISOString(),
            }).eq("id", item.id);

            await supabase.from("dead_letter_events").insert({
              workspace_id: item.workspace_id, source_type: "event_queue", source_id: item.id,
              provider: "meta", payload_json: item.payload_json,
              error_message: JSON.stringify(result.response), retry_count: newAttempt,
            });

            if (item.event_id) {
              await supabase.from("events").update({ processing_status: "failed" }).eq("id", item.event_id);
            }
            deadLettered++;
          } else {
            // Schedule retry with exponential backoff
            const delayMs = nextRetryDelay(newAttempt);
            const nextRetry = new Date(Date.now() + delayMs).toISOString();

            await supabase.from("event_queue").update({
              status: "retry", attempt_count: newAttempt,
              next_retry_at: nextRetry, last_error: JSON.stringify(result.response),
              updated_at: new Date().toISOString(),
            }).eq("id", item.id);
            failed++;
          }
        }
      } catch (err) {
        // Unexpected error — schedule retry
        const newAttempt = item.attempt_count + 1;
        const errorMsg = String(err);
        if (newAttempt >= item.max_attempts) {
          await supabase.from("event_queue").update({
            status: "dead_letter", attempt_count: newAttempt, last_error: errorMsg, updated_at: new Date().toISOString(),
          }).eq("id", item.id);
          await supabase.from("dead_letter_events").insert({
            workspace_id: item.workspace_id, source_type: "event_queue", source_id: item.id,
            provider: "meta", payload_json: item.payload_json, error_message: errorMsg, retry_count: newAttempt,
          });
          deadLettered++;
        } else {
          const nextRetry = new Date(Date.now() + nextRetryDelay(newAttempt)).toISOString();
          await supabase.from("event_queue").update({
            status: "retry", attempt_count: newAttempt, next_retry_at: nextRetry,
            last_error: errorMsg, updated_at: new Date().toISOString(),
          }).eq("id", item.id);
          failed++;
        }
      }
    }

    return new Response(JSON.stringify({
      status: "ok", processed: queueItems.length, delivered, failed, dead_lettered: deadLettered,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Process events error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
