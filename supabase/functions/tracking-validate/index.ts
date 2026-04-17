// Validates if SDK / GTM is sending events correctly
// GET ?api_key=pk_xxx&minutes=5 → returns counts and last events
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const apiKey =
      url.searchParams.get("api_key") ||
      req.headers.get("x-api-key") ||
      "";
    const minutes = Number(url.searchParams.get("minutes") || 10);

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "api_key required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: keyRow } = await supabase
      .from("api_keys")
      .select("workspace_id")
      .eq("public_key", apiKey)
      .eq("status", "active")
      .maybeSingle();

    if (!keyRow) {
      return new Response(JSON.stringify({ error: "Invalid api_key", connected: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const { data: events } = await supabase
      .from("events")
      .select("event_name, source, action_source, received_at, page_path")
      .eq("workspace_id", keyRow.workspace_id)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(50);

    const counts: Record<string, number> = {};
    const sources: Record<string, number> = {};
    (events || []).forEach((e: any) => {
      counts[e.event_name] = (counts[e.event_name] || 0) + 1;
      const s = e.source || "unknown";
      sources[s] = (sources[s] || 0) + 1;
    });

    const hasGtm = !!sources["gtm-server"] || !!sources["dataLayer"];
    const hasSdk = !!sources["sdk"] || !!sources["web"];

    return new Response(JSON.stringify({
      connected: (events || []).length > 0,
      total: (events || []).length,
      window_minutes: minutes,
      events_by_name: counts,
      events_by_source: sources,
      detected: {
        sdk_web: hasSdk,
        gtm_server: hasGtm,
        purchase: !!counts["Purchase"] || !!counts["purchase"],
        page_view: !!counts["PageView"] || !!counts["page_view"],
      },
      latest: (events || []).slice(0, 10),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("tracking-validate error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
