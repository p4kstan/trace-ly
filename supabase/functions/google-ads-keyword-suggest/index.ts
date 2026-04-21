// Google Ads keyword suggestion via Lovable AI.
// Input: workspace_id, customer_id, campaign_id, search_terms (rows from search_terms report).
// Output: array of suggested keywords { text, match_type, reason, predicted_intent_score }.
//
// Strategy: send the model the converting search terms + existing keywords (so it
// avoids duplicates), and ask it (via tool calling for structured output) to propose
// new keywords grouped by ad_group_id. We rely on Lovable AI Gateway (no API key).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchTermRow {
  name: string;
  matched_keyword?: string;
  match_type?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  conversions?: number;
  ad_group_id?: string;
  ad_group_name?: string;
}
interface KeywordRow { name: string; ad_group_id?: string; ad_group_name?: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { search_terms = [], existing_keywords = [], ad_groups = [], max_suggestions = 12 } = await req.json();
    if (!Array.isArray(search_terms) || search_terms.length === 0) {
      return new Response(JSON.stringify({ ok: true, suggestions: [], info: "Sem termos pesquisados para analisar." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Keep payload small: top-converting / highest-spend terms.
    const ranked = (search_terms as SearchTermRow[])
      .map((t) => ({
        ...t,
        score: Number(t.conversions || 0) * 5 + Number(t.clicks || 0) * 0.2,
      }))
      .filter((t) => t.name && (t.clicks || 0) >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);

    const existingSet = new Set(
      (existing_keywords as KeywordRow[]).map((k) => String(k.name || "").toLowerCase().trim())
    );

    const termsBlock = ranked.map((t) =>
      `- "${t.name}" — ad_group=${t.ad_group_name || "?"} (id=${t.ad_group_id || "?"}), clicks=${t.clicks || 0}, conv=${t.conversions || 0}, custo=R$${Number(t.cost || 0).toFixed(2)}`
    ).join("\n");

    const adGroupsBlock = (ad_groups as { id: string; name: string }[])
      .map((g) => `- ${g.name} (id=${g.id})`).join("\n") || "- (sem grupos)";

    const existingBlock = [...existingSet].slice(0, 100).join(", ") || "(nenhuma)";

    const systemPrompt = `Você é um especialista em Google Ads que recomenda novas palavras-chave a partir dos termos pesquisados que CONVERTERAM ou tiveram alta intenção comercial.

Regras estritas:
- NUNCA repita uma keyword que já existe (lista abaixo).
- Prefira variações com intenção transacional (ex: "comprar X", "preço X", "X melhor").
- Para cada sugestão, escolha um match_type adequado:
  * EXACT para termos curtos e altamente convertidos
  * PHRASE para termos médios com intenção clara
  * BROAD para descoberta (use com moderação)
- Atribua sempre ao ad_group_id mais relacionado semanticamente. Se não houver fit, escolha o primeiro grupo.
- Limite-se a no máximo ${max_suggestions} sugestões, priorizando as de maior probabilidade de conversão.
- Retorne EXCLUSIVAMENTE via tool call.`;

    const userPrompt = `Grupos de anúncios disponíveis:
${adGroupsBlock}

Termos pesquisados (ordenados por performance):
${termsBlock}

Keywords já existentes na campanha (NÃO repetir):
${existingBlock}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_keywords",
            description: "Retorna as sugestões de novas palavras-chave",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      keyword_text: { type: "string", description: "Texto da palavra-chave" },
                      match_type: { type: "string", enum: ["EXACT", "PHRASE", "BROAD"] },
                      ad_group_id: { type: "string", description: "ID do grupo onde adicionar" },
                      reason: { type: "string", description: "Por que sugerimos (curto, em PT-BR)" },
                      intent_score: { type: "number", description: "0..1 — confiança de conversão" },
                    },
                    required: ["keyword_text", "match_type", "ad_group_id", "reason", "intent_score"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_keywords" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await aiResponse.text();
      console.error("AI error", aiResponse.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ ok: true, suggestions: [], info: "IA não retornou sugestões." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { suggestions?: Array<{ keyword_text: string; match_type: string; ad_group_id: string; reason: string; intent_score: number }> };
    try { parsed = JSON.parse(toolCall.function.arguments); } catch { parsed = { suggestions: [] }; }

    // Filter out duplicates against existing keywords (defensive).
    const filtered = (parsed.suggestions || [])
      .filter((s) => s.keyword_text && !existingSet.has(s.keyword_text.toLowerCase().trim()))
      .slice(0, max_suggestions);

    return new Response(JSON.stringify({ ok: true, suggestions: filtered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("keyword-suggest error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
