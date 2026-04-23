// Edge function: tracking-debug
// Valida em tempo real se sessions/orders estão salvando gclid/gbraid/wbraid
// e simula o fallback do google-ads-capi por session_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspace_id");
    const sessionId = url.searchParams.get("session_id");
    const orderId = url.searchParams.get("order_id");

    if (!workspaceId) {
      return json({ error: "workspace_id is required" }, 400);
    }

    const report: Record<string, unknown> = {
      workspace_id: workspaceId,
      generated_at: new Date().toISOString(),
    };

    // 1) últimas sessions
    const { data: lastSessions } = await supabase
      .from("sessions")
      .select("id, created_at, gclid, gbraid, wbraid, utm_source, utm_campaign, landing_page")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);

    const sessionStats = aggregate(lastSessions || [], ["gclid", "gbraid", "wbraid", "utm_source"]);
    report.sessions = {
      sample: lastSessions || [],
      stats: sessionStats,
      total_sampled: (lastSessions || []).length,
    };

    // 2) últimas orders
    const { data: lastOrders } = await supabase
      .from("orders")
      .select(
        "id, created_at, gateway, gateway_order_id, status, total_value, currency, gclid, gbraid, wbraid, utm_source, utm_campaign, customer_email, customer_phone, customer_document, session_id",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);

    const orderStats = aggregate(lastOrders || [], [
      "gclid",
      "gbraid",
      "wbraid",
      "utm_source",
      "customer_email",
      "customer_phone",
    ]);
    report.orders = {
      sample: lastOrders || [],
      stats: orderStats,
      total_sampled: (lastOrders || []).length,
    };

    // 3) Simulação do fallback usado pelo google-ads-capi
    let fallbackTarget = sessionId;
    if (!fallbackTarget && orderId) {
      const { data: o } = await supabase
        .from("orders")
        .select("session_id")
        .eq("workspace_id", workspaceId)
        .eq("id", orderId)
        .maybeSingle();
      fallbackTarget = o?.session_id ?? null;
    }
    if (!fallbackTarget && lastOrders?.length) {
      fallbackTarget = lastOrders.find((o) => o.session_id)?.session_id ?? null;
    }

    if (fallbackTarget) {
      const { data: sess, error: sessErr } = await supabase
        .from("sessions")
        .select("id, gclid, gbraid, wbraid, utm_source, utm_campaign")
        .eq("workspace_id", workspaceId)
        .eq("id", fallbackTarget)
        .maybeSingle();

      report.capi_fallback_simulation = {
        session_id_used: fallbackTarget,
        session_found: !!sess,
        recovered: sess
          ? {
              gclid: sess.gclid ?? null,
              gbraid: sess.gbraid ?? null,
              wbraid: sess.wbraid ?? null,
              utm_source: sess.utm_source ?? null,
              utm_campaign: sess.utm_campaign ?? null,
            }
          : null,
        error: sessErr?.message ?? null,
      };
    } else {
      report.capi_fallback_simulation = {
        skipped: true,
        reason: "no session_id available to test fallback",
      };
    }

    // 4) últimas entregas para google_ads
    const { data: deliveries } = await supabase
      .from("event_deliveries")
      .select("id, created_at, status, destination, error_message, request_json, response_json")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_ads")
      .order("created_at", { ascending: false })
      .limit(10);

    const deliveryStats = (deliveries || []).reduce(
      (acc, d) => {
        acc.total++;
        const req = (d.request_json ?? {}) as Record<string, unknown>;
        const conv = Array.isArray((req as { conversions?: unknown[] }).conversions)
          ? ((req as { conversions: Record<string, unknown>[] }).conversions[0] ?? {})
          : (req as Record<string, unknown>);
        if (conv.gclid) acc.with_gclid++;
        if (conv.gbraid) acc.with_gbraid++;
        if (conv.wbraid) acc.with_wbraid++;
        const ui = (conv.user_identifiers ?? conv.userIdentifiers) as
          | Record<string, unknown>[]
          | undefined;
        if (Array.isArray(ui) && ui.length) acc.with_user_identifiers++;
        if (d.status === "delivered") acc.delivered++;
        if (d.status === "failed") acc.failed++;
        return acc;
      },
      {
        total: 0,
        delivered: 0,
        failed: 0,
        with_gclid: 0,
        with_gbraid: 0,
        with_wbraid: 0,
        with_user_identifiers: 0,
      },
    );

    report.google_ads_deliveries = {
      sample: deliveries || [],
      stats: deliveryStats,
    };

    // 5) Diagnóstico final
    const diagnostics: string[] = [];
    if (sessionStats.gclid_pct === 0 && sessionStats.utm_source_pct === 0) {
      diagnostics.push("⚠️ Nenhuma session recente tem gclid/utm — verifique se o SDK está capturando.");
    }
    if (orderStats.gclid_pct === 0 && (lastOrders?.length ?? 0) > 0) {
      diagnostics.push(
        "⚠️ Nenhum pedido recente tem gclid — propagação do checkout falhou ou metadata não chega no webhook.",
      );
    }
    if (deliveryStats.failed > deliveryStats.delivered && deliveryStats.total > 0) {
      diagnostics.push("🔴 Mais entregas falhando do que entregues no Google Ads — verifique tipo da Conversion Action.");
    }
    if (
      deliveryStats.total > 0 &&
      deliveryStats.with_gclid === 0 &&
      deliveryStats.with_gbraid === 0 &&
      deliveryStats.with_wbraid === 0
    ) {
      diagnostics.push("🔴 Nenhuma entrega para Google Ads contém gclid/gbraid/wbraid no payload.");
    }
    if (diagnostics.length === 0) {
      diagnostics.push("✅ Fluxo aparenta saudável.");
    }
    report.diagnostics = diagnostics;

    return json(report);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function aggregate(rows: Record<string, unknown>[], fields: string[]) {
  const total = rows.length || 1;
  const out: Record<string, number> = {};
  for (const f of fields) {
    const filled = rows.filter((r) => r[f] != null && r[f] !== "").length;
    out[`${f}_filled`] = filled;
    out[`${f}_pct`] = Math.round((filled / total) * 100);
  }
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
