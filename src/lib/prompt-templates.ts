/**
 * Gerador de prompts de implementação CapiTrack para diferentes tipos de negócio.
 * Cada perfil define o funil GA4 ideal, eventos críticos, e gera 3 prompts:
 *   1. Auditoria  → o usuário cola no Lovable do projeto-alvo
 *   2. Correção   → aplica as melhorias com base no relatório
 *   3. Validação  → roteiro de teste pós-implementação
 *
 * ⚠️ Atualizado em 19/04/2026 com as regras do "Módulo de Deduplicação de Elite":
 *  - Persistência granular: orders.gclid/fbclid/ttclid/session_id/utm_* (TEXT, case-sensitive)
 *  - Click IDs NUNCA passam por .toLowerCase() — apenas .trim()
 *  - deduplication_key = `${external_id}:${event_name}` com janela de 48h em event_deliveries
 *  - Roteamento Last-Click: gclid→Google Ads, fbclid/fbc→Meta, ttclid→TikTok
 *  - Trava de status: Purchase só dispara em status paid/approved/confirmed/pix_paid
 *  - Whitelist de eventos no event-router (MouseActivity/Scroll/Dwell bloqueados)
 *  - Fallback: se webhook chega sem gclid, busca em sessions via session_id
 */

export type BusinessType =
  | "ecommerce"
  | "infoproduct"
  | "saas"
  | "leadgen"
  | "delivery"
  | "marketplace"
  | "agency";

export type Gateway =
  | "unknown"
  | "stripe" | "hotmart" | "kiwify" | "monetizze" | "eduzz" | "pagseguro"
  | "mercadopago" | "asaas" | "pagarme" | "yampi" | "appmax" | "quantumpay"
  | "shopify" | "woocommerce" | "custom" | "none";

export type Platform =
  | "unknown"
  | "react" | "next" | "vue" | "wordpress" | "shopify" | "webflow"
  | "html" | "custom";

export type TargetAI =
  | "lovable" | "cursor" | "claude" | "chatgpt" | "manus" | "bolt" | "v0" | "windsurf" | "other";

export interface ProjectConfig {
  businessType: BusinessType;
  gateway: Gateway;
  platform: Platform;
  targetAI: TargetAI;
  publicKey: string;
  workspaceId: string;
  endpoint: string;
  hasGoogleAds: boolean;
  hasMetaAds: boolean;
  hasTikTokAds: boolean;
  hasGA4: boolean;
}

export interface BusinessProfile {
  id: BusinessType;
  label: string;
  description: string;
  funnel: string[];
  criticalEvents: { name: string; ga4: string; meta: string; when: string }[];
  goals: string[];
}

export const BUSINESS_PROFILES: Record<BusinessType, BusinessProfile> = {
  ecommerce: {
    id: "ecommerce",
    label: "E-commerce",
    description: "Loja online com catálogo de produtos físicos.",
    funnel: ["view_item_list", "view_item", "add_to_cart", "begin_checkout", "add_payment_info", "purchase"],
    criticalEvents: [
      { name: "view_item_list", ga4: "view_item_list", meta: "ViewCategory", when: "Ao listar produtos numa categoria" },
      { name: "view_item", ga4: "view_item", meta: "ViewContent", when: "Página de detalhe do produto" },
      { name: "add_to_cart", ga4: "add_to_cart", meta: "AddToCart", when: "Clique em 'adicionar ao carrinho'" },
      { name: "begin_checkout", ga4: "begin_checkout", meta: "InitiateCheckout", when: "Entrada na página de checkout" },
      { name: "add_payment_info", ga4: "add_payment_info", meta: "AddPaymentInfo", when: "Seleção do método de pagamento" },
      { name: "purchase", ga4: "purchase", meta: "Purchase", when: "Página de confirmação após pagamento" },
    ],
    goals: ["Otimizar ROAS por catálogo", "Audiências dinâmicas", "Cross-sell por categoria"],
  },
  infoproduct: {
    id: "infoproduct",
    label: "Infoproduto / Curso Online",
    description: "Cursos, ebooks, mentorias vendidos via página de vendas.",
    funnel: ["view_item", "view_sales_page", "begin_checkout", "add_payment_info", "purchase"],
    criticalEvents: [
      { name: "view_sales_page", ga4: "view_item", meta: "ViewContent", when: "Carregamento da página de vendas/VSL" },
      { name: "video_progress", ga4: "video_progress", meta: "ViewContent", when: "VSL atinge 25/50/75% (engajamento)" },
      { name: "begin_checkout", ga4: "begin_checkout", meta: "InitiateCheckout", when: "Clique em 'Quero comprar'" },
      { name: "add_payment_info", ga4: "add_payment_info", meta: "AddPaymentInfo", when: "Seleção PIX/cartão/boleto" },
      { name: "purchase", ga4: "purchase", meta: "Purchase", when: "Página de obrigado pós-aprovação" },
    ],
    goals: ["Custo por aluno", "Otimizar VSL", "Lookalike de compradores", "Order bump tracking"],
  },
  saas: {
    id: "saas",
    label: "SaaS / Software",
    description: "Software por assinatura com trial/freemium.",
    funnel: ["sign_up", "activation", "trial_start", "subscribe", "upgrade"],
    criticalEvents: [
      { name: "sign_up", ga4: "sign_up", meta: "CompleteRegistration", when: "Após criar conta (email confirmado)" },
      { name: "trial_start", ga4: "begin_checkout", meta: "StartTrial", when: "Início do trial gratuito" },
      { name: "activation", ga4: "tutorial_complete", meta: "Lead", when: "Usuário completa onboarding/primeira ação core" },
      { name: "subscribe", ga4: "purchase", meta: "Subscribe", when: "Pagamento da primeira mensalidade" },
      { name: "upgrade", ga4: "purchase", meta: "Purchase", when: "Mudança para plano superior" },
    ],
    goals: ["CAC payback", "Trial → paid conversion", "MRR tracking", "Churn alerts"],
  },
  leadgen: {
    id: "leadgen",
    label: "Lead Generation / B2B",
    description: "Captação de leads para agência, consultoria, B2B.",
    funnel: ["view_landing", "view_form", "generate_lead", "qualified_lead", "meeting_booked"],
    criticalEvents: [
      { name: "view_landing", ga4: "page_view", meta: "PageView", when: "Carregamento da landing page" },
      { name: "view_form", ga4: "view_item", meta: "ViewContent", when: "Formulário fica visível na tela (scroll)" },
      { name: "generate_lead", ga4: "generate_lead", meta: "Lead", when: "Submit do formulário (na thank-you page)" },
      { name: "qualified_lead", ga4: "generate_lead", meta: "Lead", when: "Lead marcado como SQL no CRM (server-side)" },
      { name: "meeting_booked", ga4: "purchase", meta: "Schedule", when: "Reunião agendada no Calendly/etc" },
    ],
    goals: ["Custo por SQL (não MQL)", "Qualidade vs quantidade de leads", "Otimização por lookalike de SQLs"],
  },
  delivery: {
    id: "delivery",
    label: "Delivery / Restaurante",
    description: "Pedidos online de comida, marmita, pizza.",
    funnel: ["view_menu", "view_item", "add_to_cart", "begin_checkout", "add_payment_info", "purchase"],
    criticalEvents: [
      { name: "view_menu", ga4: "view_item_list", meta: "ViewCategory", when: "Cardápio carrega" },
      { name: "view_item", ga4: "view_item", meta: "ViewContent", when: "Modal de customização do prato abre" },
      { name: "add_to_cart", ga4: "add_to_cart", meta: "AddToCart", when: "Item adicionado ao carrinho" },
      { name: "begin_checkout", ga4: "begin_checkout", meta: "InitiateCheckout", when: "Entrada no checkout" },
      { name: "add_payment_info", ga4: "add_payment_info", meta: "AddPaymentInfo", when: "Seleção PIX/cartão" },
      { name: "purchase", ga4: "purchase", meta: "Purchase", when: "Pagamento confirmado (PIX aprovado/cartão capturado)" },
    ],
    goals: ["Ticket médio", "Frequência de recompra", "Otimização por bairro/região", "Catálogo dinâmico Meta"],
  },
  marketplace: {
    id: "marketplace",
    label: "Marketplace",
    description: "Plataforma com múltiplos vendedores (ex: Mercado Livre style).",
    funnel: ["search", "view_item_list", "view_item", "add_to_cart", "begin_checkout", "purchase"],
    criticalEvents: [
      { name: "search", ga4: "search", meta: "Search", when: "Busca interna" },
      { name: "view_item_list", ga4: "view_item_list", meta: "ViewCategory", when: "Resultado de busca/categoria" },
      { name: "view_item", ga4: "view_item", meta: "ViewContent", when: "Página do anúncio/produto" },
      { name: "select_item", ga4: "select_item", meta: "ViewContent", when: "Clique no produto da listagem" },
      { name: "add_to_cart", ga4: "add_to_cart", meta: "AddToCart", when: "Adicionar ao carrinho" },
      { name: "begin_checkout", ga4: "begin_checkout", meta: "InitiateCheckout", when: "Iniciar checkout" },
      { name: "purchase", ga4: "purchase", meta: "Purchase", when: "Compra concluída" },
    ],
    goals: ["GMV", "Comissão por vendedor", "Search → conversion rate", "Take rate por categoria"],
  },
  agency: {
    id: "agency",
    label: "Agência / Serviços",
    description: "Site institucional + captação de orçamentos.",
    funnel: ["view_landing", "view_services", "view_portfolio", "contact_initiated", "quote_requested"],
    criticalEvents: [
      { name: "view_landing", ga4: "page_view", meta: "PageView", when: "Home/landing carrega" },
      { name: "view_services", ga4: "view_item_list", meta: "ViewContent", when: "Página de serviços" },
      { name: "view_portfolio", ga4: "view_item", meta: "ViewContent", when: "Visualização de cases" },
      { name: "contact_initiated", ga4: "begin_checkout", meta: "InitiateCheckout", when: "Clique em 'Falar com especialista'" },
      { name: "quote_requested", ga4: "generate_lead", meta: "Lead", when: "Formulário de orçamento enviado (thank-you page)" },
    ],
    goals: ["Custo por orçamento qualificado", "Atribuição multi-touch (jornada longa)", "LTV por cliente"],
  },
};

const GATEWAY_LABELS: Record<Gateway, string> = {
  unknown: "Não sei / Detectar",
  stripe: "Stripe", hotmart: "Hotmart", kiwify: "Kiwify", monetizze: "Monetizze",
  eduzz: "Eduzz", pagseguro: "PagSeguro", mercadopago: "Mercado Pago", asaas: "Asaas",
  pagarme: "Pagar.me", yampi: "Yampi", appmax: "Appmax", quantumpay: "Quantum Pay",
  shopify: "Shopify", woocommerce: "WooCommerce", custom: "Custom/Próprio", none: "Nenhum",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  unknown: "Não sei / Detectar",
  react: "React/Vite", next: "Next.js", vue: "Vue/Nuxt", wordpress: "WordPress",
  shopify: "Shopify", webflow: "Webflow", html: "HTML estático", custom: "Custom",
};

const TARGET_AI_LABELS: Record<TargetAI, string> = {
  lovable: "Lovable", cursor: "Cursor", claude: "Claude (claude.ai / Code)",
  chatgpt: "ChatGPT", manus: "Manus", bolt: "Bolt.new", v0: "v0 (Vercel)",
  windsurf: "Windsurf", other: "Outra IA",
};

/** Tom/instruções iniciais adaptados para cada IA-alvo */
function aiPreamble(ai: TargetAI): string {
  switch (ai) {
    case "lovable":
      return "Você é o agente de código do Lovable. Use as ferramentas de leitura/edição de arquivos do projeto. Faça batch de leituras em paralelo. Responda em português.";
    case "cursor":
      return "Use o Cursor com acesso ao workspace. Leia os arquivos relevantes via @file e proponha edits aplicáveis com Cmd+K. Responda em português.";
    case "claude":
      return "Você é o Claude. Se estiver no Claude Code, leia os arquivos do projeto. Se for chat web, peça ao usuário para colar os arquivos relevantes. Responda em português.";
    case "chatgpt":
      return "Você é o ChatGPT. Se houver acesso ao repositório (Codex/Canvas), use-o; senão peça ao usuário para colar os arquivos críticos (index.html, package.json, componentes de checkout/carrinho). Responda em português.";
    case "manus":
      return "Você é o Manus. Use seus agentes para inspecionar o repositório, identificar stack e arquivos de tracking automaticamente. Responda em português.";
    case "bolt":
      return "Você é o Bolt.new. Inspecione o WebContainer do projeto. Liste arquivos com tracking antes de editar. Responda em português.";
    case "v0":
      return "Você é o v0 da Vercel. Foque em Next.js/React. Mostre os blocos de código completos para o usuário aplicar. Responda em português.";
    case "windsurf":
      return "Você é o Windsurf (Codeium). Use Cascade para ler/editar arquivos do workspace. Responda em português.";
    default:
      return "Leia o código deste projeto. Se não tiver acesso direto aos arquivos, liste exatamente quais arquivos precisa que o usuário cole. Responda em português.";
  }
}

/** Bloco extra quando o usuário não sabe a stack/gateway — pede detecção primeiro */
function detectionBlock(cfg: ProjectConfig): string {
  const needPlatform = cfg.platform === "unknown";
  const needGateway = cfg.gateway === "unknown";
  if (!needPlatform && !needGateway) return "";
  return `
═══════════════════════════════════════════════
0) DETECÇÃO AUTOMÁTICA (faça ANTES de tudo)
═══════════════════════════════════════════════
O usuário não tem certeza da stack. Detecte sozinho lendo os arquivos do projeto:

${needPlatform ? `**Stack/Plataforma** — inspecione:
- package.json (dependências: react, next, vue, nuxt, vite, etc.)
- vite.config.*, next.config.*, nuxt.config.*
- index.html, public/, app/, pages/
- Se for WordPress: wp-config.php, wp-content/themes
- Se for Shopify: theme.liquid, sections/
- Reporte: stack detectada + versão
` : ""}
${needGateway ? `**Gateway de pagamento** — procure por:
- Strings: "stripe", "hotmart", "kiwify", "mercadopago", "pagseguro", "yampi", "appmax", "quantum"
- Endpoints de webhook em /api, /functions, supabase/functions
- Componentes de checkout (Checkout.tsx, PixPayment.tsx, etc.)
- Variáveis de ambiente .env (STRIPE_KEY, HOTMART_TOKEN, etc.)
- Reporte: gateway(s) detectado(s) + arquivo onde aparece
` : ""}
Confirme a detecção em 1 parágrafo antes de prosseguir com a auditoria/correção abaixo.
`;
}

// ──────────────────────────────────────────────────────────────────────────
// PROMPT 1 — AUDITORIA
// ──────────────────────────────────────────────────────────────────────────
export function generateAuditPrompt(cfg: ProjectConfig): string {
  const profile = BUSINESS_PROFILES[cfg.businessType];
  const events = profile.criticalEvents.map(e => `   - ${e.name} (GA4: ${e.ga4} / Meta: ${e.meta}): ${e.when}`).join("\n");
  const destinations = [
    cfg.hasMetaAds && "Meta Ads (Pixel + CAPI)",
    cfg.hasGoogleAds && "Google Ads (gtag + CAPI)",
    cfg.hasGA4 && "Google Analytics 4",
    cfg.hasTikTokAds && "TikTok Ads (Pixel + Events API)",
  ].filter(Boolean).join(", ") || "(definir)";

  return `${aiPreamble(cfg.targetAI)}

Faça uma AUDITORIA COMPLETA de tracking neste projeto, SEM alterar nenhum arquivo. Responda em formato de relatório.
${detectionBlock(cfg)}
═══════════════════════════════════════════════
CONTEXTO DO PROJETO
═══════════════════════════════════════════════
Tipo de negócio: ${profile.label} — ${profile.description}
Plataforma: ${PLATFORM_LABELS[cfg.platform]}
Gateway de pagamento: ${GATEWAY_LABELS[cfg.gateway]}
Destinos esperados: ${destinations}

Funil ideal para este negócio (formato GA4):
${profile.funnel.map((e, i) => `   ${i + 1}. ${e}`).join("\n")}

Eventos críticos esperados:
${events}

═══════════════════════════════════════════════
O QUE AUDITAR (responda cada item)
═══════════════════════════════════════════════

1) SDK / SCRIPT DE TRACKING
   - Existe SDK CapiTrack instalado? Em qual arquivo? Qual API key (pk_...)?
   - Existem outras tags/pixels (Meta Pixel, gtag.js, GTM, TikTok Pixel)?
   - Há alguma duplicação ou conflito de keys?
   - Existe helper local (ex: src/lib/capitrack.ts ou similar)? Mesma key do script principal?

2) DATA LAYER
   - O projeto usa window.dataLayer? Lista de pushes encontrados (arquivo:linha + payload).
   - Os pushes seguem o schema GA4 Ecommerce (event + ecommerce.items[])?
   - O auto-bridge do CapiTrack está ativo (dataLayerBridge != false)?

3) FUNIL DE EVENTOS
   Para CADA um dos eventos abaixo, informe: ✅ implementado / ⚠️ parcial / ❌ ausente
   ${profile.criticalEvents.map(e => `   - ${e.name} (esperado: ${e.when})`).join("\n")}

4) WEBHOOK DO GATEWAY (${GATEWAY_LABELS[cfg.gateway]})
   - URL configurada no painel do gateway aponta para CapiTrack?
   - Edge function local recebendo webhook? (arquivo)
   - Algum Purchase client-side que pode duplicar com o webhook server-side?
   - O transaction_id usado no client é o MESMO que o gateway envia no webhook? (essencial para dedup)

5) DESTINOS E IDs
${cfg.hasMetaAds ? "   - Meta Pixel ID e Access Token configurados?\n" : ""}${cfg.hasGoogleAds ? "   - Google Ads Conversion ID + Label configurados? gtag.js carregado?\n" : ""}${cfg.hasGA4 ? "   - GA4 Measurement ID + API Secret?\n" : ""}${cfg.hasTikTokAds ? "   - TikTok Pixel ID + Access Token?\n" : ""}
6) DADOS DE USUÁRIO (PII)
   - Eventos enviam email/phone/nome? Estão sendo hasheados (SHA-256) antes do envio?
   - fbp/fbc, gclid, ttclid sendo capturados e persistidos?

7) DEDUPLICAÇÃO E SANITIZAÇÃO (CRÍTICO — atualizado 04/2026)
   - O Purchase client-side e o webhook server-side usam o MESMO \`external_id\` (ID da transação no gateway)?
   - O event_id segue o formato \`{external_id}:{event_name}\` (ex: \`ord_abc123:Purchase\`)?
   - Os click IDs (gclid, gbraid, wbraid, fbclid, ttclid) são tratados como TEXT puro
     (apenas .trim(), NUNCA .toLowerCase()/.normalize/replace)?
   - O sistema verifica em event_deliveries se já existe disparo nas últimas 48h antes de re-enviar?
   - O Purchase só é disparado quando status ∈ {paid, approved, confirmed, succeeded, pix_paid, order_paid}?
     (status pending, checkout_created, boleto_printed NÃO devem disparar Purchase)
   - O session_id é enviado no payload pra permitir fallback de atribuição via tabela sessions?

8) ROTEAMENTO LAST-CLICK
   - Quando uma venda chega, qual identificador "ganha"? (esperado: gclid > fbclid/fbc > ttclid)
   - Plataformas que NÃO são donas do clique recebem só sinais auxiliares (não Purchase principal)?

═══════════════════════════════════════════════
FORMATO DA RESPOSTA
═══════════════════════════════════════════════
Use tabela markdown para o funil. Cite arquivo:linha em cada achado. Termine com seção "🚩 Principais gaps" listando o que falta priorizado por impacto.

NÃO altere nenhum arquivo. Apenas relate.`;
}

// ──────────────────────────────────────────────────────────────────────────
// PROMPT 2 — CORREÇÃO
// ──────────────────────────────────────────────────────────────────────────
export function generateFixPrompt(cfg: ProjectConfig): string {
  const profile = BUSINESS_PROFILES[cfg.businessType];
  const eventsCode = profile.criticalEvents.map(e => `// ${e.name} — ${e.when}
pushDataLayer("${e.ga4}", {
  // Adapte os campos ao seu negócio:
  value: 0,
  ${e.ga4 === "purchase" ? 'transaction_id: "ORDER_ID_AQUI",  // mesmo do webhook → dedup' : ''}
  items: [/* toGa4Item(produto, qtd) */],
});`).join("\n\n");

  return `${aiPreamble(cfg.targetAI)}

Aplique as correções de tracking abaixo, NA ORDEM, sem quebrar o que já funciona. Estratégia: ADITIVA (nunca remover chamadas existentes).
${detectionBlock(cfg)}

═══════════════════════════════════════════════
CONTEXTO
═══════════════════════════════════════════════
Negócio: ${profile.label}
Plataforma: ${PLATFORM_LABELS[cfg.platform]}
Gateway: ${GATEWAY_LABELS[cfg.gateway]}
CapiTrack endpoint: ${cfg.endpoint}
CapiTrack public key: ${cfg.publicKey || "<COLE_SUA_PUBLIC_KEY>"}
Workspace ID: ${cfg.workspaceId || "<COLE_SEU_WORKSPACE_ID>"}

═══════════════════════════════════════════════
1) INSTALAR/UNIFICAR SDK CAPITRACK
═══════════════════════════════════════════════
Em ${cfg.platform === "html" || cfg.platform === "wordpress" ? "index.html (antes de </head>)" : "index.html ou _document"}, garanta:

<script src="https://trace-ly.lovable.app/sdk.js" async></script>
<script>
  window.addEventListener('load', function() {
    if (window.CapiTrack) {
      window.CapiTrack.init({
        apiKey: "${cfg.publicKey || "<COLE_SUA_PUBLIC_KEY>"}",
        endpoint: "${cfg.endpoint}",
        autoPageView: true,
        trackSPA: ${cfg.platform === "react" || cfg.platform === "next" || cfg.platform === "vue" ? "true" : "false"},
        autoIdentify: true,
        dataLayerBridge: true,  // ESSENCIAL — auto-converte dataLayer
      });
    }
  });
</script>

Se houver helper local (src/lib/capitrack.ts), garanta que use a MESMA api key.
Se houver MAIS DE UMA api key no projeto, unifique TODAS para a mesma.

═══════════════════════════════════════════════
2) CRIAR HELPER DATA LAYER (src/lib/dataLayer.ts)
═══════════════════════════════════════════════
${cfg.platform === "react" || cfg.platform === "next" || cfg.platform === "vue" ? `Crie src/lib/dataLayer.ts:

\`\`\`ts
type Item = {
  item_id: string;
  item_name: string;
  item_category?: string;
  price: number;
  quantity: number;
};

declare global {
  interface Window { dataLayer?: any[]; }
}

export function pushDataLayer(event: string, ecommerce: Record<string, any> = {}, extra?: Record<string, any>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });  // reset
  window.dataLayer.push({
    event,
    ecommerce: { currency: "BRL", ...ecommerce },
    ...(extra || {}),
  });
}

export function toGa4Item(produto: any, quantidade = 1): Item {
  return {
    item_id: String(produto.id ?? produto.sku ?? ""),
    item_name: String(produto.nome ?? produto.name ?? ""),
    item_category: produto.categoria ?? produto.category,
    price: Number(produto.preco ?? produto.price ?? 0),
    quantity: Number(quantidade),
  };
}
\`\`\`` : `Em script global JS, adicione função utilitária:
\`\`\`js
function pushDataLayer(event, ecommerce, extra) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event: event, ecommerce: Object.assign({ currency: "BRL" }, ecommerce || {}), ...(extra || {}) });
}
\`\`\``}

═══════════════════════════════════════════════
3) ADICIONAR EVENTOS DO FUNIL (ADITIVO)
═══════════════════════════════════════════════
Para CADA evento abaixo, encontre o local correto no código e adicione o pushDataLayer ANTES de qualquer track() existente. NÃO remova nenhuma chamada de tracking que já existe.

${eventsCode}

═══════════════════════════════════════════════
4) WEBHOOK ${GATEWAY_LABELS[cfg.gateway].toUpperCase()}
═══════════════════════════════════════════════
${cfg.gateway !== "none" ? `Configure no painel do ${GATEWAY_LABELS[cfg.gateway]} a URL CANÔNICA:
URL: ${cfg.endpoint.replace("/track", "/gateway-webhook")}?provider=${cfg.gateway}

⚠️ Esta é a URL exata exibida no painel **Webhook Logs** do CapiTrack — NÃO monte
manualmente em formato antigo \`/gateway-webhook/<gateway>\`.

Use APENAS UM webhook (não duplique). O CapiTrack distribui para todos os destinos
e deduplica automaticamente.

CRÍTICO para dedup: o \`order_id\` enviado no Purchase client-side deve ser EXATAMENTE
o mesmo que o webhook do gateway envia. \`event_id = purchase:<order_id>\`.` : "Sem gateway — pular esta etapa."}

═══════════════════════════════════════════════
4.1) PAYLOAD DO PURCHASE — REGRAS CRÍTICAS (atualizado 04/2026 — Multi-etapas genérico)
═══════════════════════════════════════════════
Quando disparar o Purchase (client-side OU server-side), o payload PRECISA conter:

- **event_id**: SEMPRE com prefixo \`purchase:\`.
  - Pedido principal: \`purchase:<root_order_code>\`.
  - **Etapas adicionais** (taxa de entrega, taxa de manipulação, seguro, frete express,
    prioridade, garantia, upsell, **TMT** etc.): \`purchase:<root_order_code>:step:<step_key>\`
    onde \`step_key\` é estável (\`shipping_fee\`, \`handling_fee\`, \`upsell_1\`, \`insurance\`,
    \`priority_fee\`, \`warranty\`, \`tmt\`, ...). **TMT é apenas exemplo** — descubra os
    nomes reais auditando o código.
  - NUNCA envie event_id cru sem prefixo (\`EV-...\`) nem o padrão antigo
    \`<external_id>:Purchase\`.
- **order_id**: ID estável do pedido (mostrado ao cliente).
- **parent_order_id** / **root_order_code** (em etapas adicionais): orderCode do pedido
  principal correlacionado.
- **step_key** (em etapas adicionais): identificador estável do tipo da etapa.
- **transaction_id** / **gateway_order_id**: ID interno do gateway, em campos **separados**.
- **event_name**: "Purchase" (ou "Subscribe" pra primeira cobrança de assinatura).
- **session_id**: lido do cookie/sessionStorage (\`ct_session\`). Permite fallback de atribuição.
- **gclid / gbraid / wbraid / fbclid / ttclid / msclkid**: dos cookies \`ct_*\` ou URL.
  ⚠️ NUNCA aplique \`.toLowerCase()\` ou \`.normalize()\`. Apenas \`.trim()\`.
- **fbp / fbc / ga_client_id (alias client_id)**: cookies \`_fbp/_fbc/_ga\`.
- **utm_source / utm_medium / utm_campaign / utm_term / utm_content**: cookies \`ct_utm_*\`.
- **landing_page / referrer / user_agent / client_ip**: persistidos no pedido.
- **value**: para etapa adicional, **APENAS** o valor daquela etapa (não somar o principal).
- **status do pagamento**: só dispare quando status ∈
  \`{paid, approved, confirmed, succeeded, captured, pix_paid, order_paid}\`.

**Checkout MULTI-ETAPAS (Pedido principal + N pagamentos adicionais):**
- O checkout pode ter **2, 3, 5+ etapas** com qualquer nome de página/rota
  (taxa de entrega, taxa de manipulação, seguro, upsell, complemento, frete express,
  prioridade, garantia, **TMT** etc.). **TMT é apenas exemplo, não regra fixa.**
- **Auditoria obrigatória primeiro**: liste TODAS as páginas/funções que criam
  pagamento/charge no projeto-alvo, com \`route, gateway, value, externalReference,
  status source, step_key sugerido, relação com root\`.
- Cada etapa vira **Purchase separado** com event_id único e value isolado.
- **Toda etapa adicional herda do root**: \`gclid, gbraid, wbraid, fbclid, ttclid,
  msclkid, fbp, fbc, ga_client_id, session_id, utm_*, landing_page, referrer,
  user_agent, client_ip\`. Lookup do root via \`externalReference =
  step:<step_key>:<root_order_code>\` ou \`parent_order_code\`.
- Se a etapa adicional chegar com metadata vazia, o backend (webhook/check-status/
  reconcile) **completa antes** de chamar \`/track\`.
- **Idempotência por \`event_id\`** (não por flag global): use tabela
  \`tracked_events (event_id PRIMARY KEY, root_order_code, step_key, source,
  tracked_at)\` para suportar N etapas dinâmicas. Para número fixo de etapas,
  pode usar colunas separadas (\`purchase_tracked_at\`, \`shipping_fee_tracked_at\`,
  \`upsell_1_tracked_at\`).
- Como reportar para os ads: para otimizar só pelo principal, trate adicionais como
  secondary conversion; para LTV/receita total, eventos separados com event_id
  único e value isolado. **Nunca** duplicar o mesmo Purchase para inflar receita.

A janela de dedupe do CapiTrack é **48h** por \`workspace_id+event_id+provider\` em
\`event_deliveries\` — então é seguro disparar tanto client-side quanto webhook.

**Idempotência server-side (PIX/boleto)**: para o pedido principal, use coluna
\`purchase_tracked_at TIMESTAMPTZ NULL\` + UPDATE atômico \`WHERE purchase_tracked_at
IS NULL\`. Para etapas adicionais, use a função genérica \`maybeFireStepPurchase\`
com trava por \`event_id\` na tabela \`tracked_events\`. Todas as fontes (\`pix-webhook\`,
\`check-pix-status\`, \`reconcile-pix-payments\`) chamam a mesma função — só uma ganha
a corrida, as outras viram no-op silencioso.

═══════════════════════════════════════════════
5) ALTERNATIVA — IMPORTAR CONTAINER GTM (opcional)
═══════════════════════════════════════════════
Se o usuário usa Google Tag Manager, há um container PRONTO gerado pelo CapiTrack
que faz tudo isso via GTM (sem precisar editar o código manualmente):

➜ Painel CapiTrack → /sdk-setup → aba "Templates GTM" → escolha:
   • "Dinâmico — ${profile.label}" (Web — ${profile.criticalEvents.length} eventos do funil)
   • OU "Server — ${profile.label}" (sGTM com forward p/ CapiTrack)

O container gerado já inclui (todos com prefixo \`[CT]\` para não conflitar com tags existentes):
- Tag NATIVA Meta Pixel para cada evento (${profile.criticalEvents.map(e => e.meta).join(", ")})
- Tag NATIVA GA4 Event (\`gaawe\`) para cada evento (${profile.criticalEvents.map(e => e.ga4).join(", ")})
- Tag NATIVA Google Ads Conversion (\`awct\`) no purchase
- Bridge automático: TODO push em \`window.dataLayer\` → CapiTrack → multi-provider
- Add-ons opcionais: Cookies PII (Advanced Matching), WhatsApp click, JS Error tracking

Ambos os caminhos (SDK direto OU container GTM) usam o MESMO schema dataLayer
descrito acima (eventos GA4 padrão), então são 100% compatíveis e podem coexistir.

═══════════════════════════════════════════════
NÃO FAÇA
═══════════════════════════════════════════════
- NÃO remova nenhuma chamada de tracking existente
- NÃO crie endpoints/edge functions novos
- NÃO mude o transaction_id já em uso
- NÃO desabilite dataLayerBridge

═══════════════════════════════════════════════
RESPONDA
═══════════════════════════════════════════════
- Diff de cada arquivo alterado/criado
- Lista de TODOS os pushDataLayer adicionados (arquivo:linha + evento)
- Confirmação que dataLayerBridge está ativo
- Confirmação que api keys estão unificadas`;
}

// ──────────────────────────────────────────────────────────────────────────
// PROMPT 3 — VALIDAÇÃO
// ──────────────────────────────────────────────────────────────────────────
export function generateValidationPrompt(cfg: ProjectConfig): string {
  const profile = BUSINESS_PROFILES[cfg.businessType];
  const checks = profile.criticalEvents
    .map((e, i) => `${i + 1}. **${e.name}** (esperado em: ${e.when})\n   - [ ] Evento aparece em window.dataLayer\n   - [ ] Chega no CapiTrack (Event Logs)\n   - [ ] items[] populado quando aplicável`)
    .join("\n\n");

  return `${aiPreamble(cfg.targetAI)}

Roteiro de validação pós-implementação. Execute CADA passo e marque o checklist.

═══════════════════════════════════════════════
ANTES DE COMEÇAR
═══════════════════════════════════════════════
1. Abra o site em uma aba anônima (sem extensões/adblock)
2. Abra DevTools (F12) → aba Console
3. Faça login no painel CapiTrack em outra aba (https://trace-ly.lovable.app)
4. Vá em /event-logs no CapiTrack para acompanhar em tempo real

═══════════════════════════════════════════════
TESTE 1: SDK / GTM CARREGOU
═══════════════════════════════════════════════
No console do site, rode:
\`\`\`js
window.CapiTrack          // SDK direto
window.dataLayer          // dataLayer (SDK + GTM)
window.google_tag_manager // GTM container (se via GTM)
\`\`\`
- [ ] window.dataLayer é array (não undefined) — OBRIGATÓRIO em ambos os caminhos
- [ ] (Caminho SDK) window.CapiTrack existe com .track, .init
- [ ] (Caminho GTM) Tags com prefixo \`[CT]\` aparecem no GTM Preview
- [ ] PageView aparece em /event-logs em <5s

═══════════════════════════════════════════════
TESTE 2: FUNIL COMPLETO (${profile.label})
═══════════════════════════════════════════════
Faça o caminho completo de compra/conversão como um cliente real:

${checks}

═══════════════════════════════════════════════
TESTE 3: DEDUPLICAÇÃO ${cfg.gateway !== "none" ? `(${GATEWAY_LABELS[cfg.gateway]})` : ""}
═══════════════════════════════════════════════
${cfg.gateway !== "none" ? `1. Faça 1 compra/conversão real
2. Em /event-logs, filtre por event_name = Purchase
3. Você deve ver:
   - 1 evento client-side / thank-you (source: web) — se aplicável
   - 1 evento server-side via webhook (source: webhook)
   - **AMBOS com o mesmo \`event_id = purchase:<order_id>\`**
4. Em /destinations veja que Meta CAPI / Google Ads CAPI receberam APENAS 1 envio (deduplicado)
5. **F5 na thank-you NÃO duplica** (dedup 48h em event_deliveries por workspace+event_id+provider)
6. **Reentregar webhook** do mesmo pedido NÃO duplica (\`purchase_tracked_at\` bloqueia)
7. Se for PIX nativo: confirme \`purchase_tracked_source\` no pedido — uma das três:
   \`pix-webhook\`, \`check-pix-status\`, ou \`reconcile-pix\`. Apenas UMA delas vence a corrida.
8. \`msclkid\` e \`ga_client_id\` aparecem persistidos quando existirem na sessão original.
9. **Checkout em duas etapas (Pedido principal + TMT/taxa/upsell)** — se aplicável:
   - [ ] Existem **DOIS** Purchase distintos: \`purchase:<orderCode>\` e \`purchase:<orderCode>:tmt\`.
   - [ ] **NÃO** existe Purchase com event_id cru tipo \`EV-...\` (sem prefixo \`purchase:\`).
   - [ ] **NÃO** existe Purchase com event_id \`purchase:<orderCodeTMT>\` (TMT usando próprio orderCode).
   - [ ] A TMT carrega \`gclid/msclkid/utm_*/fbp/session_id\` IDÊNTICOS ao do pedido principal.
   - [ ] \`value\` da TMT = APENAS o valor da taxa (não somado ao do pedido principal).
   - [ ] Falha em Google Ads com \`UNPARSEABLE_GCLID\` para gclid de teste sintético é
         **esperada** — não indica bug; confirma apenas que o gclid foi preservado.

- [ ] Eventos no CapiTrack com mesmo event_id = purchase:<order_id>
- [ ] Meta Events Manager mostra 1 Purchase (não 2)
- [ ] Google Ads Conversões mostra 1 (não 2)
- [ ] F5 na thank-you não duplica
- [ ] Reentrega manual de webhook não duplica
- [ ] (Se aplicável) Pedido principal e TMT aparecem como 2 Purchases separados, sem duplicatas` : "Sem gateway — pular."}

═══════════════════════════════════════════════
TESTE 4: PII HASHEADO
═══════════════════════════════════════════════
1. Em /event-logs, abra um evento Purchase
2. user_data.email deve ser hash SHA-256 (64 caracteres hex)
3. NUNCA deve aparecer email em texto puro

- [ ] Email hasheado
- [ ] Phone hasheado
- [ ] fbp/fbc presentes (se Meta Ads ativo)
- [ ] gclid presente (se Google Ads ativo)

═══════════════════════════════════════════════
TESTE 5: DESTINOS
═══════════════════════════════════════════════
${cfg.hasMetaAds ? `**Meta:**
- [ ] Events Manager → Test Events: Purchase aparece em <30s
- [ ] Match quality > 6.0
- [ ] EMQ > 7.0
` : ""}${cfg.hasGoogleAds ? `**Google Ads:**
- [ ] Conversions → Diagnostics: Status "Recording conversions"
- [ ] Enhanced Conversions: Active
- [ ] Tag fires: 100%
` : ""}${cfg.hasGA4 ? `**GA4:**
- [ ] DebugView mostra eventos em tempo real
- [ ] Realtime → Conversions count up
- [ ] Items[] aparece nos relatórios de Ecommerce
` : ""}
═══════════════════════════════════════════════
✅ NOTA FINAL
═══════════════════════════════════════════════
Conte os checkboxes marcados:
- 100%: tracking PERFEITO ✅
- 80-99%: bom, ajustes finos
- 50-79%: gaps importantes — revisar prompt de correção
- <50%: re-rodar prompt de auditoria`;
}
