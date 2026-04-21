// audit-pixel-capi
// Audits whether browser pixel events and server-side CAPI events are sharing
// the same transaction_id/order_id and whether ad platforms (Google/Meta) are
// likely deduping correctly.
//
// Returns per-workspace diagnostics:
//  - matched_pairs   : same order_id sent by BOTH pixel and a CAPI provider
//  - pixel_only      : order_id seen only via browser pixel  (CAPI didn't fire)
//  - capi_only       : order_id seen only via CAPI            (pixel didn't fire)
//  - missing_order_id: events without transaction_id/order_id (cannot dedupe)
//  - dedup_health    : 0-100 score
//
// Auth: requires service-role bearer token (called by app via supabase.functions.invoke).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CONVERSION_EVENTS = new Set([
  "Purchase", "purchase",
  "Subscribe", "subscribe",
  "Lead", "lead",
  "order_paid", "order_approved",
  "payment_paid", "payment_authorized",
  "pix_paid", "boleto_paid",
]);

function getOrderId(ev: any): string | null {
  const cd = ev.custom_data_json || {};
  const v = cd.transaction_id || cd.order_id || ev.event_id;
  return v ? String(v).trim() : null;
}

function classifySource(source: string | null): "pixel" | "capi" | "other" {
  if (!source) return "pixel"; // browser /track defaults to no source
  const s = source.toLowerCase();
  if (s.startsWith("webhook_")) return "capi";
  if (s.includes("server") || s.includes("capi")) return "capi";
  if (s.includes("browser") || s.includes("pixel") || s === "track") return "pixel";
  return "other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { workspace_id, hours = 24 } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - hours * 3600_000).toISOString();

    // Pull recent conversion events (limit 5000 — enough for audit window)
    const { data: events, error } = await supabase
      .from("events")
      .select("id, event_id, event_name, source, custom_data_json, event_time")
      .eq("workspace_id", workspace_id)
      .in("event_name", Array.from(CONVERSION_EVENTS))
      .gte("event_time", since)
      .order("event_time", { ascending: false })
      .limit(5000);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by order_id
    const byOrder = new Map<string, { pixel: any[]; capi: any[]; other: any[] }>();
    let missingOrderId = 0;

    for (const ev of (events || [])) {
      const oid = getOrderId(ev);
      if (!oid) { missingOrderId++; continue; }
      if (!byOrder.has(oid)) byOrder.set(oid, { pixel: [], capi: [], other: [] });
      byOrder.get(oid)![classifySource(ev.source)].push(ev);
    }

    let matched = 0, pixelOnly = 0, capiOnly = 0;
    const samples: any[] = [];
    const issues: any[] = [];

    for (const [oid, buckets] of byOrder) {
      const hasPixel = buckets.pixel.length > 0;
      const hasCapi = buckets.capi.length > 0;
      if (hasPixel && hasCapi) {
        matched++;
        if (samples.length < 5) {
          samples.push({
            order_id: oid,
            pixel_count: buckets.pixel.length,
            capi_count: buckets.capi.length,
            event_name: buckets.pixel[0]?.event_name || buckets.capi[0]?.event_name,
          });
        }
      } else if (hasPixel) {
        pixelOnly++;
        if (issues.length < 10) {
          issues.push({
            type: "pixel_only",
            order_id: oid,
            event_name: buckets.pixel[0]?.event_name,
            recommendation: "CAPI não disparou para esta venda — verifique webhook do gateway.",
          });
        }
      } else if (hasCapi) {
        capiOnly++;
        if (issues.length < 10) {
          issues.push({
            type: "capi_only",
            order_id: oid,
            event_name: buckets.capi[0]?.event_name,
            recommendation: "Pixel não disparou — verifique se a página de obrigado tem o tag e order_id.",
          });
        }
      }
    }

    const totalOrders = byOrder.size;
    // Health: %dos pedidos com order_id identificável + %dos pedidos com pixel+capi pareados
    const idCoverage = (events?.length || 0) > 0
      ? Math.round(((events!.length - missingOrderId) / events!.length) * 100)
      : 100;
    const pairCoverage = totalOrders > 0
      ? Math.round((matched / totalOrders) * 100)
      : 100;
    const dedupHealth = Math.round(0.4 * idCoverage + 0.6 * pairCoverage);

    // Recent dedup detections (last 24h)
    const { data: detections } = await supabase
      .from("duplicate_detections")
      .select("order_id, event_name, sources, occurrences, last_seen_at")
      .eq("workspace_id", workspace_id)
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false })
      .limit(20);

    return new Response(JSON.stringify({
      window_hours: hours,
      total_conversion_events: events?.length || 0,
      total_unique_orders: totalOrders,
      matched_pairs: matched,
      pixel_only: pixelOnly,
      capi_only: capiOnly,
      missing_order_id: missingOrderId,
      id_coverage_pct: idCoverage,
      pair_coverage_pct: pairCoverage,
      dedup_health_score: dedupHealth,
      samples,
      issues,
      recent_detections: detections || [],
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("audit-pixel-capi error:", err);
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
