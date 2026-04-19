// Analyze pasted checkout source code with Lovable AI and emit a customized
// implementation prompt that references the user's actual variables/functions.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.103.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface Body {
  code: string;
  gateway: string;
  methods: string[];
  publicKey: string;
  endpoint: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as Body;
    if (!body?.code || body.code.length < 30) {
      return new Response(JSON.stringify({ error: "code is required (min 30 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.code.length > 60000) {
      return new Response(JSON.stringify({ error: "code too large (max 60k chars). Cole apenas os arquivos do checkout/pagamento." }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um engenheiro especialista em tracking server-side (Meta CAPI, Google Ads CAPI, GA4) e checkouts nativos no Brasil.

Tarefa: o usuário vai colar trechos do código do checkout dele. Analise e gere um PROMPT customizado em português, pronto para colar em uma IA-agente (Lovable/Cursor/Claude Code), que implemente captura de tracking + disparo de Purchase no CapiTrack.

REGRAS:
1. Identifique no código colado: nome das funções de criação de cobrança, nome das variáveis (order, payment, customer), framework (React/Next/Vue/Node), gateway de pagamento.
2. Gere um prompt que CITA esses nomes reais — não use placeholders genéricos.
3. Cubra os 4 passos: (1) capturar UTMs/gclid/fbclid/ttclid/_fbp/_fbc em cookies no <head>, (2) helper readTracking() que SEMPRE retorna session_id e usa apenas .trim() (NUNCA .toLowerCase()) em click IDs, (3) injetar metadata na chamada do gateway identificada no código, (4) disparar Purchase no CapiTrack quando o pagamento confirmar.
4. Diferencie cartão (síncrono) de PIX/boleto (assíncrono via webhook ou polling).
5. **CRÍTICO — Módulo de Deduplicação de Elite (04/2026)**:
   - O payload do Purchase enviado ao CapiTrack DEVE conter \`external_id\` (ID da transação no gateway) e \`event_id\` no formato \`\${external_id}:Purchase\`.
   - O backend deduplica em janela de 48h por \`external_id:event_name\` em event_deliveries — então é seguro disparar client-side e webhook simultaneamente.
   - Inclua \`session_id\` no payload (lido do cookie \`ct_session\` ou sessionStorage) — permite fallback de atribuição via tabela sessions.
   - Click IDs (gclid/gbraid/wbraid/fbclid/ttclid) são case-sensitive: NUNCA aplique .toLowerCase()/.normalize(). Apenas .trim().
   - Trava de status: só dispare Purchase quando o status do gateway estiver em {paid, approved, confirmed, succeeded, captured, pix_paid, order_paid}. Status pending/checkout_created/boleto_printed devem usar InitiateCheckout ou generate_lead.
   - Roteamento Last-Click é decidido pelo backend (gclid→Google Ads, fbclid→Meta, ttclid→TikTok) — só envie todos os IDs disponíveis, não filtre.
6. Use SEMPRE o endpoint e a public key fornecidos.
7. Retorne APENAS o prompt final em markdown, sem comentários, sem explicações antes/depois.`;

    const userPrompt = `Gateway selecionado pelo usuário: ${body.gateway}
Métodos de pagamento ativos: ${body.methods.join(", ")}
Endpoint CapiTrack: ${body.endpoint}
Public Key CapiTrack: ${body.publicKey}

CÓDIGO DO CHECKOUT COLADO PELO USUÁRIO:
\`\`\`
${body.code}
\`\`\`

Gere o prompt customizado agora.`;

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (upstream.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await upstream.text();
      console.error("AI gateway error:", upstream.status, t);
      return new Response(JSON.stringify({ error: "Falha ao chamar IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await upstream.json();
    const prompt = data?.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ prompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("checkout-prompt-ai error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
