/**
 * meta-ads-ai-optimizer — AI Co-Pilot para Meta Ads (Facebook + Instagram).
 * Espelha google-ads-ai-optimizer. Usa meta-ads-multi-account como contexto.
 *
 * Modes:
 *   - "recommend": gera recomendações estruturadas
 *   - "chat": chat conversacional (não-streaming)
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

const SYSTEM_PROMPT_RECOMMEND = `Você é um senior media buyer de Meta Ads (Facebook + Instagram) analisando dados de performance deste workspace.

FRAMEWORK DE ANÁLISE
1. CREATIVE FATIGUE: frequency > 4 + queda de CTR > 30% em 7d → swap creative
2. AUDIENCE HEALTH: CPM > 1.5x média da conta + CTR < 0.5% → problema de audiência (broaden / nova lookalike)
3. LEARNING PHASE: < 50 conversões/semana por adset → NÃO TOCAR (Meta precisa de dados)
4. KILL CANDIDATES: spend > R$50 + 0 purchase em 7d → pausar
5. SCALE WINDOWS: ROAS > 3.5 sustentado 14d + budget < R$100/d → escalar +20%
6. BUDGET REBALANCE: shift de adsets ROAS < 1.5 para adsets ROAS > 2.5
7. PLACEMENT: Audience Network puxando spend com baixo CTR → recomendar exclude

SEVERITY
- critical: queimando rápido (spend > R$200/d + ROAS < 0.5)
- high: precisa revisão essa semana (ROAS < 1.0 OU creative fatigue clara)
- medium: oportunidade de otimização (rebalance, scale)
- low: nice-to-have

REGRAS
- SEMPRE cite nomes exatos de campanha/adset em PT-BR
- SEMPRE inclua números reais (frequency, CTR, ROAS) no diagnosis
- SEMPRE requires_approval: true
- NÃO recomende pausar adset em learning phase
- Use moeda da conta (BRL na maioria)
- Máximo 8 ações critical/high

MUTATION PAYLOADS suportados pelo meta-ads-mutate:
- Pausar campanha: { workspace_id, account_id, action: "update_campaign_status", campaign_id, status: "PAUSED" }
- Reativar campanha: { workspace_id, account_id, action: "update_campaign_status", campaign_id, status: "ACTIVE" }
- Pausar adset: { workspace_id, account_id, action: "update_adset_status", adset_id, status: "PAUSED" }
- Reativar adset: { workspace_id, account_id, action: "update_adset_status", adset_id, status: "ACTIVE" }
- Mudar budget campanha: { workspace_id, account_id, action: "update_campaign_budget", campaign_id, daily_budget_brl }
- Mudar budget adset: { workspace_id, account_id, action: "update_adset_budget", adset_id, daily_budget_brl }

Retorne APENAS via tool call "submit_recommendations".`;

const SYSTEM_PROMPT_CHAT = `Você é um co-pilot Meta Ads. Responde em PT-BR, conciso e específico.
Para ações destrutivas, oriente o usuário a aprovar em /optimization.`;

const RECOMMEND_TOOL = {
  type: "function",
  function: {
    name: "submit_recommendations",
    description: "Retorna recomendações estruturadas Meta Ads",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Overview de 3-4 linhas" },
        health_score: { type: "number", description: "0-100" },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
              type: { type: "string", enum: ["pause_campaign", "pause_adset", "scale_up", "scale_down", "budget_change", "creative_swap", "audience_review", "review"] },
              target: {
                type: "object",
                properties: {
                  level: { type: "string", enum: ["account", "campaign", "adset", "ad"] },
                  account_id: { type: "string" },
                  campaign_id: { type: "string" },
                  campaign_name: { type: "string" },
                  adset_id: { type: "string" },
                  adset_name: { type: "string" },
                  ad_id: { type: "string" },
                },
                required: ["level", "account_id"],
              },
              diagnosis: { type: "string" },
              action: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  mutation: { type: "object", description: "Payload pronto para meta-ads-mutate" },
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
      description: "Retorna métricas agregadas das contas Meta Ads do workspace",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["7d", "14d", "30d", "90d"] } },
        required: ["period"],
      },
    },
  },
];

async function fetchMetaOverview(workspace_id: string, period: string, authHeader: string) {
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const r = await fetch(`${supaUrl}/functions/v1/meta-ads-multi-account`, {
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
  if (rec?.type === "pause_campaign" && target.account_id && target.campaign_id) {
    fallback = { workspace_id: workspaceId, account_id: target.account_id, action: "update_campaign_status", campaign_id: target.campaign_id, status: "PAUSED" };
  } else if (rec?.type === "pause_adset" && target.account_id && target.adset_id) {
    fallback = { workspace_id: workspaceId, account_id: target.account_id, action: "update_adset_status", adset_id: target.adset_id, status: "PAUSED" };
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
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await service
        .from("ai_usage_log")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id)
        .eq("function_name", "meta-ads-ai-optimizer:recommend")
        .gte("created_at", since);
      if ((count ?? 0) >= 50) {
        return json({ error: "Daily AI recommendation cap reached (50/day)" }, 429);
      }

      const overview = await fetchMetaOverview(workspace_id, period, authHeader);
      if (!overview?.ok) return json({ error: "Failed to fetch Meta Ads overview", detail: overview }, 502);

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
            { role: "user", content: `Dados Meta Ads (período ${period}):\n\n${dataContext}\n\nGere recomendações via tool submit_recommendations.` },
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
      logUsage(service, workspace_id, "meta-ads-ai-optimizer:recommend", aiJson.usage);

      const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) return json({ error: "AI did not return structured recommendations", raw: aiJson.choices?.[0]?.message }, 502);

      let parsed: any;
      try { parsed = JSON.parse(toolCall.function.arguments); }
      catch { return json({ error: "Failed to parse AI response", raw: toolCall.function.arguments }, 502); }

      const recommendations = (parsed.recommendations || []).map((r: any) => ({
        ...withSafeMutation(r, workspace_id),
        id: crypto.randomUUID(),
      }));

      return json({
        ok: true,
        platform: "meta",
        summary: parsed.summary || "",
        health_score: parsed.health_score ?? 50,
        recommendations,
        generated_at: new Date().toISOString(),
        period,
      });
    }

    if (mode === "chat") {
      const overview = await fetchMetaOverview(workspace_id, period, authHeader);
      const ctx = overview?.ok
        ? `Contexto Meta Ads (período ${period}):\nContas: ${overview.accounts?.length || 0}\nGasto total: R$${(overview.totals?.spend || 0).toFixed(2)}\nConversões: ${(overview.totals?.conversions || 0).toFixed(0)}\nROAS médio: ${(overview.totals?.roas || 0).toFixed(2)}`
        : "Contexto Meta Ads indisponível.";

      const convo: any[] = [
        { role: "system", content: `${SYSTEM_PROMPT_CHAT}\n\n${ctx}` },
        ...messages,
      ];

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
        logUsage(service, workspace_id, "meta-ads-ai-optimizer:chat", j.usage);
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
              result = await fetchMetaOverview(workspace_id, args.period || "30d", authHeader);
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
    console.error("meta-ads-ai-optimizer error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
