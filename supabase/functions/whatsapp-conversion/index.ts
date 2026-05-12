// Mark a WhatsApp click as converted + fire Purchase via /track
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function extractRef(text: string): string | null {
  const m = text?.match(/CT-[A-Z2-9]{6}/);
  return m ? m[0] : null;
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
    const clickId =
      (body.click_id && String(body.click_id).trim()) ||
      extractRef(String(body.ref || body.message || body.text || ""));

    if (!clickId) {
      return new Response(JSON.stringify({ error: "click_id or ref required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const value = Number(body.value || 0);
    const currency = String(body.currency || "BRL").toUpperCase().slice(0, 3);
    const source = ["business_api", "webhook", "manual"].includes(body.source) ? body.source : "webhook";

    const { data: click } = await supabase
      .from("whatsapp_clicks")
      .select("*")
      .eq("workspace_id", keyData.workspace_id)
      .eq("click_id", clickId)
      .maybeSingle();

    if (!click) {
      return new Response(JSON.stringify({ error: "click not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if already converted, return existing
    const { data: existing } = await supabase
      .from("whatsapp_conversions")
      .select("id, event_id")
      .eq("workspace_id", keyData.workspace_id)
      .eq("click_id", clickId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ ok: true, already_converted: true, conversion_id: existing.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const eventId = `wa_purchase_${clickId}`;

    await supabase.from("whatsapp_conversions").insert({
      workspace_id: keyData.workspace_id,
      click_id: clickId,
      click_uuid: click.id,
      value,
      currency,
      source,
      event_id: eventId,
      notes: body.notes || null,
    });

    await supabase
      .from("whatsapp_clicks")
      .update({ status: "converted" })
      .eq("id", click.id);

    // Fire Purchase via /track with original attribution
    const trackPayload = {
      event_name: "Purchase",
      event_id: eventId,
      source: `whatsapp_${source}`,
      action_source: "chat",
      value,
      currency,
      order_id: clickId,
      url: click.page_url,
      referrer: click.referrer,
      utm_source: click.utm_source,
      utm_medium: click.utm_medium,
      utm_campaign: click.utm_campaign,
      utm_content: click.utm_content,
      utm_term: click.utm_term,
      gclid: click.gclid,
      gbraid: click.gbraid,
      wbraid: click.wbraid,
      fbclid: click.fbclid,
      fbp: click.fbp,
      fbc: click.fbc,
      ga_client_id: click.ga_client_id,
      user_data_hashed: {
        em: click.email_hash || undefined,
        ph: click.phone_hash || undefined,
      },
      custom_data: {
        wa_click_id: clickId,
        wa_destination: click.destination_phone,
        conversion_source: source,
      },
    };

    fetch(`${SUPABASE_URL}/functions/v1/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(trackPayload),
    }).catch((e) => console.error("track forward error", e));

    return new Response(
      JSON.stringify({ ok: true, click_id: clickId, event_id: eventId, value, currency }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("whatsapp-conversion error:", err);
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
