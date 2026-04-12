import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.103.0/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface TrackPayload {
  event_name: string;
  event_id?: string;
  source?: string;
  url?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  value?: number;
  currency?: string;
  cookies?: Record<string, string>;
  properties?: Record<string, unknown>;
  // Identity
  email?: string;
  phone?: string;
  external_id?: string;
  fingerprint?: string;
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
    const body: TrackPayload = await req.json();

    // Validate required field
    if (!body.event_name || typeof body.event_name !== "string") {
      return new Response(
        JSON.stringify({ error: "event_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate event_name length
    if (body.event_name.length > 255) {
      return new Response(
        JSON.stringify({ error: "event_name too long (max 255)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract IP and User-Agent from headers
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Deduplication: check event_id
    if (body.event_id) {
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("event_id", body.event_id)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ status: "deduplicated", event_id: body.event_id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Resolve or create user identity
    let userIdentityId: string | null = null;
    if (body.email || body.phone || body.external_id || body.fingerprint) {
      // Try to find existing identity
      let query = supabase.from("user_identities").select("id");
      if (body.email) query = query.eq("email", body.email);
      else if (body.external_id) query = query.eq("external_id", body.external_id);
      else if (body.phone) query = query.eq("phone", body.phone);
      else if (body.fingerprint) query = query.eq("fingerprint", body.fingerprint);

      const { data: identity } = await query.maybeSingle();

      if (identity) {
        userIdentityId = identity.id;
      } else {
        const { data: newIdentity } = await supabase
          .from("user_identities")
          .insert({
            email: body.email || null,
            phone: body.phone || null,
            external_id: body.external_id || null,
            fingerprint: body.fingerprint || null,
          })
          .select("id")
          .single();

        userIdentityId = newIdentity?.id || null;
      }
    }

    // Create or reuse session (based on IP + UA + UTMs within 30min)
    let sessionId: string | null = null;
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    let sessionQuery = supabase
      .from("sessions")
      .select("id")
      .eq("ip", ip)
      .eq("user_agent", userAgent)
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (userIdentityId) {
      sessionQuery = sessionQuery.eq("user_identity_id", userIdentityId);
    }

    const { data: existingSession } = await sessionQuery.maybeSingle();

    if (existingSession) {
      sessionId = existingSession.id;
    } else {
      const { data: newSession } = await supabase
        .from("sessions")
        .insert({
          user_identity_id: userIdentityId,
          ip,
          user_agent: userAgent,
          referrer: body.referrer || null,
          url: body.url || null,
          utm_source: body.utm_source || null,
          utm_medium: body.utm_medium || null,
          utm_campaign: body.utm_campaign || null,
          utm_content: body.utm_content || null,
          utm_term: body.utm_term || null,
        })
        .select("id")
        .single();

      sessionId = newSession?.id || null;
    }

    // Insert event
    const { data: event, error } = await supabase
      .from("events")
      .insert({
        event_id: body.event_id || null,
        event_name: body.event_name,
        source: body.source || null,
        session_id: sessionId,
        user_identity_id: userIdentityId,
        ip,
        user_agent: userAgent,
        referrer: body.referrer || null,
        url: body.url || null,
        utm_source: body.utm_source || null,
        utm_medium: body.utm_medium || null,
        utm_campaign: body.utm_campaign || null,
        utm_content: body.utm_content || null,
        utm_term: body.utm_term || null,
        value: body.value || null,
        currency: body.currency || null,
        cookies: body.cookies || null,
        properties: body.properties || null,
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

    return new Response(
      JSON.stringify({
        status: "ok",
        event_id: event.id,
        session_id: sessionId,
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
