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

import { PASSO_M_HARDENING_BLOCK } from "./native-checkout-prompts";

export type BusinessType =
  | "ecommerce"
  | "infoproduct"
  | "saas"
  | "leadgen"
  | "delivery"
  | "marketplace"
  | "agency"
  | "whatsapp";

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
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp / Lead via Chat",
    description: "Negócios que fecham venda no WhatsApp (clínicas, imobiliárias, infoproduto sem checkout próprio, prestadores de serviço, restaurantes que recebem pedido por chat).",
    funnel: ["view_landing", "view_offer", "whatsapp_click", "whatsapp_conversation", "whatsapp_purchase"],
    criticalEvents: [
      { name: "view_landing", ga4: "page_view", meta: "PageView", when: "Visitante carrega a página/landing" },
      { name: "view_offer", ga4: "view_item", meta: "ViewContent", when: "Vê oferta/serviço/produto específico (modal, popup, página de detalhe)" },
      { name: "whatsapp_click", ga4: "generate_lead", meta: "Lead", when: "Clica em qualquer botão/link de WhatsApp (wa.me, api.whatsapp.com) — dispara via /whatsapp-click do CapiTrack" },
      { name: "whatsapp_conversation", ga4: "contact", meta: "Contact", when: "Cliente respondeu no WhatsApp (opcional, via Business API webhook)" },
      { name: "whatsapp_purchase", ga4: "purchase", meta: "Purchase", when: "Venda fechada no chat — disparado via /whatsapp-conversion (manual no painel, Zapier/n8n ou Business API)" },
    ],
    goals: ["Custo por clique-WhatsApp qualificado", "Taxa de fechamento clique→venda", "Lookalike de quem fechou venda", "Otimização de campanhas Meta/Google pra Purchase real (não só clique)"],
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

  const whatsappAuditExtra = cfg.businessType === "whatsapp" ? `
═══════════════════════════════════════════════
AUDITORIA ESPECÍFICA — WHATSAPP TRACKING
═══════════════════════════════════════════════
- Liste TODOS os botões/links de WhatsApp do projeto (procure por: \`wa.me\`, \`api.whatsapp.com/send\`, \`whatsapp://\`, \`window.open\` com WhatsApp, \`<a href>\` com WhatsApp).
- Para cada um informe: arquivo:linha + número de destino + se a mensagem é dinâmica.
- Há alguma chamada ao endpoint \`/whatsapp-click\` do CapiTrack? Se sim, está usando a public key correta (\`pk_...\`)?
- O click do WhatsApp dispara \`Lead\` (Meta) e \`generate_lead\` (GA4) hoje? Ou abre direto \`wa.me\` sem rastreamento?
- Existe persistência de \`utm_*, gclid, gbraid, wbraid, fbclid, _fbp, _fbc\` em cookie/localStorage para sobreviver a navegação SPA?
- Há fluxo de marcação de venda fechada? (manual no painel CapiTrack, Zapier/n8n, ou WhatsApp Business API webhook)
` : "";

  return `${aiPreamble(cfg.targetAI)}

Faça uma AUDITORIA COMPLETA de tracking neste projeto, SEM alterar nenhum arquivo. Responda em formato de relatório.
${detectionBlock(cfg)}${whatsappAuditExtra}
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

  const supabaseBase = cfg.endpoint.replace(/\/functions\/v1\/track\/?$/, "");
  const whatsappFixBlock = cfg.businessType === "whatsapp" ? `

═══════════════════════════════════════════════
0.5) WHATSAPP TRACKING — RASTREIO COMPLETO DE CONVERSAS (CRÍTICO)
═══════════════════════════════════════════════
Esse projeto fecha venda no WhatsApp. Cada clique em botão de WhatsApp é um LEAD,
e cada venda fechada no chat é um PURCHASE com a atribuição original (utm/gclid/fbclid/_fbp).

**Por que isso importa pra otimização de campanhas:**
- Sem isso, o Meta Ads e o Google Ads otimizam pelo CLIQUE no botão (vaidade).
- Com isso, eles otimizam pela VENDA REAL fechada no WhatsApp → custo por aquisição cai
  drasticamente porque o algoritmo aprende perfis que conversam E compram.

**Crie o helper \`src/lib/whatsapp-tracking.ts\`** (substitua qualquer \`window.open(wa.me/...)\` existente):

\`\`\`ts
const CAPITRACK_WA_URL = "${supabaseBase}/functions/v1/whatsapp-click";
const CAPITRACK_KEY = "${cfg.publicKey || "<COLE_SUA_PUBLIC_KEY>"}";

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function getUTMs() {
  const q = new URLSearchParams(window.location.search);
  return {
    utm_source: q.get("utm_source"),
    utm_medium: q.get("utm_medium"),
    utm_campaign: q.get("utm_campaign"),
    utm_content: q.get("utm_content"),
    utm_term: q.get("utm_term"),
    gclid: q.get("gclid"),
    gbraid: q.get("gbraid"),
    wbraid: q.get("wbraid"),
    fbclid: q.get("fbclid"),
  };
}

export async function enviarWhatsApp({
  telefone,         // ex: "5511999999999" — DDI + DDD + número, só dígitos
  dados,            // { "Nome": "...", "Curso": "...", ... } → vira corpo da msg
  titulo = "NOVO LEAD",
  email,            // opcional — é hasheado server-side
  userPhone,        // opcional — é hasheado server-side
}: {
  telefone: string;
  dados: Record<string, string>;
  titulo?: string;
  email?: string;
  userPhone?: string;
}) {
  const linhas = Object.entries(dados).map(([k, v]) => \`- \${k}: \${v}\`).join("\\n");
  const mensagem = \`\${titulo}\\n\\n\${linhas}\\n\\nTenho interesse em saber mais!\`;

  try {
    const res = await fetch(CAPITRACK_WA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": CAPITRACK_KEY },
      body: JSON.stringify({
        phone: telefone,
        message: mensagem,
        url: window.location.href,
        referrer: document.referrer,
        ...getUTMs(),
        fbp: getCookie("_fbp"),
        fbc: getCookie("_fbc"),
        email,
        user_phone: userPhone,
      }),
    });
    const json = await res.json();
    if (json?.wa_url) {
      // CapiTrack devolve a URL do WhatsApp já com [Ref: CT-XXXXXX] embutido na msg.
      // Esse Ref permite casar a venda fechada com o clique original (atribuição).
      window.open(json.wa_url, "_blank");
      return;
    }
    throw new Error("no wa_url");
  } catch (e) {
    // Fallback — se CapiTrack falhar, abre o WhatsApp do mesmo jeito (não bloqueia o usuário).
    const url = \`https://api.whatsapp.com/send?phone=\${telefone}&text=\${encodeURIComponent(mensagem)}\`;
    window.open(url, "_blank");
  }
}
\`\`\`

**Substitua TODOS os \`window.open(wa.me/...)\` ou \`<a href="wa.me/...">\`** do projeto por chamadas
ao \`enviarWhatsApp(...)\`. Exemplos típicos a procurar e refatorar:

\`\`\`ts
// ANTES (não rastreia):
const url = \`https://api.whatsapp.com/send?phone=\${telefone}&text=\${encodeURIComponent(msg)}\`;
window.open(url, "_blank");

// DEPOIS (rastreia + dispara Lead pra Meta/Google/GA4 + preserva atribuição):
import { enviarWhatsApp } from "@/lib/whatsapp-tracking";
enviarWhatsApp({
  telefone: "${"447785369424"}",
  titulo: "INTERESSE NO PRODUTO X",
  dados: {
    "Nome": form.name,
    "Interesse": form.interest,
    // ...todo dado relevante pro vendedor responder
  },
  email: form.email,       // opcional, melhora EMQ no Meta
  userPhone: form.phone,   // opcional
});
\`\`\`

**Como fechar a conversão (3 caminhos — escolha o que tiver):**

1. **Manual (mais simples)**: vendedor entra em \`/whatsapp\` no painel CapiTrack e clica
   "marcar como vendido R$ X" na linha do clique. Dispara Purchase com a atribuição original.

2. **Zapier / n8n / Make** (recomendado): quando o CRM/pipeline marcar venda como fechada,
   faça um POST:
   \`\`\`http
   POST ${supabaseBase}/functions/v1/whatsapp-conversion
   X-Api-Key: ${cfg.publicKey || "<PUBLIC_KEY>"}
   Content-Type: application/json

   {
     "click_id": "CT-AB12CD",   // extrair do "Ref: CT-XXXXXX" na conversa
     "value": 297.00,
     "currency": "USD",          // ISO-4217 da venda (USD, EUR, BRL, MXN, etc.)
     "source": "webhook"
   }
   \`\`\`

3. **WhatsApp Business Cloud API** (automático): configure webhook em
   \`${supabaseBase}/functions/v1/whatsapp-business-webhook?key=<PUBLIC_KEY>\`
   e use a public key como \`verify_token\`. O CapiTrack lê mensagens entrantes e,
   quando detectar texto tipo \`"fechado: R$ 297"\` ou \`"vendido 150"\`, marca o
   click_id (extraído do \`[Ref: CT-XXXXXX]\` na conversa) como convertido automaticamente.

**Resultado para otimização de campanhas:**
- Toda venda fechada vira \`Purchase\` enviado pra Meta CAPI + Google Ads + GA4
- Com \`gclid/fbclid/_fbp\` originais → match quality alto, atribuição correta
- Algoritmo de Meta/Google passa a otimizar pra perfis que **fecham venda no chat**,
  não só por quem clica no botão
- Use \`Purchase\` como conversão otimizada nas campanhas (não \`Lead\`/\`whatsapp_click\`)
` : "";

  return `${aiPreamble(cfg.targetAI)}

Aplique as correções de tracking abaixo, NA ORDEM, sem quebrar o que já funciona. Estratégia: ADITIVA (nunca remover chamadas existentes).
${detectionBlock(cfg)}${whatsappFixBlock}

═══════════════════════════════════════════════
CONTEXTO
═══════════════════════════════════════════════
Negócio: ${profile.label}
Plataforma: ${PLATFORM_LABELS[cfg.platform]}
Gateway: ${GATEWAY_LABELS[cfg.gateway]}
CapiTrack endpoint: ${cfg.endpoint}
CapiTrack public key: ${cfg.publicKey || "<COLE_SUA_PUBLIC_KEY>"}
Workspace ID: ${cfg.workspaceId || "<COLE_SEU_WORKSPACE_ID>"}

${PASSO_M_HARDENING_BLOCK}

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
9. **Checkout MULTI-ETAPAS (Pedido principal + N pagamentos adicionais)** — se aplicável:
   - [ ] **Auditoria**: você listou TODAS as etapas pagas do projeto (principal +
         N adicionais — ex.: taxa de entrega, taxa de manipulação, seguro, upsell,
         frete express, prioridade, garantia, **TMT** etc.). TMT é apenas exemplo.
   - [ ] Para CADA etapa, existe um Purchase distinto:
         principal = \`purchase:<root_order_code>\`,
         adicionais = \`purchase:<root_order_code>:step:<step_key>\`.
   - [ ] **NÃO** existe Purchase com event_id cru tipo \`EV-...\` (sem prefixo \`purchase:\`).
   - [ ] **NÃO** existe etapa adicional usando o orderCode dela própria como event_id
         principal (\`purchase:<orderCodeDaEtapa>\`).
   - [ ] **Toda etapa adicional** carrega \`gclid/msclkid/utm_*/fbp/session_id\`
         IDÊNTICOS ao do pedido principal (herança via root).
   - [ ] \`value\` de cada etapa adicional = APENAS o valor dela (não somado ao principal).
   - [ ] Falha em Google Ads com \`UNPARSEABLE_GCLID\` para gclid de teste sintético é
         **esperada** — não indica bug; confirma apenas que o gclid foi preservado.

- [ ] Eventos no CapiTrack com mesmo event_id = purchase:<order_id>
- [ ] Meta Events Manager mostra 1 Purchase (não 2) por etapa
- [ ] Google Ads Conversões mostra 1 (não 2) por etapa
- [ ] F5 na thank-you não duplica nenhuma etapa
- [ ] Reentrega manual de webhook não duplica
- [ ] (Se aplicável) Pedido principal e cada etapa adicional aparecem como Purchases
      separados, com event_ids distintos e sem duplicatas` : "Sem gateway — pular."}

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
