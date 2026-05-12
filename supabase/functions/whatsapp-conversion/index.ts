// Marca um clique de WhatsApp como convertido (whatsapp_purchase) e dispara
// Purchase via /track preservando atribuição original (utm/gclid/fbclid/_fbp).
//
// Dedup forte por event_id no formato `whatsapp_purchase:<click_id>`:
//   - UNIQUE (workspace_id, event_id) em whatsapp_conversions
//   - Pre-check antes de inserir (resposta amigável idempotente)
//   - O próprio /track também deduplica em event_deliveries (48h)
//
// Aceita 3 fontes:
//   - manual       → painel CapiTrack (botão "marcar como vendido")
//   - webhook      → Zapier / n8n / Make / CRM
//   - business_api → WhatsApp Business Cloud API (via /whatsapp-business-webhook)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const VALID_SOURCES = ["manual", "webhook", "business_api"] as const;
type ConversionSource = typeof VALID_SOURCES[number];

const CLICK_ID_REGEX = /CT-[A-Z2-9]{6}/;

function extractRef(text: string): string | null {
  const m = text?.match(CLICK_ID_REGEX);
  return m ? m[0] : null;
}

function buildEventId(clickId: string): string {
  // Formato canônico: dedupável em whatsapp_conversions e em event_deliveries.
  return `whatsapp_purchase:${clickId}`;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // ───── 1. Autenticação por API key ─────
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return jsonResponse({ error: "Missing x-api-key" }, 401);

    const { data: keyData } = await supabase
      .from("api_keys")
      .select("id, workspace_id")
      .eq("public_key", apiKey)
      .eq("status", "active")
      .maybeSingle();
    if (!keyData) return jsonResponse({ error: "Invalid API key" }, 401);

    // ───── 2. Validação de payload ─────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const rawClickId = String(body.click_id ?? "").trim();
    const refFallback = extractRef(String(body.ref ?? body.message ?? body.text ?? ""));
    const clickId = (rawClickId.match(CLICK_ID_REGEX)?.[0]) || refFallback;

    if (!clickId) {
      return jsonResponse(
        { error: "click_id required (formato CT-XXXXXX) ou ref/message contendo CT-XXXXXX" },
        400,
      );
    }

    const value = Number(body.value ?? 0);
    if (!Number.isFinite(value) || value < 0) {
      return jsonResponse({ error: "value must be a non-negative number" }, 400);
    }

    const currency = String(body.currency ?? "BRL").toUpperCase().slice(0, 3);
    const sourceInput = String(body.source ?? "webhook") as ConversionSource;
    const source: ConversionSource = VALID_SOURCES.includes(sourceInput)
      ? sourceInput
      : "webhook";

    const eventId = buildEventId(clickId);

    // ───── 3. Lookup do clique original (atribuição) ─────
    const { data: click } = await supabase
      .from("whatsapp_clicks")
      .select("*")
      .eq("workspace_id", keyData.workspace_id)
      .eq("click_id", clickId)
      .maybeSingle();

    if (!click) {
      return jsonResponse({ error: "click_id not found in workspace", click_id: clickId }, 404);
    }

    // ───── 4. Idempotência: pre-check por event_id ─────
    const { data: existing } = await supabase
      .from("whatsapp_conversions")
      .select("id, value, currency, source, created_at")
      .eq("workspace_id", keyData.workspace_id)
      .eq("event_id", eventId)
      .maybeSingle();

    if (existing) {
      return jsonResponse(
        {
          ok: true,
          already_converted: true,
          conversion_id: existing.id,
          click_id: clickId,
          event_id: eventId,
          previous: {
            value: existing.value,
            currency: existing.currency,
            source: existing.source,
            created_at: existing.created_at,
          },
        },
        200,
      );
    }

    // ───── 5. Insert protegido pelo UNIQUE (workspace_id, event_id) ─────
    const { data: inserted, error: insertErr } = await supabase
      .from("whatsapp_conversions")
      .insert({
        workspace_id: keyData.workspace_id,
        click_id: clickId,
        click_uuid: click.id,
        value,
        currency,
        source,
        event_id: eventId,
        notes: body.notes ? String(body.notes).slice(0, 500) : null,
      })
      .select("id")
      .single();

    if (insertErr) {
      // Race condition: outra fonte inseriu entre o pre-check e o insert.
      if ((insertErr as { code?: string }).code === "23505") {
        const { data: race } = await supabase
          .from("whatsapp_conversions")
          .select("id")
          .eq("workspace_id", keyData.workspace_id)
          .eq("event_id", eventId)
          .maybeSingle();
        return jsonResponse(
          {
            ok: true,
            already_converted: true,
            conversion_id: race?.id,
            click_id: clickId,
            event_id: eventId,
            race_resolved: true,
          },
          200,
        );
      }
      console.error("whatsapp_conversions insert error", insertErr);
      return jsonResponse({ error: "Failed to record conversion" }, 500);
    }

    // Marca o clique como convertido (não-fatal se falhar)
    await supabase
      .from("whatsapp_clicks")
      .update({ status: "converted" })
      .eq("id", click.id);

    // ───── 6. Dispara Purchase via /track (Meta CAPI + Google Ads + GA4 + TikTok) ─────
    // event_id idêntico ao gravado em whatsapp_conversions → dedup global.
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
        event_subtype: "whatsapp_purchase",
      },
    };

    fetch(`${SUPABASE_URL}/functions/v1/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(trackPayload),
    }).catch((e) => console.error("track forward error", e));

    return jsonResponse(
      {
        ok: true,
        conversion_id: inserted.id,
        click_id: clickId,
        event_id: eventId,
        event_name: "whatsapp_purchase",
        value,
        currency,
        source,
        attribution: {
          utm_source: click.utm_source,
          utm_campaign: click.utm_campaign,
          gclid: click.gclid,
          fbclid: click.fbclid,
        },
      },
      200,
    );
  } catch (err) {
    console.error("whatsapp-conversion error:", err);
    return jsonResponse({ error: "Invalid request" }, 400);
  }
});
