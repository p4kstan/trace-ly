// meta-emq-diagnostics
// Calcula a cobertura de cada parâmetro CAPI por pixel/destino Meta para
// estimar o EMQ (Event Match Quality) e gerar checklist de melhorias.
//
// Auth: requer JWT válido + workspace_id no body. Caller deve ser membro.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Pesos aproximados que a Meta atribui a cada parâmetro de matching
// (heurística pública — docs oficiais não publicam o peso exato, mas
// estes valores refletem o ranking de impacto conhecido em EMQ ≥ 8.0).
const PARAM_WEIGHTS: Record<string, number> = {
  em: 1.0,            // email — maior peso individual
  ph: 0.9,            // phone — quase tão forte quanto email
  external_id: 0.7,   // external_id (user id próprio do site)
  fbp: 0.6,           // _fbp cookie do Pixel
  fbc: 0.6,           // _fbc cookie (clique no anúncio)
  fn: 0.4,            // first name
  ln: 0.4,            // last name
  ct: 0.3,            // city
  st: 0.3,            // state
  zp: 0.3,            // zip
  country: 0.3,       // country
  client_ip_address: 0.4,
  client_user_agent: 0.4,
};

const MAX_SCORE = Object.values(PARAM_WEIGHTS).reduce((a, b) => a + b, 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth: validar JWT do chamador
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData } = await supabase.auth.getUser(jwt);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workspace_id, hours = 168 } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confere membership
    const { data: isMember } = await supabase.rpc("is_workspace_member", {
      _user_id: userData.user.id, _workspace_id: workspace_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - hours * 3600_000).toISOString();

    // Pixels ativos (legacy + ad_accounts) e suas entregas Meta recentes
    const [pixRes, accRes] = await Promise.all([
      supabase.from("meta_pixels")
        .select("id, pixel_id, name")
        .eq("workspace_id", workspace_id)
        .eq("is_active", true),
      supabase.from("meta_ad_accounts")
        .select("id, pixel_id, ad_account_id, label")
        .eq("workspace_id", workspace_id)
        .eq("status", "connected"),
    ]);

    const pixelMap = new Map<string, { name: string; sources: string[] }>();
    for (const p of (pixRes.data || []) as any[]) {
      pixelMap.set(p.pixel_id, { name: p.name || p.pixel_id, sources: ["pixel"] });
    }
    for (const a of (accRes.data || []) as any[]) {
      if (!a.pixel_id) continue;
      const existing = pixelMap.get(a.pixel_id);
      if (existing) existing.sources.push("ad_account");
      else pixelMap.set(a.pixel_id, { name: a.label || a.pixel_id, sources: ["ad_account"] });
    }

    // Buscar deliveries Meta recentes com seus eventos para inspecionar user_data
    const { data: deliveries } = await supabase
      .from("event_deliveries")
      .select("event_id, destination, status, request_json, last_attempt_at")
      .eq("workspace_id", workspace_id)
      .eq("provider", "meta")
      .gte("last_attempt_at", since)
      .order("last_attempt_at", { ascending: false })
      .limit(2000);

    const eventIds = Array.from(new Set((deliveries || []).map((d: any) => d.event_id).filter(Boolean)));

    // Eventos + sessions + identities
    const { data: events } = await supabase
      .from("events")
      .select("id, identity_id, user_data_json, custom_data_json, event_name, event_source_url")
      .in("id", eventIds.slice(0, 2000));

    const identityIds = Array.from(new Set((events || []).map((e: any) => e.identity_id).filter(Boolean)));
    const [{ data: identities }, { data: sessions }] = await Promise.all([
      supabase.from("identities").select("id, email_hash, phone_hash, external_id").in("id", identityIds),
      supabase.from("sessions").select("identity_id, fbp, fbc, client_ip, user_agent").in("identity_id", identityIds),
    ]);
    const identityMap = new Map((identities || []).map((i: any) => [i.id, i]));
    const sessionMap = new Map((sessions || []).map((s: any) => [s.identity_id, s]));

    // Agregar por pixel
    const pixelStats = new Map<string, {
      pixel_id: string;
      name: string;
      sources: string[];
      total: number;
      delivered: number;
      failed: number;
      params: Record<string, number>;
    }>();

    const eventById = new Map((events || []).map((e: any) => [e.id, e]));

    for (const d of (deliveries || []) as any[]) {
      const pid = d.destination;
      if (!pid) continue;
      let stat = pixelStats.get(pid);
      if (!stat) {
        const meta = pixelMap.get(pid);
        stat = {
          pixel_id: pid,
          name: meta?.name || pid,
          sources: meta?.sources || ["unknown"],
          total: 0, delivered: 0, failed: 0,
          params: Object.fromEntries(Object.keys(PARAM_WEIGHTS).map(k => [k, 0])),
        };
        pixelStats.set(pid, stat);
      }
      stat.total++;
      if (d.status === "delivered") stat.delivered++;
      else if (d.status === "failed") stat.failed++;

      const ev = eventById.get(d.event_id);
      if (!ev) continue;
      const ud = ev.user_data_json || {};
      const id = ev.identity_id ? identityMap.get(ev.identity_id) : null;
      const sess = ev.identity_id ? sessionMap.get(ev.identity_id) : null;

      if (id?.email_hash || ud.email || ud.em) stat.params.em++;
      if (id?.phone_hash || ud.phone || ud.ph) stat.params.ph++;
      if (id?.external_id || ud.external_id) stat.params.external_id++;
      if (sess?.fbp || ud.fbp) stat.params.fbp++;
      if (sess?.fbc || ud.fbc || ud.fbclid) stat.params.fbc++;
      if (ud.first_name || ud.fn) stat.params.fn++;
      if (ud.last_name || ud.ln) stat.params.ln++;
      if (ud.city || ud.ct) stat.params.ct++;
      if (ud.state || ud.st) stat.params.st++;
      if (ud.zip || ud.zp) stat.params.zp++;
      if (ud.country) stat.params.country++;
      if (sess?.client_ip || ud.client_ip) stat.params.client_ip_address++;
      if (sess?.user_agent || ud.client_user_agent) stat.params.client_user_agent++;
    }

    // Calcular EMQ estimado e checklist por pixel
    const result = Array.from(pixelStats.values()).map((s) => {
      const coverage: Record<string, number> = {};
      let weightedScore = 0;
      for (const [k, w] of Object.entries(PARAM_WEIGHTS)) {
        const pct = s.total > 0 ? (s.params[k] / s.total) : 0;
        coverage[k] = Math.round(pct * 100);
        weightedScore += pct * w;
      }
      // EMQ Meta: escala 0-10. Mapeamos cobertura ponderada → 0-10.
      const emqEstimate = Math.round((weightedScore / MAX_SCORE) * 100) / 10;

      const checklist: Array<{ param: string; status: "ok" | "warn" | "missing"; pct: number; advice: string }> = [];
      const advicePT: Record<string, string> = {
        em: "Capturar email do checkout/login e enviar como user_data.email (CapiTrack faz hash automaticamente).",
        ph: "Capturar telefone do checkout (com DDI 55 para Brasil).",
        external_id: "Enviar um ID único do seu site (user_id do CRM, customer_id) via capitrack('identify', { external_id }).",
        fbp: "Garanta que o Pixel base do Meta esteja instalado em todas as páginas (gera _fbp cookie).",
        fbc: "Garanta que campanhas do Meta tragam fbclid intacto na URL (sem strippers de UTM).",
        fn: "Capturar primeiro nome do checkout e enviar em user_data.first_name.",
        ln: "Capturar sobrenome do checkout e enviar em user_data.last_name.",
        ct: "Capturar cidade do checkout (sem espaços, lowercase).",
        st: "Capturar UF/estado do checkout (formato 2 letras).",
        zp: "Capturar CEP do checkout (apenas dígitos, primeiros 5 já contam).",
        country: "Capturar país (BR, US — código ISO 2 letras).",
        client_ip_address: "Já é capturado automaticamente pelo CapiTrack (header da requisição).",
        client_user_agent: "Já é capturado automaticamente pelo CapiTrack (header da requisição).",
      };
      for (const [param, pct] of Object.entries(coverage)) {
        const status = pct >= 80 ? "ok" : pct >= 30 ? "warn" : "missing";
        checklist.push({ param, status, pct, advice: advicePT[param] || "" });
      }
      checklist.sort((a, b) => (PARAM_WEIGHTS[b.param] - PARAM_WEIGHTS[a.param]));

      return {
        pixel_id: s.pixel_id,
        pixel_name: s.name,
        sources: s.sources,
        events_total: s.total,
        events_delivered: s.delivered,
        events_failed: s.failed,
        delivery_rate_pct: s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0,
        emq_estimate: emqEstimate,
        emq_grade: emqEstimate >= 8 ? "Excelente" : emqEstimate >= 6 ? "Bom" : emqEstimate >= 4 ? "Médio" : "Fraco",
        coverage,
        checklist,
      };
    }).sort((a, b) => b.events_total - a.events_total);

    return new Response(JSON.stringify({
      window_hours: hours,
      pixels: result,
      total_pixels: result.length,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("meta-emq-diagnostics error:", err);
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
