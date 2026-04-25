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
1. Identifique no código colado: nome das funções de criação de cobrança, nome das variáveis (order, payment, customer), framework (React/Next/Vue/Node), gateway de pagamento, **e TODAS as páginas/rotas/componentes que criam pagamento ou checkout session** (pode haver 2, 3, 5+ etapas pagas com qualquer nome — taxa de entrega, taxa de manipulação, seguro, frete express, prioridade, garantia, upsell, complemento, TMT etc.).
2. Gere um prompt que CITA esses nomes reais — não use placeholders genéricos. Liste cada etapa paga encontrada com: route/page/component, gateway/provider, value, externalReference/metadata, status source (webhook/polling/sync), thank-you page, step_key sugerido (ex.: \`main\`, \`shipping_fee\`, \`handling_fee\`, \`upsell_1\`, \`insurance\`, \`priority_fee\`, \`warranty\`, \`tmt\`), relação com o pedido raiz.
3. Cubra os 5 passos: (1) capturar UTMs/click IDs/_fbp/_fbc/_ga em cookies no <head> com late-bind do ga_client_id, (2) helper readTracking() que SEMPRE retorna session_id e ga_client_id e usa apenas .trim() em click IDs, (3) persistir TODOS os metadados no pedido + injetar no metadata do gateway, (4) função compartilhada idempotente (\`maybeFirePurchase\` para o principal e \`maybeFireStepPurchase({ rootOrderCode, stepKey, stepOrderCode, source })\` genérica para N etapas adicionais), (5) URL canônica de webhook \`${body.endpoint.replace("/track", "/gateway-webhook")}?provider=<gateway>\`.
4. Diferencie cartão (síncrono) de PIX/boleto (assíncrono). Para PIX EXIGIR 3 fontes idempotentes que chamam a mesma função: pix-webhook, check-pix-status (polling) e reconcile-pix-payments (cron 2-5min). Aplicar para o principal E para CADA etapa adicional PIX.
5. **CRÍTICO — Fluxo Final 04/2026 (multi-etapas genérico)**:
   - **event_id do principal** = \`purchase:<root_order_code>\`. **Etapas adicionais** = \`purchase:<root_order_code>:step:<step_key>\` (referenciando o pedido **raiz**, NUNCA o orderCode da própria etapa). Para repetições do mesmo tipo, usar índice/hash determinístico (\`upsell_2\`, \`upsell:<txHash8>\`). NÃO use mais \`<externalId>:Purchase\` nem event_id cru sem prefixo (\`EV-...\`).
   - **TMT é apenas exemplo** de etapa adicional dentre N possíveis — descubra os nomes reais auditando o código. Não trate "TMT" como regra fixa.
   - **Checkout multi-etapas (Pedido principal + N pagamentos adicionais)**: cada cobrança vira Purchase **separado** com event_id único, trava idempotente própria e value isolado (cada etapa adicional envia SOMENTE o valor dela — não somar o principal).
   - **Herança de metadata em etapas adicionais**: gclid, gbraid, wbraid, fbclid, ttclid, msclkid, fbp, fbc, ga_client_id, session_id, utm_*, landing_page, referrer, user_agent, client_ip da etapa vêm do pedido raiz (lookup via \`externalReference = step:<step_key>:<root_order_code>\` ou \`parent_order_code\`/\`root_order_code\`). Se a etapa adicional chegar com metadata vazia, o backend (webhook/check-pix-status/reconcile) **completa antes** de chamar /track.
   - transaction_id e gateway_order_id são campos SEPARADOS do payload.
   - Backend deduplica em janela de 48h por workspace+event_id+provider em event_deliveries.
   - **Idempotência multi-source genérica**: trava por \`event_id\`/\`step_key\`, NÃO por uma única coluna \`purchase_tracked_at\` (que bloquearia as adicionais). Para N etapas dinâmicas, usar tabela \`tracked_events (event_id PRIMARY KEY, root_order_code, step_key, source, tracked_at)\`. Para número fixo de etapas, colunas separadas (\`purchase_tracked_at\`, \`shipping_fee_tracked_at\`, etc.).
   - Click IDs (gclid/gbraid/wbraid/fbclid/ttclid/msclkid) case-sensitive: NUNCA aplique .toLowerCase()/.normalize. Apenas .trim().
   - Metadados obrigatórios persistidos no pedido E enviados no Purchase: gclid, gbraid, wbraid, fbclid, fbp, fbc, ttclid, msclkid, ga_client_id, session_id, utm_source/medium/campaign/content/term, landing_page, referrer, user_agent, client_ip.
   - Trava de status: só dispare Purchase em {paid, approved, confirmed, succeeded, captured, pix_paid, order_paid}.
   - Roteamento Last-Click decidido pelo backend — só envie todos os IDs disponíveis.
   - **Browser-side fallback** (se existir): usar EXATAMENTE o mesmo event_id server-side (\`purchase:<root_order_code>\` ou \`purchase:<root_order_code>:step:<step_key>\`). \`sessionStorage\` deve ser **lista por event_id**, não flag única (que bloquearia outras etapas).
   - Segurança: NUNCA logar CPF/email/telefone/endereço/QR-PIX em texto puro. Logue apenas root_order_code, step_key, event_id, value, source, provider, status. PII só server-to-server.
   - Validação obrigatória deve checar: nenhum event_id cru (\`EV-...\`); todas as etapas pagas mapeadas como \`main\` ou \`step:<step_key>\`; cada etapa adicional usa \`purchase:<root>:step:<step_key>\` (não \`purchase:<orderEtapa>\`); etapas adicionais herdaram gclid/msclkid/utm_*/fbp/session_id do raiz; value de cada etapa adicional é só o valor dela; cada delivery tem event_id distinto; falha Google Ads com UNPARSEABLE_GCLID em gclid sintético é esperada (não indica bug); logs sem PII.
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
