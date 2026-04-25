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

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = "https://graph.facebook.com";
const MAX_BATCH_SIZE = 1000;
const CONCURRENCY = 5;

// ══════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function nextRetryDelay(attempt: number): number {
  const baseMs = 30_000;
  const jitter = Math.random() * 5_000;
  return Math.min(baseMs * Math.pow(4, attempt), 2 * 60 * 60 * 1000) + jitter;
}

async function handleFailure(item: any, errorMsg: string, stats: { failed: number; deadLettered: number }) {
  const newAttempt = item.attempt_count + 1;
  if (newAttempt >= item.max_attempts) {
    await supabase.from("event_queue").update({
      status: "dead_letter", attempt_count: newAttempt,
      last_error: errorMsg, updated_at: new Date().toISOString(),
    }).eq("id", item.id);
    await supabase.from("dead_letter_events").insert({
      workspace_id: item.workspace_id, source_type: "event_queue",
      source_id: item.id, provider: item.provider, payload_json: item.payload_json,
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

async function markDelivered(items: any[], stats: { delivered: number }) {
  const ids = items.map(i => i.id);
  const eventIds = items.map(i => i.event_id).filter(Boolean);
  await supabase.from("event_queue")
    .update({ status: "delivered", attempt_count: 1, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (eventIds.length) {
    await supabase.from("events").update({ processing_status: "delivered" }).in("id", eventIds);
  }
  stats.delivered += items.length;
}

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

// ══════════════════════════════════════════════════════════════
// META CAPI
// ══════════════════════════════════════════════════════════════

async function buildMetaEvent(item: any) {
  const p = item.payload_json;
  const customer = p.customer || {};
  const session = p.session || {};
  const order = p.order || {};

  const userData: Record<string, unknown> = {};

  // Prefer pre-hashed PII (computed at webhook time, normalized BR phone, etc).
  // Fall back to on-the-fly hashing if hashes weren't pre-computed.
  if (customer.email_hash) userData.em = [customer.email_hash];
  else if (customer.email) userData.em = [await sha256(String(customer.email).toLowerCase().trim())];

  if (customer.phone_hash) userData.ph = [customer.phone_hash];
  else if (customer.phone) userData.ph = [await sha256(String(customer.phone).replace(/\D/g, ""))];

  // Names — prefer split first/last hashes when available
  if (customer.first_name_hash) userData.fn = [customer.first_name_hash];
  if (customer.last_name_hash) userData.ln = [customer.last_name_hash];
  if (!customer.first_name_hash && !customer.last_name_hash && customer.name) {
    const parts = String(customer.name).trim().split(/\s+/);
    userData.fn = [await sha256(parts[0].toLowerCase())];
    if (parts.length > 1) userData.ln = [await sha256(parts[parts.length - 1].toLowerCase())];
  }

  // Address — Enhanced Conversions match-rate booster
  if (customer.city_hash) userData.ct = [customer.city_hash];
  if (customer.state_hash) userData.st = [customer.state_hash];
  if (customer.zip_hash) userData.zp = [customer.zip_hash];
  if (customer.country_hash) userData.country = [customer.country_hash];

  if (p.identity_id) userData.external_id = [p.identity_id];
  if (session.fbp) userData.fbp = session.fbp;
  if (session.fbc) userData.fbc = session.fbc;

  // Priority: session.ip_hash → webhook-provided IP from gateway
  if (session.ip_hash) userData.client_ip_address = session.ip_hash;
  else if (p.webhook_client_ip) userData.client_ip_address = p.webhook_client_ip;

  if (session.user_agent) userData.client_user_agent = session.user_agent;
  else if (p.webhook_user_agent) userData.client_user_agent = p.webhook_user_agent;

  return {
    event_name: p.marketing_event,
    event_time: Math.floor(new Date(item.created_at).getTime() / 1000),
    event_id: item.event_id || crypto.randomUUID(),
    action_source: "website",
    event_source_url: session.landing_page || undefined,
    user_data: userData,
    custom_data: {
      value: order.total_value, currency: order.currency,
      order_id: order.external_order_id, content_type: "product",
      num_items: order.items?.length || 1,
      contents: order.items?.map((i: any) => ({ id: i.product_id || i.product_name || "item", quantity: i.quantity })),
      content_ids: order.items?.map((i: any) => String(i.product_id || i.product_name)),
    },
  };
}

async function sendBatchToMeta(pixelId: string, accessToken: string, testEventCode: string | null, metaEvents: any[]) {
  const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${pixelId}/events`;
  const body: Record<string, unknown> = { data: metaEvents, access_token: accessToken };
  if (testEventCode) body.test_event_code = testEventCode;
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, response: data };
}

async function processMetaBatch(
  pixelKey: string, items: any[], pixelCache: Map<string, any>,
  stats: { delivered: number; failed: number; deadLettered: number; skipped?: number }
) {
  let pixel = pixelCache.get(pixelKey);
  if (!pixel) {
    const [workspaceId, pixelId] = pixelKey.split("::");
    const { data } = await supabase.from("meta_pixels")
      .select("pixel_id, access_token_encrypted, test_event_code")
      .eq("pixel_id", pixelId).eq("workspace_id", workspaceId).eq("is_active", true).single();
    pixel = data;
    pixelCache.set(pixelKey, pixel || null);
  }
  if (!pixel?.access_token_encrypted) {
    for (const item of items) await handleFailure(item, "Pixel not found or no access token", stats);
    return;
  }

  const metaEvents: any[] = [];
  const itemMap: Map<number, any> = new Map();
  for (let i = 0; i < items.length; i++) {
    try {
      const evt = await buildMetaEvent(items[i]);
      metaEvents.push(evt);
      itemMap.set(metaEvents.length - 1, items[i]);
    } catch (err) {
      await handleFailure(items[i], `Build error: ${String(err)}`, stats);
    }
  }
  if (metaEvents.length === 0) return;

  for (let offset = 0; offset < metaEvents.length; offset += MAX_BATCH_SIZE) {
    const chunk = metaEvents.slice(offset, offset + MAX_BATCH_SIZE);
    const chunkItems = Array.from({ length: chunk.length }, (_, i) => itemMap.get(offset + i)!);
    try {
      const result = await sendBatchToMeta(pixel.pixel_id, pixel.access_token_encrypted, pixel.test_event_code, chunk);
      await supabase.from("event_deliveries").insert({
        event_id: chunkItems[0]?.event_id || crypto.randomUUID(),
        workspace_id: chunkItems[0]?.workspace_id, provider: "meta",
        destination: pixel.pixel_id,
        status: result.ok ? "delivered" : "failed", attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        request_json: { pixel_id: pixel.pixel_id, batch_size: chunk.length, event_names: chunk.map((e: any) => e.event_name) },
        response_json: result.response,
        error_message: result.ok ? null : JSON.stringify(result.response),
      });
      if (result.ok) {
        await markDelivered(chunkItems, stats);
      } else {
        for (const item of chunkItems) await handleFailure(item, JSON.stringify(result.response), stats);
      }
    } catch (err) {
      for (const item of chunkItems) await handleFailure(item, String(err), stats);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MULTI-PROVIDER DISPATCH
// ══════════════════════════════════════════════════════════════

const PROVIDER_FUNCTIONS: Record<string, string> = {
  google_ads: "google-ads-capi",
  tiktok: "tiktok-events",
  ga4: "ga4-events",
};

async function dispatchToProvider(
  provider: string, items: any[], destination: any,
  stats: { delivered: number; failed: number; deadLettered: number; skipped?: number }
) {
  const fnName = PROVIDER_FUNCTIONS[provider];
  if (!fnName) {
    for (const item of items) await handleFailure(item, `Unknown provider: ${provider}`, stats);
    return;
  }
  try {
    const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      body: JSON.stringify({ items, destination }),
    });
    const result = await res.json();
    if (res.ok && (result.status === "ok" || result.status === "partial")) {
      const deliveredCount = result.delivered || 0;
      const failedCount = result.failed || 0;
      const skippedFlag = result.skipped === true; // dispatcher signaled "no identifier" — never retry
      const skippedCount = typeof result.skipped === "number" ? result.skipped : 0;

      if (deliveredCount > 0) await markDelivered(items.slice(0, deliveredCount), stats);
      if (failedCount > 0) {
        for (const item of items.slice(items.length - failedCount)) {
          await handleFailure(item, `${provider} dispatch failed`, stats);
        }
      }
      // Items neither delivered nor failed: distinguish between
      //   (a) provider explicitly skipped (no identifier) — mark as `skipped`, no retry
      //   (b) accounting mismatch — fall through to dead_letter as before
      const accountedFor = deliveredCount + failedCount;
      if (accountedFor < items.length) {
        const remaining = items.slice(deliveredCount, items.length - failedCount);
        if (skippedFlag) {
          const reason = result.message || `${provider} skipped: no matching identifiers`;
          await supabase.from("event_queue").update({
            status: "skipped",
            last_error: reason,
            updated_at: new Date().toISOString(),
          }).in("id", remaining.map((i) => i.id));
          stats.skipped = (stats.skipped || 0) + remaining.length;
        } else {
          const reason = skippedCount > 0
            ? `${provider} skipped: ${result.message || "no matching identifiers (gclid/email/phone)"}`
            : `${provider} returned no delivered/failed counts`;
          for (const item of remaining) {
            await handleFailure({ ...item, attempt_count: item.max_attempts - 1 }, reason, stats);
          }
        }
      }
    } else {
      const errMsg = JSON.stringify(result);
      for (const item of items) await handleFailure(item, errMsg, stats);
    }
  } catch (err) {
    for (const item of items) await handleFailure(item, `${provider} call error: ${String(err)}`, stats);
  }
}

async function processNonMetaBatch(
  provider: string, workspaceId: string, destinationId: string, items: any[],
  destCache: Map<string, any>,
  stats: { delivered: number; failed: number; deadLettered: number; skipped?: number }
) {
  const cacheKey = `${workspaceId}::${provider}`;
  let destinations = destCache.get(cacheKey);
  if (!destinations) {
    const { data } = await supabase.from("integration_destinations")
      .select("*").eq("workspace_id", workspaceId).eq("provider", provider).eq("is_active", true);
    destinations = data || [];
    destCache.set(cacheKey, destinations);
  }
  if (!destinations.length) {
    for (const item of items) await handleFailure(item, `No active ${provider} destination configured`, stats);
    return;
  }
  // Dispatch ONLY to the destination this batch was reserved for. Prevents
  // sending the same conversion to every connected account.
  const dest = destinations.find((d: any) =>
    d.destination_id === destinationId || d.id === destinationId,
  ) || (destinationId === "default" ? destinations[0] : null);
  if (!dest) {
    for (const item of items) await handleFailure(item, `${provider} destination ${destinationId} not found`, stats);
    return;
  }
  await dispatchToProvider(provider, items, dest, stats);
}

// ══════════════════════════════════════════════════════════════
// METRICS RECORDING
// ══════════════════════════════════════════════════════════════

async function recordMetrics(
  workspaceIds: Set<string>,
  stats: { delivered: number; failed: number; deadLettered: number; skipped?: number },
  durationMs: number,
  totalItems: number,
) {
  const now = new Date().toISOString();
  const throughput = totalItems > 0 ? (totalItems / (durationMs / 1000)) : 0;
  const metrics: any[] = [];

  for (const wsId of workspaceIds) {
    metrics.push(
      { workspace_id: wsId, metric_type: "batch_throughput", value: throughput, metadata_json: { total: totalItems, duration_ms: durationMs }, recorded_at: now },
      { workspace_id: wsId, metric_type: "batch_latency_ms", value: durationMs, recorded_at: now },
      { workspace_id: wsId, metric_type: "batch_delivered", value: stats.delivered, recorded_at: now },
      { workspace_id: wsId, metric_type: "batch_failed", value: stats.failed + stats.deadLettered, recorded_at: now },
    );
  }

  if (metrics.length > 0) {
    await supabase.from("pipeline_metrics").insert(metrics);
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════

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

    // Mark all as processing
    const allIds = queueItems.map(i => i.id);
    await supabase.from("event_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .in("id", allIds);

    // Group items by provider
    const metaBatches = new Map<string, any[]>();
    const nonMetaBatches = new Map<string, { provider: string; workspaceId: string; destination: string; items: any[] }>();
    const workspaceIds = new Set<string>();

    for (const item of queueItems) {
      const provider = item.provider || "meta";
      workspaceIds.add(item.workspace_id);

      if (provider === "meta") {
        const key = `${item.workspace_id}::${item.destination}`;
        if (!metaBatches.has(key)) metaBatches.set(key, []);
        metaBatches.get(key)!.push(item);
      } else {
        // Group by provider + workspace + destination so each batch
        // dispatches ONLY to its target account (no cross-account fan-out).
        const dest = item.destination || "default";
        const key = `${provider}::${item.workspace_id}::${dest}`;
        if (!nonMetaBatches.has(key)) {
          nonMetaBatches.set(key, { provider, workspaceId: item.workspace_id, destination: dest, items: [] });
        }
        nonMetaBatches.get(key)!.items.push(item);
      }
    }

    const stats: { delivered: number; failed: number; deadLettered: number; skipped: number } = { delivered: 0, failed: 0, deadLettered: 0, skipped: 0 };
    const pixelCache = new Map<string, any>();
    const destCache = new Map<string, any>();

    const metaEntries = Array.from(metaBatches.entries());
    const nonMetaEntries = Array.from(nonMetaBatches.values());

    await Promise.all([
      processInParallel(metaEntries, CONCURRENCY, async ([pixelKey, items]) => {
        await processMetaBatch(pixelKey, items, pixelCache, stats);
      }),
      processInParallel(nonMetaEntries, CONCURRENCY, async ({ provider, workspaceId, items }) => {
        await processNonMetaBatch(provider, workspaceId, items, destCache, stats);
      }),
    ]);

    const duration = Date.now() - startTime;
    const totalBatches = metaBatches.size + nonMetaBatches.size;

    // Record pipeline metrics (fire-and-forget)
    recordMetrics(workspaceIds, stats, duration, queueItems.length).catch(e => console.error("Metrics error:", e));

    console.log(`Processed ${queueItems.length} items (${totalBatches} batches): ${stats.delivered} delivered, ${stats.failed} retry, ${stats.deadLettered} dead_letter (${duration}ms)`);

    return new Response(JSON.stringify({
      status: "ok",
      processed: queueItems.length,
      delivered: stats.delivered,
      failed: stats.failed,
      dead_lettered: stats.deadLettered,
      batches: totalBatches,
      throughput_eps: queueItems.length > 0 ? +(queueItems.length / (duration / 1000)).toFixed(1) : 0,
      providers: { meta: metaBatches.size, others: nonMetaBatches.size },
      duration_ms: duration,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Process events error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", duration_ms: Date.now() - startTime }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
