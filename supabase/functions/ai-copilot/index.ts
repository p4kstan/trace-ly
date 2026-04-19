import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, workspace_id } = await req.json();
    if (!messages?.length || !workspace_id) {
      return new Response(JSON.stringify({ error: "messages and workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather real-time workspace data for context
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      { count: events24h },
      { data: recentConversions },
      { data: predictions },
      { data: anomalies },
      { data: attributionResults },
      { data: hybridAttribution },
    ] = await Promise.all([
      supabase.from("events").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id).gte("created_at", oneDayAgo.toISOString()),
      supabase.from("conversions").select("*")
        .eq("workspace_id", workspace_id).gte("happened_at", sevenDaysAgo.toISOString()).limit(200),
      supabase.from("prediction_results").select("*")
        .eq("workspace_id", workspace_id).limit(50),
      supabase.from("anomaly_alerts").select("*")
        .eq("workspace_id", workspace_id).eq("acknowledged", false).limit(10),
      // P1: filter attribution_results by data-driven models only (drop heuristic noise)
      supabase.from("attribution_results")
        .select("source, medium, campaign, credit, attributed_value, model")
        .eq("workspace_id", workspace_id)
        .in("model", ["markov", "shapley", "time_decay", "data_driven"])
        .gte("created_at", sevenDaysAgo.toISOString())
        .limit(500),
      // P1: hybrid (Markov + Shapley) ensemble for high-confidence budget reallocation
      supabase.from("attribution_hybrid")
        .select("source, medium, campaign, markov_credit, shapley_credit, hybrid_credit, hybrid_value, conversion_value")
        .eq("workspace_id", workspace_id)
        .gte("created_at", sevenDaysAgo.toISOString())
        .limit(500),
    ]);

    // Build data context
    const totalRevenue = (recentConversions || []).reduce((a, c) => a + Number(c.value || 0), 0);
    const channelRevenue = new Map<string, number>();
    for (const c of (recentConversions || [])) {
      const ch = c.attributed_source || "Direct";
      channelRevenue.set(ch, (channelRevenue.get(ch) || 0) + Number(c.value || 0));
    }

    const topChannels = [...channelRevenue.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ch, rev]) => `${ch}: R$${rev.toFixed(2)}`);

    const predSummary = (predictions || [])
      .filter((p: any) => p.confidence > 0.4)
      .slice(0, 8)
      .map((p: any) => `${p.channel} ${p.prediction_type}: R$${Number(p.predicted_value).toFixed(0)} (${(p.confidence * 100).toFixed(0)}% conf)`);

    const anomalySummary = (anomalies || []).map((a: any) => `⚠️ ${a.metric_name}: ${a.message}`);

    // P1: aggregate hybrid attribution by source/campaign so the model can reason
    // about Markov vs Shapley credits and recommend budget reallocation.
    const hybridAgg = new Map<string, { markov: number; shapley: number; hybrid: number; value: number }>();
    for (const h of (hybridAttribution || []) as any[]) {
      const key = `${h.source || "Direct"} / ${h.campaign || "-"}`;
      const cur = hybridAgg.get(key) || { markov: 0, shapley: 0, hybrid: 0, value: 0 };
      cur.markov += Number(h.markov_credit || 0);
      cur.shapley += Number(h.shapley_credit || 0);
      cur.hybrid += Number(h.hybrid_credit || 0);
      cur.value += Number(h.hybrid_value || 0);
      hybridAgg.set(key, cur);
    }
    const hybridSummary = [...hybridAgg.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 10)
      .map(([k, v]) => `${k}: Markov=${v.markov.toFixed(2)}, Shapley=${v.shapley.toFixed(2)}, Hybrid=${v.hybrid.toFixed(2)}, R$${v.value.toFixed(2)}`);

    const dataContext = `
DADOS EM TEMPO REAL DO WORKSPACE:

Eventos 24h: ${events24h || 0}
Conversões 7d: ${(recentConversions || []).length}
Receita 7d: R$${totalRevenue.toFixed(2)}

Top Canais (receita 7d):
${topChannels.join('\n') || 'Sem dados'}

Predições ML:
${predSummary.join('\n') || 'Sem predições'}

Anomalias Ativas:
${anomalySummary.join('\n') || 'Nenhuma'}

Attribution data-driven (modelos: markov/shapley/time_decay/data_driven):
${(attributionResults || []).slice(0, 10).map((a: any) => `${a.source || 'Direct'}/${a.medium || '-'} (${a.campaign || '-'}): credit=${Number(a.credit).toFixed(2)}, value=R$${Number(a.attributed_value || 0).toFixed(2)} [${a.model}]`).join('\n') || 'Sem dados'}

Atribuição Híbrida (Markov + Shapley — use para realocação de orçamento):
${hybridSummary.join('\n') || 'Sem dados'}
`.trim();

    const systemPrompt = `Você é o CapiTrack AI Copilot — um assistente de marketing intelligence ultra avançado.

Você tem acesso a dados REAIS do workspace, incluindo atribuição estatística (Markov Chain + Shapley Value).

${dataContext}

REGRAS:
- Responda SEMPRE em português
- Para recomendações de ORÇAMENTO, BASEIE-SE em Markov/Shapley (atribuição híbrida) — não em last-click
- Identifique canais com baixo crédito Hybrid mas alto gasto → sugira corte/realocação
- Identifique canais com alto crédito Markov+Shapley mas baixo investimento → sugira aumento
- Seja específico com números, percentuais e valores em R$
- Se não tiver dados suficientes, diga claramente
- Formate com markdown
- Interprete predições ML quando perguntado`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("AI Copilot error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
