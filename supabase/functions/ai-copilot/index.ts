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
    ] = await Promise.all([
      supabase.from("events").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id).gte("created_at", oneDayAgo.toISOString()),
      supabase.from("conversions").select("*")
        .eq("workspace_id", workspace_id).gte("happened_at", sevenDaysAgo.toISOString()).limit(200),
      supabase.from("prediction_results").select("*")
        .eq("workspace_id", workspace_id).limit(50),
      supabase.from("anomaly_alerts").select("*")
        .eq("workspace_id", workspace_id).eq("acknowledged", false).limit(10),
      supabase.from("attribution_results").select("source, medium, campaign, credit, attributed_value, model")
        .eq("workspace_id", workspace_id).limit(200),
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
      .filter(p => p.confidence > 0.4)
      .slice(0, 8)
      .map(p => `${p.channel} ${p.prediction_type}: R$${Number(p.predicted_value).toFixed(0)} (${(p.confidence * 100).toFixed(0)}% conf)`);

    const anomalySummary = (anomalies || []).map(a => `⚠️ ${a.metric_name}: ${a.message}`);

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

Attribution (top sources):
${(attributionResults || []).slice(0, 10).map(a => `${a.source || 'Direct'}/${a.medium || '-'}: credit=${a.credit}, value=R$${Number(a.attributed_value || 0).toFixed(2)} (${a.model})`).join('\n') || 'Sem dados'}
`.trim();

    const systemPrompt = `Você é o CapiTrack AI Copilot — um assistente de marketing intelligence ultra avançado.

Você tem acesso a dados REAIS do workspace do usuário. Use-os para responder com precisão.

${dataContext}

REGRAS:
- Responda SEMPRE em português
- Use dados reais para fundamentar respostas
- Seja específico com números e percentuais
- Quando sugerir ações, seja prático e direto
- Se não tiver dados suficientes, diga claramente
- Formate com markdown para melhor leitura
- Mencione canais, valores e tendências reais
- Sugira otimizações de budget quando relevante
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
