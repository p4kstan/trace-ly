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

    const systemPrompt = `Você é um engenheiro especialista em tracking server-side (Meta CAPI, Google Ads CAPI, GA4, TikTok Events) e checkouts nativos no Brasil.

Tarefa: o usuário vai colar trechos do código do checkout dele. Analise e gere um PROMPT customizado em português, pronto para colar em uma IA-agente (Lovable/Cursor/Claude Code), que implemente captura de tracking + disparo idempotente de Purchase no CapiTrack.

REGRAS:
1. Identifique no código colado: nome das funções de criação de cobrança, nome das variáveis (order, payment, customer), framework (React/Next/Vue/Node), gateway de pagamento.
2. Gere um prompt que CITA esses nomes reais — não use placeholders genéricos.
3. Cubra os 5 passos: (1) capturar UTMs/click IDs/_fbp/_fbc/_ga em cookies no <head> com late-bind do ga_client_id, (2) helper readTracking() que SEMPRE retorna session_id e ga_client_id e usa apenas .trim() em click IDs, (3) persistir TODOS os metadados no pedido + injetar no metadata do gateway, (4) função compartilhada maybeFirePurchase() com idempotência atômica via purchase_tracked_at IS NULL, (5) URL canônica de webhook \`${body.endpoint.replace("/track", "/gateway-webhook")}?provider=<gateway>\`.
4. Diferencie cartão (síncrono) de PIX/boleto (assíncrono). Para PIX EXIGIR 3 fontes idempotentes que chamam o mesmo maybeFirePurchase: pix-webhook, check-pix-status (polling) e reconcile-pix-payments (cron 2-5min).
5. **CRÍTICO — Fluxo Final 04/2026**:
   - event_id = \`purchase:<orderCode>\` (TMT/upsell/segunda tela = \`purchase:<orderCodePrincipal>:tmt\`, referenciando o pedido **pai**, NUNCA o orderCode da própria TMT). NÃO use mais \`<externalId>:Purchase\` nem event_id cru sem prefixo (\`EV-...\`).
   - **Checkout em duas etapas (Pedido principal + TMT/taxa/upsell)**: as duas cobranças são legítimas e viram Purchase **separados**. Cada um tem event_id único, trava atômica própria (\`purchase_tracked_at\` para main, \`tmt_tracked_at\` para TMT) e value isolado (a TMT envia SOMENTE o valor da taxa — não somar o do principal).
   - **Herança de metadata na TMT**: gclid, gbraid, wbraid, fbclid, ttclid, msclkid, fbp, fbc, ga_client_id, session_id, utm_*, landing_page, referrer, user_agent, client_ip da TMT vêm do pedido pai (lookup via \`externalReference = tmt-<orderCodePrincipal>\` ou \`parent_order_code\`). Se a TMT chegar com metadata vazia, o backend (webhook/check-pix-status/reconcile) **completa antes** de chamar /track.
   - transaction_id e gateway_order_id são campos SEPARADOS do payload.
   - Backend deduplica em janela de 48h por workspace+event_id+provider em event_deliveries.
   - Idempotência server: coluna purchase_tracked_at TIMESTAMPTZ NULL + UPDATE atômico WHERE purchase_tracked_at IS NULL (análoga \`tmt_tracked_at\` para a TMT).
   - Click IDs (gclid/gbraid/wbraid/fbclid/ttclid/msclkid) case-sensitive: NUNCA aplique .toLowerCase()/.normalize. Apenas .trim().
   - Metadados obrigatórios persistidos no pedido E enviados no Purchase: gclid, gbraid, wbraid, fbclid, fbp, fbc, ttclid, msclkid, ga_client_id, session_id, utm_source/medium/campaign/content/term, landing_page, referrer, user_agent, client_ip.
   - Trava de status: só dispare Purchase em {paid, approved, confirmed, succeeded, captured, pix_paid, order_paid}.
   - Roteamento Last-Click decidido pelo backend — só envie todos os IDs disponíveis.
   - Segurança: NUNCA logar CPF/email/telefone/endereço/QR-PIX em texto puro. Logue apenas orderCode, parent_order_code, event_id, value, source, provider, status. PII só server-to-server.
   - Validação obrigatória deve checar: nenhum event_id cru (\`EV-...\`), TMT com event_id \`purchase:<orderPrincipal>:tmt\` (não \`purchase:<orderTMT>\`), TMT herdou gclid/msclkid/utm_*/fbp/session_id do pai, value da TMT é só a taxa, e falha Google Ads com UNPARSEABLE_GCLID em gclid sintético é esperada (não indica bug).
6. Use SEMPRE o endpoint, public key e URL canônica de webhook fornecidos.
7. Retorne APENAS o prompt final em markdown, sem comentários antes/depois.`;

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
