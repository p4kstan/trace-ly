// WhatsApp Business Cloud API webhook receiver.
// Validates the verify-token (GET handshake) and parses incoming messages,
// extracting the "CT-XXXXXX" ref to mark conversations as in-progress.
// To trigger a Purchase, the user still calls /whatsapp-conversion with value,
// or this function can be extended to auto-convert on a "fechado:R$xxx" pattern.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function extractRef(text: string): string | null {
  const m = text?.match(/CT-[A-Z2-9]{6}/);
  return m ? m[0] : null;
}
function extractValue(text: string): number | null {
  // Matches "fechado: R$ 1.234,56" / "vendido 250" / "R$ 99,90"
  const m = text?.match(/(?:fechad[oa]|vendid[oa]|R\$)\s*([\d.,]+)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  // Verify-token handshake from Meta. Use api_keys.public_key as both api key
  // (for tenant lookup) AND verify-token. Configure it in Meta as the API key.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token) {
      const { data } = await supabase
        .from("api_keys")
        .select("id")
        .eq("public_key", token)
        .eq("status", "active")
        .maybeSingle();
      if (data) return new Response(challenge || "ok", { status: 200, headers: corsHeaders });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // The api key is passed as ?key= since Meta cannot send custom headers.
    const apiKey = url.searchParams.get("key") || req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing key" }), {
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
      return new Response(JSON.stringify({ error: "Invalid key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const entries = payload?.entry || [];
    const seen: string[] = [];

    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const messages = change?.value?.messages || [];
        for (const msg of messages) {
          const text =
            msg?.text?.body ||
            msg?.button?.text ||
            msg?.interactive?.button_reply?.title ||
            msg?.interactive?.list_reply?.title ||
            "";
          const ref = extractRef(String(text));
          if (!ref) continue;
          seen.push(ref);

          // If text mentions a value, auto-convert. Otherwise, just touch.
          const val = extractValue(String(text));
          if (val && val > 0) {
            // Forward to whatsapp-conversion to keep logic centralized
            fetch(`${SUPABASE_URL}/functions/v1/whatsapp-conversion`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
              body: JSON.stringify({
                click_id: ref,
                value: val,
                source: "business_api",
                notes: `Auto from WA Business webhook: ${String(text).slice(0, 120)}`,
              }),
            }).catch((e) => console.error("forward conversion error", e));
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, refs: seen }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("whatsapp-business-webhook error:", err);
    // Always 200 to webhooks to avoid Meta retries on parse errors
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
