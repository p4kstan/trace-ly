import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── In-memory caches (per isolate, ~5min TTL) ──
const apiKeyCache = new Map<string, { workspaceId: string; keyId: string; ts: number }>();
const domainCache = new Map<string, { domains: string[]; ts: number }>();
const API_KEY_TTL = 5 * 60 * 1000;

// ── Ad-hoc in-memory rate limiter (per workspace, sliding window) ──
// NOTE: per-isolate only — not a global guarantee. Provides burst protection
// in front of the durable monthly quota in workspace_usage.
const RATE_WINDOW_MS = 1000;
const RATE_MAX_PER_WINDOW = 50;
const rateBuckets = new Map<string, number[]>();

function checkRateLimit(workspaceId: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const bucket = (rateBuckets.get(workspaceId) || []).filter((t) => t > cutoff);
  if (bucket.length >= RATE_MAX_PER_WINDOW) {
    rateBuckets.set(workspaceId, bucket);
    return { allowed: false, retryAfter: Math.ceil((bucket[0] + RATE_WINDOW_MS - now) / 1000) || 1 };
  }
  bucket.push(now);
  rateBuckets.set(workspaceId, bucket);
  return { allowed: true, retryAfter: 0 };
}

function getCachedApiKey(key: string) {
  const entry = apiKeyCache.get(key);
  if (entry && Date.now() - entry.ts < API_KEY_TTL) return entry;
  apiKeyCache.delete(key);
  return null;
}

function getCachedDomains(workspaceId: string) {
  const entry = domainCache.get(workspaceId);
  if (entry && Date.now() - entry.ts < API_KEY_TTL) return entry.domains;
  domainCache.delete(workspaceId);
  return null;
}

// SHA-256 hashing aligned with Meta CAPI requirements
async function hashSHA256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Domain validation ──
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isDomainAllowed(requestDomain: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true; // no restrictions configured
  return allowedDomains.some(pattern => {
    if (pattern === "*") return true;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return requestDomain === suffix || requestDomain.endsWith("." + suffix);
    }
    return requestDomain === pattern.toLowerCase();
  });
}

async function validateDomain(req: Request, workspaceId: string): Promise<{ valid: boolean; domain?: string }> {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const requestDomain = extractDomain(origin || referer || "");

  if (!requestDomain) return { valid: true }; // server-to-server calls have no origin

  let domains = getCachedDomains(workspaceId);
  if (!domains) {
    // Buscar domínios em paralelo: workspace_allowed_domains (principal) +
    // tracking_sources.primary_domain + meta_pixels via allowed_domains (legado)
    const [wadRes, srcRes, pixRes] = await Promise.all([
      supabase.from("workspace_allowed_domains").select("domain").eq("workspace_id", workspaceId),
      supabase.from("tracking_sources").select("primary_domain").eq("workspace_id", workspaceId).eq("status", "active"),
      supabase.from("meta_pixels").select("id").eq("workspace_id", workspaceId),
    ]);

    const pixelIds = (pixRes.data || []).map((p: any) => p.id);
    let legacyDomains: string[] = [];
    if (pixelIds.length > 0) {
      const { data: legacy } = await supabase
        .from("allowed_domains")
        .select("domain")
        .in("meta_pixel_id", pixelIds);
      legacyDomains = (legacy || []).map((d: any) => d.domain);
    }

    domains = [
      ...(wadRes.data || []).map((d: any) => d.domain),
      ...(srcRes.data || []).map((s: any) => s.primary_domain).filter(Boolean),
      ...legacyDomains,
    ];
    domainCache.set(workspaceId, { domains, ts: Date.now() });
  }

  if (domains.length === 0) return { valid: true, domain: requestDomain };
  return { valid: isDomainAllowed(requestDomain, domains), domain: requestDomain };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing x-api-key header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── API Key lookup with cache ──
    let workspaceId: string;
    let keyId: string;
    const cached = getCachedApiKey(apiKey);
    if (cached) {
      workspaceId = cached.workspaceId;
      keyId = cached.keyId;
    } else {
      const { data: keyData, error: keyError } = await supabase
        .from("api_keys")
        .select("id, workspace_id")
        .eq("public_key", apiKey)
        .eq("status", "active")
        .maybeSingle();

      if (keyError || !keyData) {
        return new Response(
          JSON.stringify({ error: "Invalid API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      workspaceId = keyData.workspace_id;
      keyId = keyData.id;
      apiKeyCache.set(apiKey, { workspaceId, keyId, ts: Date.now() });
    }

    // ── Domain validation ──
    const domainCheck = await validateDomain(req, workspaceId);
    if (!domainCheck.valid) {
      console.warn(`Domain blocked: ${domainCheck.domain} for workspace ${workspaceId}`);
      return new Response(
        JSON.stringify({ error: "Domain not allowed", domain: domainCheck.domain }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Burst rate limit (in-memory, per isolate) ──
    const rl = checkRateLimit(workspaceId);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", retry_after: rl.retryAfter }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfter),
          },
        }
      );
    }

    // Fire-and-forget: update last_used_at
    supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId).then(() => {});

    // ── Parse body + validate ──
    const body = await req.json();

    if (!body.event_name || typeof body.event_name !== "string" || body.event_name.length > 255) {
      return new Response(
        JSON.stringify({ error: "event_name is required (max 255 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Rate limit: check workspace usage ──
    const { data: usageResult } = await supabase.rpc("increment_workspace_usage", { _workspace_id: workspaceId });
    if (usageResult && typeof usageResult === "object" && (usageResult as any).allowed === false) {
      return new Response(
        JSON.stringify({ error: "Monthly event limit exceeded. Please upgrade your plan.", usage: usageResult }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Compute hashes in parallel ──
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const rawEmail = body.email || body.user_data?.email;
    const rawPhone = body.phone || body.user_data?.phone;

    const [ipHash, emailHash, phoneHash] = await Promise.all([
      hashSHA256(ip),
      rawEmail ? hashSHA256(String(rawEmail).toLowerCase()) : Promise.resolve(null),
      rawPhone ? hashSHA256(String(rawPhone)) : Promise.resolve(null),
    ]);

    // ── Deduplication check ──
    if (body.event_id) {
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("event_id", body.event_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ status: "deduplicated", event_id: body.event_id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Identity Resolution + Session lookup in PARALLEL ──
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const identityPromise = resolveIdentity(workspaceId, emailHash, phoneHash, body, rawEmail, rawPhone);
    const sessionPromise = supabase
      .from("sessions")
      .select("id, gclid, gbraid, wbraid")
      .eq("workspace_id", workspaceId)
      .eq("ip_hash", ipHash)
      .eq("user_agent", userAgent)
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [identityId, sessionResult] = await Promise.all([identityPromise, sessionPromise]);

    const sanitizedGclid = body.gclid ? String(body.gclid).trim() : null;
    const sanitizedGbraid = body.gbraid ? String(body.gbraid).trim() : null;
    const sanitizedWbraid = body.wbraid ? String(body.wbraid).trim() : null;

    // ── Session: reuse or create ──
    let sessionId: string | null = null;
    if (sessionResult.data) {
      sessionId = sessionResult.data.id;
      if (
        (sanitizedGclid && !sessionResult.data.gclid) ||
        (sanitizedGbraid && !sessionResult.data.gbraid) ||
        (sanitizedWbraid && !sessionResult.data.wbraid)
      ) {
        await supabase
          .from("sessions")
          .update({
            ...(sanitizedGclid && !sessionResult.data.gclid ? { gclid: sanitizedGclid } : {}),
            ...(sanitizedGbraid && !sessionResult.data.gbraid ? { gbraid: sanitizedGbraid } : {}),
            ...(sanitizedWbraid && !sessionResult.data.wbraid ? { wbraid: sanitizedWbraid } : {}),
          })
          .eq("id", sessionId);
      }
    } else {
      const { data: newSession } = await supabase
        .from("sessions")
        .insert({
          workspace_id: workspaceId,
          identity_id: identityId,
          ip_hash: ipHash,
          user_agent: userAgent,
          referrer: body.referrer || null,
          landing_page: body.url || body.landing_page || null,
          utm_source: body.utm_source || body.utm?.utm_source || null,
          utm_medium: body.utm_medium || body.utm?.utm_medium || null,
          utm_campaign: body.utm_campaign || body.utm?.utm_campaign || null,
          utm_content: body.utm_content || body.utm?.utm_content || null,
          utm_term: body.utm_term || body.utm?.utm_term || null,
          fbp: body.fbp || null,
          fbc: body.fbc || null,
          gclid: sanitizedGclid,
          gbraid: sanitizedGbraid,
          wbraid: sanitizedWbraid,
        })
        .select("id")
        .single();
      sessionId = newSession?.id || null;
    }

    const enrichedUserData = {
      ...(body.user_data || {}),
      ...(emailHash ? { em: emailHash } : {}),
      ...(phoneHash ? { ph: phoneHash } : {}),
      ...(ipHash ? { client_ip_hash: ipHash } : {}),
      ...(userAgent ? { client_user_agent: userAgent } : {}),
      ...(body.fbp ? { fbp: body.fbp } : {}),
      ...(body.fbc ? { fbc: body.fbc } : {}),
      ...(body.external_id ? { external_id: body.external_id } : {}),
    };

    const deduplicationKey = body.event_id
      ? `${workspaceId}:${body.event_id}`
      : `${workspaceId}:${body.event_name}:${sessionId || "no-session"}:${Date.now()}`;

    const enrichedCustomData = {
      ...(body.custom_data || {}),
      ...(body.value != null ? { value: body.value } : {}),
      ...(body.currency ? { currency: body.currency } : {}),
      ...(sanitizedGclid ? { gclid: sanitizedGclid } : {}),
      ...(sanitizedGbraid ? { gbraid: sanitizedGbraid } : {}),
      ...(sanitizedWbraid ? { wbraid: sanitizedWbraid } : {}),
      ...(body.fbclid ? { fbclid: body.fbclid } : {}),
      ...(body.ttclid ? { ttclid: body.ttclid } : {}),
      ...(body.msclkid ? { msclkid: body.msclkid } : {}),
      ...(body.utm_source ? { utm_source: body.utm_source } : {}),
      ...(body.utm_medium ? { utm_medium: body.utm_medium } : {}),
      ...(body.utm_campaign ? { utm_campaign: body.utm_campaign } : {}),
      ...(body.utm_content ? { utm_content: body.utm_content } : {}),
      ...(body.utm_term ? { utm_term: body.utm_term } : {}),
    };

    const { data: event, error } = await supabase
      .from("events")
      .insert({
        workspace_id: workspaceId,
        session_id: sessionId,
        identity_id: identityId,
        event_name: body.event_name,
        event_id: body.event_id || null,
        event_time: new Date().toISOString(),
        source: body.source || null,
        action_source: body.action_source || "website",
        event_source_url: body.url || body.page_url || null,
        page_path: body.page_path || null,
        payload_json: body.payload || null,
        user_data_json: Object.keys(enrichedUserData).length > 0 ? enrichedUserData : null,
        custom_data_json: Object.keys(enrichedCustomData).length > 0 ? enrichedCustomData : null,
        deduplication_key: deduplicationKey,
        processing_status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to track event" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fire-and-forget: attribution touch ──
    const utmSource = body.utm_source || body.utm?.utm_source;
    if (utmSource || body.referrer) {
      supabase.from("attribution_touches").insert({
        workspace_id: workspaceId,
        session_id: sessionId,
        identity_id: identityId,
        source: utmSource || null,
        medium: body.utm_medium || body.utm?.utm_medium || null,
        campaign: body.utm_campaign || body.utm?.utm_campaign || null,
        content: body.utm_content || body.utm?.utm_content || null,
        term: body.utm_term || body.utm?.utm_term || null,
        touch_type: utmSource ? "paid" : "organic",
        touch_time: new Date().toISOString(),
      }).then(() => {});
    }

    // ── Fire-and-forget: EventRouter dispatch ──
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    fetch(`${SUPABASE_URL}/functions/v1/event-router`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ event_id: event.id, workspace_id: workspaceId }),
    }).catch(err => console.error("EventRouter dispatch error:", err));

    const latencyMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        status: "ok",
        event_id: event.id,
        session_id: sessionId,
        identity_id: identityId,
        deduplicated: false,
        latency_ms: latencyMs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Track error:", err);
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Identity resolver ──
async function resolveIdentity(
  workspaceId: string,
  emailHash: string | null,
  phoneHash: string | null,
  body: any,
  rawEmail: string | null | undefined,
  rawPhone: string | null | undefined,
): Promise<string | null> {
  if (!emailHash && !phoneHash && !body.external_id && !body.fingerprint) return null;

  let query = supabase.from("identities").select("id").eq("workspace_id", workspaceId);
  if (emailHash) query = query.eq("email_hash", emailHash);
  else if (body.external_id) query = query.eq("external_id", body.external_id);
  else if (phoneHash) query = query.eq("phone_hash", phoneHash);
  else if (body.fingerprint) query = query.eq("fingerprint", body.fingerprint);

  const { data: identity } = await query.maybeSingle();

  if (identity) {
    supabase.from("identities").update({ last_seen_at: new Date().toISOString() }).eq("id", identity.id).then(() => {});
    return identity.id;
  }

  const { data: newIdentity } = await supabase
    .from("identities")
    .insert({
      workspace_id: workspaceId,
      email: rawEmail ? String(rawEmail).toLowerCase() : null,
      phone: rawPhone ? String(rawPhone) : null,
      email_hash: emailHash,
      phone_hash: phoneHash,
      external_id: body.external_id || null,
      fingerprint: body.fingerprint || null,
    })
    .select("id")
    .single();

  return newIdentity?.id || null;
}
