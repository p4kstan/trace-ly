/**
 * google-ads-ai-optimizer — AI Co-Pilot para Google Ads.
 *
 * Modes:
 *   - mode="recommend": coleta dados via google-ads-multi-account, manda pra
 *     Lovable AI Gateway com schema estruturado e devolve recomendações.
 *   - mode="chat": chat conversacional streaming (SSE) com tool calling.
 *
 * Nota: o prompt original menciona Claude, mas o Lovable AI Gateway expõe
 * Gemini e GPT. Usamos google/gemini-2.5-pro como equivalente (forte em
 * raciocínio + tool use, sem custo extra de API key).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

const SYSTEM_PROMPT_RECOMMEND = `Você é um estrategista sênior de Google Ads analisando os dados das contas conectadas deste workspace.

TAREFA
- Analisar as contas Google Ads conectadas e suas campanhas
- Identificar: ROAS/CPA ruins, campanhas paradas, oportunidades de otimização
- Gerar recomendações estruturadas que o usuário possa aprovar para aplicar via API

FRAMEWORK
1. Account-level: quais contas estão queimando budget sem conversão?
2. Campaign-level: quais campanhas têm ROAS < 1.0 ou CPA acima do esperado, ou 0 conversões em 7+ dias?
3. Budget reallocation: aumentar onde ROAS > 3, reduzir onde ROAS < 1.5
4. Quality signals: gasto alto + CTR < 1% indica problema criativo/segmentação

REGRAS DE OUTPUT
- severity "critical": campanha perdendo dinheiro rápido (ROAS < 0.5 e gasto > R$100/dia)
- severity "high": ROAS < 1.0 sustentado
- severity "medium": oportunidade de otimização
- severity "low": melhorias menores
- SEMPRE inclua justificativa numérica em "diagnosis" (use os números reais que recebeu)
- SEMPRE especifique mutation payload exato pra google-ads-mutate
- requires_approval: SEMPRE true
- Seja específico: "Pausar Campaign X (account 123) — ROAS 0.4 em 14d, gasto R$1.847" e não "considere pausar low performers"

LIMITES
- Máximo 8 ações critical/high por resposta
- Não recomende para campanhas com < 7d de histórico
- Use a moeda da conta (BRL na maioria dos casos)
- Cite nomes exatos de campanha

MUTATION PAYLOADS suportados pelo google-ads-mutate:
- Pausar campanha: { workspace_id, customer_id, action: "update_campaign_status", campaign_id, status: "PAUSED" }
- Reativar campanha: { workspace_id, customer_id, action: "update_campaign_status", campaign_id, status: "ENABLED" }
- Mudar budget: { workspace_id, customer_id, action: "update_budget", budget_resource, budget_micros } (para isso, primeiro use get_campaign_budget)
- Negative keyword: { workspace_id, customer_id, action: "add_negative_keyword", campaign_id, keyword_text, match_type: "EXACT"|"PHRASE"|"BROAD" }

Retorne APENAS via tool call "submit_recommendations".`;

const SYSTEM_PROMPT_CHAT = `Você é um co-pilot Google Ads. Responde em PT-BR, conciso e específico.
Use as tools disponíveis pra buscar contexto antes de responder.
Se o usuário pedir uma ação destrutiva (pausar, mudar budget), explique o impacto e oriente a ir em /optimization para aprovar.`;

const RECOMMEND_TOOL = {
  type: "function",
  function: {
    name: "submit_recommendations",
    description: "Retorna o conjunto de recomendações estruturadas",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Overview de 3-4 linhas do estado das contas" },
        health_score: { type: "number", description: "0-100, saúde geral das contas" },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
              type: { type: "string", enum: ["pause", "scale_up", "scale_down", "budget_change", "bid_change", "negative_keyword", "review"] },
              target: {
                type: "object",
                properties: {
                  level: { type: "string", enum: ["account", "campaign", "adset"] },
                  account_id: { type: "string" },
                  campaign_id: { type: "string" },
                  campaign_name: { type: "string" },
                },
                required: ["level", "account_id"],
              },
              diagnosis: { type: "string" },
              action: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  mutation: { type: "object", description: "Payload pronto pra google-ads-mutate" },
                  requires_approval: { type: "boolean" },
                },
                required: ["description", "mutation", "requires_approval"],
              },
              impact_estimate: {
                type: "object",
                properties: {
                  metric: { type: "string" },
                  direction: { type: "string", enum: ["increase", "decrease"] },
                  magnitude: { type: "string", enum: ["low", "medium", "high"] },
                  explanation: { type: "string" },
                },
                required: ["metric", "direction", "magnitude", "explanation"],
              },
              confidence: { type: "number" },
            },
            required: ["severity", "type", "target", "diagnosis", "action", "impact_estimate", "confidence"],
          },
        },
      },
      required: ["summary", "health_score", "recommendations"],
    },
  },
};

const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_account_overview",
      description: "Retorna métricas agregadas de todas as contas Google Ads do workspace",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["7d", "14d", "30d", "90d"] } },
        required: ["period"],
      },
    },
  },
];

async function fetchOverview(workspace_id: string, period: string, authHeader: string) {
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const r = await fetch(`${supaUrl}/functions/v1/google-ads-multi-account`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_id, period }),
  });
  return await r.json();
}

async function logUsage(service: any, workspace_id: string, fn: string, usage: any) {
  if (!usage) return;
  try {
    await service.from("ai_usage_log").insert({
      workspace_id,
      function_name: fn,
      tokens_input: usage.prompt_tokens ?? null,
      tokens_output: usage.completion_tokens ?? null,
    });
  } catch (_) { /* */ }
}

function withSafeMutation(rec: any, workspaceId: string) {
  const mutation = rec?.action?.mutation && Object.keys(rec.action.mutation).length > 0 ? rec.action.mutation : null;
  if (mutation) return rec;

  const target = rec?.target || {};
  let fallback: Record<string, unknown> | null = null;
  if (rec?.type === "pause" && target.account_id && target.campaign_id) {
    fallback = { workspace_id: workspaceId, customer_id: target.account_id, action: "update_campaign_status", campaign_id: target.campaign_id, status: "PAUSED" };
  }
  if (!fallback) return { ...rec, type: "review" };
  return { ...rec, action: { ...rec.action, mutation: fallback } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const { mode, workspace_id, period = "30d", messages = [] } = body || {};
    if (!workspace_id) return json({ error: "workspace_id required" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    if (mode === "recommend") {
      // Daily cap: 50 recommendation calls / workspace
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await service
        .from("ai_usage_log")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id)
        .eq("function_name", "google-ads-ai-optimizer:recommend")
        .gte("created_at", since);
      if ((count ?? 0) >= 50) {
        return json({ error: "Daily AI recommendation cap reached (50/day)" }, 429);
      }

      const overview = await fetchOverview(workspace_id, period, authHeader);
      if (!overview?.ok) return json({ error: "Failed to fetch Google Ads overview", detail: overview }, 502);

      const dataContext = JSON.stringify({
        period,
        totals: overview.totals,
        accounts: overview.accounts,
        top_campaigns: overview.top_campaigns,
      }, null, 2);

      const aiRes = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT_RECOMMEND },
            { role: "user", content: `Dados das contas (período ${period}):\n\n${dataContext}\n\nGere recomendações via tool submit_recommendations.` },
          ],
          tools: [RECOMMEND_TOOL],
          tool_choice: { type: "function", function: { name: "submit_recommendations" } },
        }),
      });

      if (aiRes.status === 429) return json({ error: "AI rate limit, tente novamente em alguns segundos" }, 429);
      if (aiRes.status === 402) return json({ error: "Créditos AI esgotados — adicione créditos no workspace" }, 402);
      if (!aiRes.ok) {
        const t = await aiRes.text();
        console.error("AI gateway error", aiRes.status, t);
        return json({ error: "AI gateway error", detail: t.slice(0, 500) }, 502);
      }

      const aiJson = await aiRes.json();
      logUsage(service, workspace_id, "google-ads-ai-optimizer:recommend", aiJson.usage);

      const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) return json({ error: "AI did not return structured recommendations", raw: aiJson.choices?.[0]?.message }, 502);

      let parsed: any;
      try { parsed = JSON.parse(toolCall.function.arguments); }
      catch { return json({ error: "Failed to parse AI response", raw: toolCall.function.arguments }, 502); }

      // Add UUIDs to each recommendation
      const recommendations = (parsed.recommendations || []).map((r: any) => ({
        ...withSafeMutation(r, workspace_id),
        id: crypto.randomUUID(),
      }));

      return json({
        ok: true,
        summary: parsed.summary || "",
        health_score: parsed.health_score ?? 50,
        recommendations,
        generated_at: new Date().toISOString(),
        period,
      });
    }

    if (mode === "chat") {
      // Inject context, then loop tool-call resolution. Non-streaming for simplicity.
      const overview = await fetchOverview(workspace_id, period, authHeader);
      const ctx = overview?.ok
        ? `Contexto Google Ads (período ${period}):\nContas: ${overview.accounts?.length || 0}\nGasto total: R$${(overview.totals?.cost || 0).toFixed(2)}\nConversões: ${(overview.totals?.conversions || 0).toFixed(0)}\nROAS médio: ${(overview.totals?.roas || 0).toFixed(2)}`
        : "Contexto Google Ads indisponível.";

      const convo: any[] = [
        { role: "system", content: `${SYSTEM_PROMPT_CHAT}\n\n${ctx}` },
        ...messages,
      ];

      // Up to 3 tool-call iterations
      for (let i = 0; i < 3; i++) {
        const aiRes = await fetch(AI_GATEWAY, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: MODEL, messages: convo, tools: CHAT_TOOLS }),
        });
        if (aiRes.status === 429) return json({ error: "AI rate limit" }, 429);
        if (aiRes.status === 402) return json({ error: "Créditos AI esgotados" }, 402);
        if (!aiRes.ok) {
          const t = await aiRes.text();
          return json({ error: "AI gateway error", detail: t.slice(0, 500) }, 502);
        }
        const j = await aiRes.json();
        logUsage(service, workspace_id, "google-ads-ai-optimizer:chat", j.usage);
        const msg = j.choices?.[0]?.message;
        if (!msg) return json({ error: "Empty AI response" }, 502);
        convo.push(msg);

        const toolCalls = msg.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          return json({ ok: true, content: msg.content || "" });
        }
        for (const tc of toolCalls) {
          let result: any = { error: "unknown_tool" };
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            if (tc.function.name === "get_account_overview") {
              result = await fetchOverview(workspace_id, args.period || "30d", authHeader);
            }
          } catch (e) { result = { error: String(e) }; }
          convo.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, 8000),
          });
        }
      }
      return json({ ok: true, content: "Não consegui completar a análise (limite de iterações)." });
    }

    return json({ error: "invalid mode (use 'recommend' or 'chat')" }, 400);
  } catch (e) {
    console.error("google-ads-ai-optimizer error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
