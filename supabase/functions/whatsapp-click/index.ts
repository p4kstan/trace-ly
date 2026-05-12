// WhatsApp click tracker — persists click + fires Lead via /track
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Short, readable click_id: CT-XXXXXX (base32)
function genClickId(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "CT-";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.toLowerCase().trim());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePhone(p: string): string {
  return (p || "").replace(/\D+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing x-api-key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: keyData } = await supabase
      .from("api_keys")
      .select("id, workspace_id")
      .eq("public_key", apiKey)
      .eq("status", "active")
      .maybeSingle();

    if (!keyData) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const phone = normalizePhone(body.phone || body.destination_phone || "");
    if (!phone) {
      return new Response(JSON.stringify({ error: "phone required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clickId = genClickId();
    const baseMessage = String(body.message || "Olá! Vim pelo site.").slice(0, 500);
    // Append ref token so the conversation carries the click_id
    const messageWithRef = `${baseMessage}\n\n[Ref: ${clickId}]`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(messageWithRef)}`;

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const ua = req.headers.get("user-agent") || "";
    const ipHash = ip ? await sha256Hex(ip) : null;

    const emailHash = body.email ? await sha256Hex(String(body.email)) : null;
    const phoneHash = body.user_phone ? await sha256Hex(normalizePhone(body.user_phone)) : null;

    // Persist click
    const { error: insErr } = await supabase.from("whatsapp_clicks").insert({
      workspace_id: keyData.workspace_id,
      click_id: clickId,
      destination_phone: phone,
      message_template: baseMessage,
      page_url: body.url || body.page_url || null,
      referrer: body.referrer || null,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      utm_content: body.utm_content || null,
      utm_term: body.utm_term || null,
      gclid: body.gclid || null,
      gbraid: body.gbraid || null,
      wbraid: body.wbraid || null,
      fbclid: body.fbclid || null,
      fbp: body.fbp || body._fbp || null,
      fbc: body.fbc || body._fbc || null,
      ga_client_id: body.ga_client_id || body.client_id || null,
      ip_hash: ipHash,
      user_agent: ua.slice(0, 500),
      email_hash: emailHash,
      phone_hash: phoneHash,
      status: "pending",
    });

    if (insErr) {
      console.error("whatsapp_clicks insert error", insErr);
    }

    // Fire-and-forget Lead event via /track (preserves attribution into Meta/Google/GA4)
    const trackPayload = {
      event_name: "Lead",
      event_id: clickId,
      source: "whatsapp_click",
      action_source: "website",
      url: body.url || body.page_url,
      referrer: body.referrer,
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
      utm_content: body.utm_content,
      utm_term: body.utm_term,
      gclid: body.gclid,
      gbraid: body.gbraid,
      wbraid: body.wbraid,
      fbclid: body.fbclid,
      fbp: body.fbp || body._fbp,
      fbc: body.fbc || body._fbc,
      ga_client_id: body.ga_client_id || body.client_id,
      content_name: "WhatsApp Click",
      custom_data: {
        wa_click_id: clickId,
        wa_destination: phone,
      },
    };

    fetch(`${SUPABASE_URL}/functions/v1/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "x-forwarded-for": ip,
        "user-agent": ua,
      },
      body: JSON.stringify(trackPayload),
    }).catch((e) => console.error("track forward error", e));

    return new Response(
      JSON.stringify({ ok: true, click_id: clickId, wa_url: waUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("whatsapp-click error:", err);
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
