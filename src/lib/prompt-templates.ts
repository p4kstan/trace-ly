/**
 * Gerador de prompts de implementação CapiTrack para diferentes tipos de negócio.
 * Cada perfil define o funil GA4 ideal, eventos críticos, e gera 3 prompts:
 *   1. Auditoria  → o usuário cola no Lovable do projeto-alvo
 *   2. Correção   → aplica as melhorias com base no relatório
 *   3. Validação  → roteiro de teste pós-implementação
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

  return `Faça uma AUDITORIA COMPLETA de tracking neste projeto, SEM alterar nenhum arquivo. Responda em formato de relatório.

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

7) DEDUPLICAÇÃO
   - event_id consistente entre client e webhook?
   - Formato usado: \`{transaction_id}:{event_name}\`?

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

  return `Aplique as correções de tracking abaixo, NA ORDEM, sem quebrar o que já funciona. Estratégia: ADITIVA (nunca remover chamadas existentes).

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
${cfg.gateway !== "none" ? `Configure no painel do ${GATEWAY_LABELS[cfg.gateway]}:
URL: ${cfg.endpoint.replace("/track", "/gateway-webhook")}/${cfg.gateway}?workspace_id=${cfg.workspaceId || "<WORKSPACE_ID>"}

Use APENAS UM webhook (não duplique). O CapiTrack distribui para todos os destinos automaticamente.

CRÍTICO para dedup: o transaction_id enviado no purchase client-side deve ser EXATAMENTE o mesmo que o webhook do gateway envia.` : "Sem gateway — pular esta etapa."}

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

  return `Roteiro de validação pós-implementação. Execute CADA passo e marque o checklist.

═══════════════════════════════════════════════
ANTES DE COMEÇAR
═══════════════════════════════════════════════
1. Abra o site em uma aba anônima (sem extensões/adblock)
2. Abra DevTools (F12) → aba Console
3. Faça login no painel CapiTrack em outra aba (https://trace-ly.lovable.app)
4. Vá em /event-logs no CapiTrack para acompanhar em tempo real

═══════════════════════════════════════════════
TESTE 1: SDK CARREGOU
═══════════════════════════════════════════════
No console do site, rode:
\`\`\`js
window.CapiTrack
window.dataLayer
\`\`\`
- [ ] window.CapiTrack existe (objeto com .track, .init)
- [ ] window.dataLayer é array (não undefined)
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
2. Em /event-logs, filtre por event_name = purchase
3. Você deve ver:
   - 1 evento client-side (source: web)
   - 1 evento server-side (source: webhook)
   - AMBOS com mesmo event_id (\`{transaction_id}:purchase\`)
4. Em /destinations → veja se Meta CAPI / Google Ads CAPI receberam APENAS 1 envio (deduplicado)

- [ ] 2 eventos no CapiTrack, mesmo event_id
- [ ] Meta Events Manager mostra 1 Purchase (não 2)
- [ ] Google Ads Conversões mostra 1 (não 2)` : "Sem gateway — pular."}

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
