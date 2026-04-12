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
const MAX_BATCH_SIZE = 1000; // Meta allows up to 1000 events per request
const CONCURRENCY = 5; // parallel pixel batches

// ── SHA-256 helper ──
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Exponential backoff: 30s, 2m, 8m, 30m, 2h ──
function nextRetryDelay(attempt: number): number {
  const baseMs = 30_000;
  const jitter = Math.random() * 5_000; // 0-5s jitter
  return Math.min(baseMs * Math.pow(4, attempt), 2 * 60 * 60 * 1000) + jitter;
}

// ── Build Meta event payload from queue item ──
async function buildMetaEvent(item: any) {
  const p = item.payload_json;
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
    event_time: Math.floor(new Date(item.created_at).getTime() / 1000),
    event_id: item.event_id || crypto.randomUUID(),
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

// ── Send batch of events to Meta CAPI ──
async function sendBatchToMeta(
  pixelId: string, accessToken: string, testEventCode: string | null,
  metaEvents: any[]
): Promise<{ ok: boolean; response: any }> {
  const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${pixelId}/events`;
  const body: Record<string, unknown> = { data: metaEvents, access_token: accessToken };
  if (testEventCode) body.test_event_code = testEventCode;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, response: data };
}

// ── Handle failed item (retry or dead letter) ──
async function handleFailure(item: any, errorMsg: string, stats: { failed: number; deadLettered: number }) {
  const newAttempt = item.attempt_count + 1;

  if (newAttempt >= item.max_attempts) {
    await supabase.from("event_queue").update({
      status: "dead_letter", attempt_count: newAttempt,
      last_error: errorMsg, updated_at: new Date().toISOString(),
    }).eq("id", item.id);

    await supabase.from("dead_letter_events").insert({
      workspace_id: item.workspace_id, source_type: "event_queue",
      source_id: item.id, provider: "meta", payload_json: item.payload_json,
      error_message: errorMsg, retry_count: newAttempt,
    });

    if (item.event_id) {
      await supabase.from("events").update({ processing_status: "failed" }).eq("id", item.event_id);
    }
    stats.deadLettered++;
  } else {
    const nextRetry = new Date(Date.now() + nextRetryDelay(newAttempt)).toISOString();
    await supabase.from("event_queue").update({
      status: "retry", attempt_count: newAttempt,
      next_retry_at: nextRetry, last_error: errorMsg,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id);
    stats.failed++;
  }
}

// ── Process a batch of items for a single pixel ──
async function processPixelBatch(
  pixelKey: string,
  items: any[],
  pixelCache: Map<string, any>,
  stats: { delivered: number; failed: number; deadLettered: number }
) {
  // Resolve pixel credentials (cached)
  let pixel = pixelCache.get(pixelKey);
  if (!pixel) {
    const [workspaceId, pixelId] = pixelKey.split("::");
    const { data } = await supabase.from("meta_pixels")
      .select("pixel_id, access_token_encrypted, test_event_code")
      .eq("pixel_id", pixelId)
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .single();
    pixel = data;
    pixelCache.set(pixelKey, pixel || null);
  }

  if (!pixel?.access_token_encrypted) {
    // Dead letter all items in this batch
    for (const item of items) {
      await handleFailure(item, "Pixel not found or no access token", stats);
    }
    return;
  }

  // Build all Meta events for this batch
  const metaEvents: any[] = [];
  const itemMap: Map<number, any> = new Map(); // index → queue item

  for (let i = 0; i < items.length; i++) {
    try {
      const metaEvt = await buildMetaEvent(items[i]);
      metaEvents.push(metaEvt);
      itemMap.set(metaEvents.length - 1, items[i]);
    } catch (err) {
      await handleFailure(items[i], `Build error: ${String(err)}`, stats);
    }
  }

  if (metaEvents.length === 0) return;

  // Send in sub-batches of MAX_BATCH_SIZE
  for (let offset = 0; offset < metaEvents.length; offset += MAX_BATCH_SIZE) {
    const chunk = metaEvents.slice(offset, offset + MAX_BATCH_SIZE);
    const chunkItems = Array.from({ length: chunk.length }, (_, i) => itemMap.get(offset + i)!);

    try {
      const result = await sendBatchToMeta(
        pixel.pixel_id, pixel.access_token_encrypted, pixel.test_event_code, chunk
      );

      // Log single delivery record for the batch
      await supabase.from("event_deliveries").insert({
        event_id: chunkItems[0]?.event_id || crypto.randomUUID(),
        workspace_id: chunkItems[0]?.workspace_id,
        provider: "meta",
        destination: pixel.pixel_id,
        status: result.ok ? "delivered" : "failed",
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        request_json: { pixel_id: pixel.pixel_id, batch_size: chunk.length, event_names: chunk.map((e: any) => e.event_name) },
        response_json: result.response,
        error_message: result.ok ? null : JSON.stringify(result.response),
      });

      if (result.ok) {
        // Mark all items as delivered
        const ids = chunkItems.map(i => i.id);
        const eventIds = chunkItems.map(i => i.event_id).filter(Boolean);

        await supabase.from("event_queue")
          .update({ status: "delivered", attempt_count: 1, updated_at: new Date().toISOString() })
          .in("id", ids);

        if (eventIds.length) {
          await supabase.from("events")
            .update({ processing_status: "delivered" })
            .in("id", eventIds);
        }

        stats.delivered += chunkItems.length;
      } else {
        // Retry/dead-letter each item individually
        const errMsg = JSON.stringify(result.response);
        for (const item of chunkItems) {
          await handleFailure(item, errMsg, stats);
        }
      }
    } catch (err) {
      const errMsg = String(err);
      for (const item of chunkItems) {
        await handleFailure(item, errMsg, stats);
      }
    }
  }
}

// ── Parallel chunk processor ──
async function processInParallel<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Process queued events with batch sending, parallel processing, and exponential backoff.
 * 
 * POST /process-events
 * Body: { workspace_id?: string, limit?: number }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { workspace_id, limit = 200 } = body;

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
      return new Response(JSON.stringify({
        status: "ok", message: "No items to process", count: 0,
        duration_ms: Date.now() - startTime,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark all as processing atomically
    const allIds = queueItems.map(i => i.id);
    await supabase.from("event_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .in("id", allIds);

    // Group items by workspace+pixel (destination) for batching
    const pixelBatches = new Map<string, any[]>();
    for (const item of queueItems) {
      const key = `${item.workspace_id}::${item.destination}`;
      if (!pixelBatches.has(key)) pixelBatches.set(key, []);
      pixelBatches.get(key)!.push(item);
    }

    const stats = { delivered: 0, failed: 0, deadLettered: 0 };
    const pixelCache = new Map<string, any>();

    // Process pixel batches in parallel (up to CONCURRENCY)
    const batchEntries = Array.from(pixelBatches.entries());
    await processInParallel(batchEntries, CONCURRENCY, async ([pixelKey, items]) => {
      await processPixelBatch(pixelKey, items, pixelCache, stats);
    });

    const duration = Date.now() - startTime;
    console.log(`Processed ${queueItems.length} items: ${stats.delivered} delivered, ${stats.failed} retry, ${stats.deadLettered} dead_letter (${duration}ms)`);

    return new Response(JSON.stringify({
      status: "ok",
      processed: queueItems.length,
      delivered: stats.delivered,
      failed: stats.failed,
      dead_lettered: stats.deadLettered,
      batches: pixelBatches.size,
      duration_ms: duration,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Process events error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", duration_ms: Date.now() - startTime }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
