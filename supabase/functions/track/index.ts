import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// SHA-256 hashing aligned with Meta CAPI requirements
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
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing x-api-key header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up workspace by API key
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

    const workspaceId = keyData.workspace_id;

    // Update last_used_at (fire-and-forget)
    supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyData.id).then(() => {});

    // Domain validation
    const origin = req.headers.get("origin") || req.headers.get("referer") || "";
    let originHost = "";
    try {
      originHost = new URL(origin).hostname;
    } catch {
      originHost = origin.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    }

    // Get workspace's pixels and their allowed domains
    const { data: pixels } = await supabase
      .from("meta_pixels")
      .select("id, allow_all_domains")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    if (pixels && pixels.length > 0) {
      const pixelIds = pixels.map(p => p.id);
      const allDomainsAllowed = pixels.some(p => p.allow_all_domains);

      if (!allDomainsAllowed && originHost) {
        const { data: domains } = await supabase
          .from("allowed_domains")
          .select("domain")
          .in("meta_pixel_id", pixelIds);

        const allowedDomains = domains?.map(d => d.domain) || [];
        
        if (allowedDomains.length > 0) {
          const isAllowed = allowedDomains.some(d => {
            if (d === "*") return true;
            if (d.startsWith("*.")) return originHost.endsWith(d.substring(2)) || originHost === d.substring(2);
            return originHost === d || originHost === "www." + d;
          });

          if (!isAllowed) {
            return new Response(
              JSON.stringify({ error: "Domain not allowed", domain: originHost }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    const body = await req.json();

    if (!body.event_name || typeof body.event_name !== "string" || body.event_name.length > 255) {
      return new Response(
        JSON.stringify({ error: "event_name is required (max 255 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const ipHash = await hashSHA256(ip);

    // Deduplication
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

    // Resolve identity using SHA-256 hashes (aligned with Meta CAPI)
    let identityId: string | null = null;
    const rawEmail = body.email || body.user_data?.email;
    const rawPhone = body.phone || body.user_data?.phone;
    const emailHash = rawEmail ? await hashSHA256(String(rawEmail).toLowerCase()) : null;
    const phoneHash = rawPhone ? await hashSHA256(String(rawPhone)) : null;

    if (emailHash || phoneHash || body.external_id || body.fingerprint) {
      let query = supabase.from("identities").select("id").eq("workspace_id", workspaceId);
      if (emailHash) query = query.eq("email_hash", emailHash);
      else if (body.external_id) query = query.eq("external_id", body.external_id);
      else if (phoneHash) query = query.eq("phone_hash", phoneHash);
      else if (body.fingerprint) query = query.eq("fingerprint", body.fingerprint);

      const { data: identity } = await query.maybeSingle();

      if (identity) {
        identityId = identity.id;
        supabase.from("identities").update({ last_seen_at: new Date().toISOString() }).eq("id", identityId).then(() => {});
      } else {
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
        identityId = newIdentity?.id || null;
      }
    }

    // Session (reuse within 30min)
    let sessionId: string | null = null;
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: existingSession } = await supabase
      .from("sessions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("ip_hash", ipHash)
      .eq("user_agent", userAgent)
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      sessionId = existingSession.id;
    } else {
      const { data: newSession } = await supabase
        .from("sessions")
        .insert({
          workspace_id: workspaceId,
          identity_id: identityId,
          ip_hash: ipHash,
          user_agent: userAgent,
          referrer: body.referrer || null,
          landing_page: body.url || null,
          utm_source: body.utm_source || null,
          utm_medium: body.utm_medium || null,
          utm_campaign: body.utm_campaign || null,
          utm_content: body.utm_content || null,
          utm_term: body.utm_term || null,
          fbp: body.fbp || null,
          fbc: body.fbc || null,
        })
        .select("id")
        .single();
      sessionId = newSession?.id || null;
    }

    // Insert event
    const deduplicationKey = body.event_id || `${workspaceId}_${body.event_name}_${ipHash}_${Date.now()}`;

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
        event_source_url: body.url || null,
        page_path: body.page_path || null,
        payload_json: body.payload || null,
        user_data_json: body.user_data || null,
        custom_data_json: body.custom_data || (body.value ? { value: body.value, currency: body.currency } : null),
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

    // Attribution touch
    if (body.utm_source || body.referrer) {
      supabase.from("attribution_touches").insert({
        workspace_id: workspaceId,
        session_id: sessionId,
        identity_id: identityId,
        source: body.utm_source || null,
        medium: body.utm_medium || null,
        campaign: body.utm_campaign || null,
        content: body.utm_content || null,
        term: body.utm_term || null,
        touch_type: body.utm_source ? "paid" : "organic",
        touch_time: new Date().toISOString(),
      }).then(() => {});
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        event_id: event.id,
        session_id: sessionId,
        identity_id: identityId,
        deduplicated: false,
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
