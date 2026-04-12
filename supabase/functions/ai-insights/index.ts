import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Gather data in parallel
    const [
      { count: events24h },
      { count: events7d },
      { data: recentConversions },
      { data: olderConversions },
      { data: predictions },
      { data: anomalies },
      { count: queueFailed },
      { count: dlqCount },
    ] = await Promise.all([
      supabase.from("events").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id).gte("created_at", oneDayAgo.toISOString()),
      supabase.from("events").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id).gte("created_at", sevenDaysAgo.toISOString()),
      supabase.from("conversions").select("*")
        .eq("workspace_id", workspace_id).gte("happened_at", sevenDaysAgo.toISOString()).limit(500),
      supabase.from("conversions").select("*")
        .eq("workspace_id", workspace_id).gte("happened_at", fourteenDaysAgo.toISOString())
        .lt("happened_at", sevenDaysAgo.toISOString()).limit(500),
      supabase.from("prediction_results").select("*")
        .eq("workspace_id", workspace_id).limit(100),
      supabase.from("anomaly_alerts").select("*")
        .eq("workspace_id", workspace_id).eq("acknowledged", false).limit(20),
      supabase.from("event_queue").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id).eq("status", "failed"),
      supabase.from("dead_letter_events").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id),
    ]);

    // Build context for AI
    const recentRevenue = (recentConversions || []).reduce((a, c) => a + Number(c.value || 0), 0);
    const olderRevenue = (olderConversions || []).reduce((a, c) => a + Number(c.value || 0), 0);
    const revenueChange = olderRevenue > 0 ? ((recentRevenue - olderRevenue) / olderRevenue * 100) : 0;

    // Channel breakdown (recent)
    const channelMap = new Map<string, { conversions: number; revenue: number }>();
    for (const c of (recentConversions || [])) {
      const ch = c.attributed_source || "Direct";
      const s = channelMap.get(ch) || { conversions: 0, revenue: 0 };
      s.conversions++;
      s.revenue += Number(c.value || 0);
      channelMap.set(ch, s);
    }

    // Older channel for comparison
    const olderChannelMap = new Map<string, { conversions: number; revenue: number }>();
    for (const c of (olderConversions || [])) {
      const ch = c.attributed_source || "Direct";
      const s = olderChannelMap.get(ch) || { conversions: 0, revenue: 0 };
      s.conversions++;
      s.revenue += Number(c.value || 0);
      olderChannelMap.set(ch, s);
    }

    // Generate channel insights
    const channelInsights: string[] = [];
    for (const [ch, curr] of channelMap) {
      const prev = olderChannelMap.get(ch);
      if (prev && prev.revenue > 0) {
        const change = ((curr.revenue - prev.revenue) / prev.revenue * 100);
        if (Math.abs(change) > 15) {
          channelInsights.push(`${ch}: ${change > 0 ? '+' : ''}${change.toFixed(0)}% receita (${curr.conversions} conv vs ${prev.conversions})`);
        }
      }
    }

    // Build prediction summaries
    const predSummary = (predictions || [])
      .filter(p => p.confidence > 0.5)
      .slice(0, 10)
      .map(p => `${p.channel} ${p.prediction_type}: R$${Number(p.predicted_value).toFixed(0)} (conf: ${(p.confidence * 100).toFixed(0)}%)`);

    // Build prompt for AI
    const dataContext = `
## Dados do Workspace (últimos 7 dias vs semana anterior)

### Volume
- Eventos 24h: ${events24h || 0}
- Eventos 7d: ${events7d || 0}
- Fila falhada: ${queueFailed || 0}
- Dead letter: ${dlqCount || 0}

### Receita
- Receita 7d: R$${recentRevenue.toFixed(2)}
- Receita semana anterior: R$${olderRevenue.toFixed(2)}
- Variação: ${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}%
- Conversões 7d: ${(recentConversions || []).length}

### Canais (variação semanal)
${channelInsights.length ? channelInsights.join('\n') : 'Sem variações significativas'}

### Predições ML
${predSummary.length ? predSummary.join('\n') : 'Sem predições disponíveis'}

### Anomalias Ativas
${(anomalies || []).length ? (anomalies || []).map(a => `${a.metric_name}: ${a.message}`).join('\n') : 'Nenhuma anomalia'}
`.trim();

    // Call Lovable AI for insights
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fallback: return raw data without AI analysis
      return new Response(JSON.stringify({
        insights: generateFallbackInsights(revenueChange, channelInsights, anomalies || [], queueFailed || 0, dlqCount || 0),
        data: { events24h, events7d, recentRevenue, olderRevenue, revenueChange, channels: Object.fromEntries(channelMap) },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é o CapiTrack AI Insights Engine, um analista de marketing digital especialista.
Analise os dados fornecidos e gere insights acionáveis em português.

Formato de resposta (JSON array):
[
  {
    "type": "insight|alert|optimization|prediction",
    "severity": "info|warning|critical|success",
    "title": "Título curto",
    "description": "Descrição detalhada com números",
    "action": "Ação recomendada",
    "channel": "canal relacionado ou null",
    "metric": "métrica relacionada",
    "value_change": número percentual ou null
  }
]

Regras:
- Gere 3-8 insights relevantes
- Seja específico com números
- Priorize insights acionáveis
- Inclua pelo menos 1 otimização de budget
- Se há anomalias, destaque-as
- Se há predições, interprete-as
- Linguagem profissional mas acessível`
          },
          { role: "user", content: dataContext }
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_insights",
            description: "Generate marketing insights array",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["insight", "alert", "optimization", "prediction"] },
                      severity: { type: "string", enum: ["info", "warning", "critical", "success"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      action: { type: "string" },
                      channel: { type: "string" },
                      metric: { type: "string" },
                      value_change: { type: "number" },
                    },
                    required: ["type", "severity", "title", "description", "action"],
                  },
                },
              },
              required: ["insights"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_insights" } },
      }),
    });

    if (!aiResponse.ok) {
      console.warn("AI gateway error:", aiResponse.status, "— using fallback insights");
      // Always fallback gracefully (including 402/429) so the UI never breaks
      return new Response(JSON.stringify({
        insights: generateFallbackInsights(revenueChange, channelInsights, anomalies || [], queueFailed || 0, dlqCount || 0),
        data: { events24h, events7d, recentRevenue, olderRevenue, revenueChange },
        fallback: true,
        ai_status: aiResponse.status,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    let insights: any[] = [];

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        insights = parsed.insights || [];
      }
    } catch {
      insights = generateFallbackInsights(revenueChange, channelInsights, anomalies || [], queueFailed || 0, dlqCount || 0);
    }

    return new Response(JSON.stringify({
      insights,
      data: {
        events24h: events24h || 0,
        events7d: events7d || 0,
        recentRevenue,
        olderRevenue,
        revenueChange: Math.round(revenueChange * 10) / 10,
        conversions7d: (recentConversions || []).length,
        channels: Object.fromEntries(channelMap),
        activeAnomalies: (anomalies || []).length,
        queueFailed: queueFailed || 0,
        dlqCount: dlqCount || 0,
      },
      generated_at: now.toISOString(),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("AI Insights error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateFallbackInsights(revenueChange: number, channelInsights: string[], anomalies: any[], queueFailed: number, dlqCount: number) {
  const insights: any[] = [];

  if (Math.abs(revenueChange) > 10) {
    insights.push({
      type: revenueChange > 0 ? "insight" : "alert",
      severity: revenueChange > 0 ? "success" : "warning",
      title: `Receita ${revenueChange > 0 ? 'subiu' : 'caiu'} ${Math.abs(revenueChange).toFixed(0)}%`,
      description: `A receita dos últimos 7 dias ${revenueChange > 0 ? 'cresceu' : 'diminuiu'} ${Math.abs(revenueChange).toFixed(1)}% comparado à semana anterior.`,
      action: revenueChange > 0 ? "Analise quais canais contribuíram para o crescimento" : "Investigue a causa da queda e ajuste campanhas",
      metric: "revenue",
      value_change: revenueChange,
    });
  }

  for (const ci of channelInsights.slice(0, 3)) {
    const isPositive = ci.includes('+');
    insights.push({
      type: "insight",
      severity: isPositive ? "success" : "warning",
      title: ci.split(':')[0] + (isPositive ? ' em crescimento' : ' em queda'),
      description: ci,
      action: isPositive ? "Considere aumentar orçamento neste canal" : "Revise criativos e público-alvo",
      channel: ci.split(':')[0],
      metric: "channel_performance",
    });
  }

  for (const a of anomalies.slice(0, 2)) {
    insights.push({
      type: "alert",
      severity: a.severity === "critical" ? "critical" : "warning",
      title: `Anomalia: ${a.metric_name.replace(/_/g, ' ')}`,
      description: a.message,
      action: "Investigue imediatamente",
      metric: a.metric_name,
    });
  }

  if (queueFailed > 0 || dlqCount > 0) {
    insights.push({
      type: "alert",
      severity: (queueFailed + dlqCount) > 50 ? "critical" : "warning",
      title: "Problemas no pipeline",
      description: `${queueFailed} eventos falhados na fila, ${dlqCount} na dead letter queue.`,
      action: "Acesse Queue Monitor e Event Replay para reprocessar",
      metric: "pipeline_health",
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: "insight",
      severity: "info",
      title: "Sistema operando normalmente",
      description: "Nenhuma anomalia ou variação significativa detectada.",
      action: "Continue monitorando. Configure mais integrações para dados mais ricos.",
      metric: "system_health",
    });
  }

  return insights;
}
