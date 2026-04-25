/**
 * Gerador de prompts para checkouts EXTERNOS / HOSPEDADOS.
 * O cliente sai do site para uma plataforma de terceiros (Yampi, Shopify,
 * WooCommerce, Hotmart, Kiwify, Eduzz, Monetizze etc.) que processa o pagamento.
 *
 * Foco:
 *  - Configurar webhook/callback da plataforma para CapiTrack
 *  - Passar UTMs/metadados quando suportado pela plataforma
 *  - Auditar permissões de scripts/pixels
 *  - Garantir que Purchase venha do webhook (não só da página de obrigado)
 *  - Mapear order_id/transaction_id estável
 *  - Deduplicação com pixel/browser via event_id padronizado
 *
 * Atualizado em 04/2026 — fluxo final validado.
 */

export type ExternalPlatform =
  | "yampi" | "shopify" | "woocommerce"
  | "hotmart" | "kiwify" | "eduzz" | "monetizze"
  | "cartpanda" | "ticto" | "braip" | "perfectpay"
  | "other";

export interface ExternalCheckoutConfig {
  platform: ExternalPlatform;
  publicKey: string;
  endpoint: string;
  /** URL base do projeto Supabase (para montar a URL canônica do webhook) */
  supabaseUrl: string;
}

export const EXTERNAL_PLATFORM_META: Record<ExternalPlatform, {
  label: string;
  category: "ecommerce" | "infoproduct";
  /** Slug usado no provider= da URL canônica do webhook gateway-webhook */
  providerSlug: string;
  /** A plataforma permite injeção de UTMs / metadados no checkout? */
  utmSupport: "native" | "url-params" | "limited" | "none";
  /** A plataforma permite scripts customizados / pixels server-side? */
  scriptSupport: "full" | "pixel-only" | "none";
  /** Onde encontrar a configuração de webhook na plataforma */
  webhookPath: string;
  /** Campo onde o order_id estável aparece no payload do webhook */
  orderIdField: string;
  notes: string;
}> = {
  yampi: {
    label: "Yampi", category: "ecommerce", providerSlug: "yampi",
    utmSupport: "native", scriptSupport: "full",
    webhookPath: "Painel → Configurações → Webhooks",
    orderIdField: "order.number / order.id",
    notes: "Yampi suporta UTMs nativamente e custom scripts no checkout (Plus). Webhook envia order.paid quando o pagamento confirma.",
  },
  shopify: {
    label: "Shopify", category: "ecommerce", providerSlug: "shopify",
    utmSupport: "url-params", scriptSupport: "pixel-only",
    webhookPath: "Settings → Notifications → Webhooks",
    orderIdField: "order.id / order.order_number",
    notes: "Shopify Plus permite scripts no checkout; planos básicos só Pixel API. Webhook orders/paid contém UTMs em note_attributes/landing_site.",
  },
  woocommerce: {
    label: "WooCommerce", category: "ecommerce", providerSlug: "woocommerce",
    utmSupport: "native", scriptSupport: "full",
    webhookPath: "WooCommerce → Settings → Advanced → Webhooks",
    orderIdField: "order.id",
    notes: "Controle total via plugin/PHP. Webhook order.updated com status=processing/completed.",
  },
  hotmart: {
    label: "Hotmart", category: "infoproduct", providerSlug: "hotmart",
    utmSupport: "url-params", scriptSupport: "pixel-only",
    webhookPath: "Ferramentas → Postback / Webhook 2.0",
    orderIdField: "purchase.transaction",
    notes: "Hotmart preserva src/sck via URL e envia no postback. Use Webhook 2.0 (status=APPROVED).",
  },
  kiwify: {
    label: "Kiwify", category: "infoproduct", providerSlug: "kiwify",
    utmSupport: "url-params", scriptSupport: "pixel-only",
    webhookPath: "Configurações da venda → Webhook",
    orderIdField: "order_id",
    notes: "Kiwify preserva utm_* via querystring no link de checkout e envia no webhook order.paid.",
  },
  eduzz: {
    label: "Eduzz", category: "infoproduct", providerSlug: "eduzz",
    utmSupport: "url-params", scriptSupport: "pixel-only",
    webhookPath: "Minha Conta → Notificações (PostBack)",
    orderIdField: "trans_cod",
    notes: "Postback Eduzz inclui trans_cod estável. UTMs via querystring e campo utm na criação do checkout.",
  },
  monetizze: {
    label: "Monetizze", category: "infoproduct", providerSlug: "monetizze",
    utmSupport: "url-params", scriptSupport: "pixel-only",
    webhookPath: "Configurações → Postback",
    orderIdField: "venda.codigo",
    notes: "Postback com venda.status=Finalizada/Aprovada. UTMs via querystring no link.",
  },
  cartpanda: {
    label: "CartPanda", category: "ecommerce", providerSlug: "generic",
    utmSupport: "native", scriptSupport: "full",
    webhookPath: "Apps → Webhooks",
    orderIdField: "order.id",
    notes: "Suporte completo a UTMs e scripts customizados.",
  },
  ticto: {
    label: "Ticto", category: "infoproduct", providerSlug: "ticto",
    utmSupport: "url-params", scriptSupport: "pixel-only",
    webhookPath: "Integrações → Postback",
    orderIdField: "order.hash",
    notes: "Postback Ticto envia order.hash + status=authorized/paid.",
  },
  braip: {
    label: "Braip", category: "infoproduct", providerSlug: "generic",
    utmSupport: "url-params", scriptSupport: "pixel-only",
    webhookPath: "Configurações → Postback",
    orderIdField: "trans_cod",
    notes: "Postback similar ao Eduzz.",
  },
  perfectpay: {
    label: "PerfectPay", category: "infoproduct", providerSlug: "generic",
    utmSupport: "url-params", scriptSupport: "pixel-only",
    webhookPath: "Configurações → Notificações",
    orderIdField: "code_transaction",
    notes: "Postback com code_transaction + sale_status_enum.",
  },
  other: {
    label: "Outra plataforma", category: "ecommerce", providerSlug: "generic",
    utmSupport: "limited", scriptSupport: "pixel-only",
    webhookPath: "Verifique a documentação da plataforma",
    orderIdField: "order_id ou transaction_id",
    notes: "Fluxo genérico — adapte conforme documentação.",
  },
};

function webhookUrl(cfg: ExternalCheckoutConfig): string {
  const slug = EXTERNAL_PLATFORM_META[cfg.platform].providerSlug;
  return `${cfg.supabaseUrl}/functions/v1/gateway-webhook?provider=${slug}`;
}

export function generateExternalCheckoutPrompt(cfg: ExternalCheckoutConfig): string {
  const m = EXTERNAL_PLATFORM_META[cfg.platform];
  const wh = webhookUrl(cfg);

  return `# Tarefa: Implementar tracking de Purchase com checkout EXTERNO/HOSPEDADO (${m.label}) + CapiTrack

## Contexto
O cliente **sai do meu site** e vai pagar na plataforma **${m.label}** (checkout hospedado).
Eu não controlo o fluxo de pagamento — apenas envio o usuário para lá com tracking e
recebo o status final via **webhook/postback** da plataforma.

Suporte da plataforma:
- UTMs / metadados: **${m.utmSupport}**
- Scripts customizados / pixels: **${m.scriptSupport}**
- Webhook: \`${m.webhookPath}\`
- Order ID estável: \`${m.orderIdField}\`

> ${m.notes}

Implemente as **5 camadas** abaixo.

## 1. Auditar permissões da plataforma (FAÇA PRIMEIRO)
Confirme antes de prosseguir:
- [ ] A plataforma permite **passar UTMs/metadados** no link de checkout?
  → Suporte detectado: **${m.utmSupport}**.
- [ ] A plataforma permite **scripts customizados** ou apenas **pixel server-side**?
  → Suporte detectado: **${m.scriptSupport}**.
- [ ] Onde fica a configuração de **webhook/postback**?
  → \`${m.webhookPath}\`.
- [ ] Qual campo do payload do webhook é o **order_id estável** que aparece no painel
      da plataforma E no histórico do cliente?
  → Esperado: \`${m.orderIdField}\`.

Se algum item for "não suportado", documente o limite — algumas conversões só virão
via webhook (sem dedup com pixel browser).

## 2. Capturar tracking no MEU site e injetar no link de checkout
Antes de redirecionar para ${m.label}, leia cookies + querystring + signals do navegador
e **acrescente** ao link OU persista em \`sessionStorage\` para usar na thank-you page.

> ⚠️ Nem toda plataforma de checkout hospedado aceita todos os metadados via querystring.
> Plataformas como **Shopify (planos básicos)**, **Hotmart**, **Kiwify** e **Eduzz** geralmente
> só preservam UTMs e \`src\`/\`sck\`. Campos como \`fbp\`, \`fbc\` e \`ga_client_id\` **NÃO** podem
> ser injetados no checkout — então capturamos no nosso site e reenviamos na thank-you page
> (passo 3) E/OU enriquecemos via \`session_id\` correlacionado no webhook (passo 4).

\`\`\`html
<script>
(function () {
  // 2.1 captura querystring (click IDs + UTMs)
  var p = new URLSearchParams(location.search);
  var keys = ["gclid","gbraid","wbraid","fbclid","ttclid","msclkid",
              "utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
  keys.forEach(function (k) {
    var v = p.get(k);
    if (v) document.cookie = "ct_" + k + "=" + encodeURIComponent(v) +
      "; path=/; max-age=" + (60*60*24*90) + "; SameSite=Lax";
  });

  // 2.2 captura signals do navegador (landing/referrer/user_agent)
  if (!sessionStorage.getItem("ct_landing"))
    sessionStorage.setItem("ct_landing", location.href);
  if (!sessionStorage.getItem("ct_referrer"))
    sessionStorage.setItem("ct_referrer", document.referrer || "");
  sessionStorage.setItem("ct_user_agent", navigator.userAgent || "");

  // 2.3 helper para ler cookies (_ga, _fbp, _fbc) com late-bind
  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\\]\\\\\\/+^]/g, "\\\\$&") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function readGaClientId() {
    // _ga = GA1.2.<client_id_part1>.<client_id_part2> → client_id = "p1.p2"
    var ga = readCookie("_ga"); if (!ga) return null;
    var parts = ga.split("."); if (parts.length < 4) return null;
    return parts.slice(-2).join(".");
  }
  // expõe globalmente para a thank-you page e o builder
  window.__ctReadGaClientId = readGaClientId;
  window.__ctReadFbp = function () { return readCookie("_fbp"); };
  window.__ctReadFbc = function () { return readCookie("_fbc"); };
})();

// 2.4 ao clicar em "Comprar", enriqueça o link de checkout
function buildCheckoutUrl(baseUrl) {
  var c = Object.fromEntries(document.cookie.split("; ").map(function(x){
    var i = x.indexOf("="); return [x.slice(0,i), decodeURIComponent(x.slice(i+1))];
  }).filter(function(p){return p[0];}));
  var u = new URL(baseUrl);
  // UTMs + click IDs (case-sensitive — nunca .toLowerCase())
  ["utm_source","utm_medium","utm_campaign","utm_content","utm_term",
   "gclid","gbraid","wbraid","fbclid","ttclid","msclkid"].forEach(function(k){
    var v = c["ct_"+k]; if (v) u.searchParams.set(k, v);
  });
  // session_id permite o backend correlacionar com o webhook depois
  var sid = c.ct_session || sessionStorage.getItem("ct_session");
  if (sid) u.searchParams.set("session_id", sid);
  // ga_client_id / fbp / fbc — só passam se a plataforma aceitar querystring custom
  // (Yampi/WooCommerce/CartPanda sim; Shopify básico/Hotmart/Kiwify ignoram)
  var gcid = window.__ctReadGaClientId && window.__ctReadGaClientId();
  if (gcid) u.searchParams.set("ga_client_id", gcid);
  var fbp = window.__ctReadFbp && window.__ctReadFbp();
  if (fbp) u.searchParams.set("fbp", fbp);
  var fbc = window.__ctReadFbc && window.__ctReadFbc();
  if (fbc) u.searchParams.set("fbc", fbc);
  // sck/src para Hotmart-like — mantém compatibilidade
  if (c.ct_utm_source) u.searchParams.set("src", c.ct_utm_source);
  return u.toString();
}
</script>
\`\`\`

${m.utmSupport === "none"
  ? `> ⚠️ ${m.label} **não preserva** UTMs nativamente. A única atribuição confiável virá da correlação \`session_id\` no webhook (passo 4) + signals da thank-you page (passo 3).`
  : m.utmSupport === "native" || m.utmSupport === "url-params"
    ? `> ✅ ${m.label} preserva UTMs/querystring no checkout. \`fbp\`/\`fbc\`/\`ga_client_id\` podem ou não ser preservados — sempre reforce via thank-you page (passo 3).`
    : `> ⚠️ ${m.label} tem suporte limitado a metadados — capture tudo no nosso site e reenvie na thank-you page (passo 3).`}

## 3. Página de obrigado / pixel browser (fallback + signals enriquecidos)
A thank-you é **APENAS reforço** — o Purchase oficial vem do webhook (passo 4).
Aqui apenas mandamos os signals do navegador que o webhook NÃO consegue capturar
(\`fbp\`, \`fbc\`, \`ga_client_id\`, \`user_agent\`, \`landing_page\`, \`referrer\`),
todos com o **MESMO event_id** para deduplicação automática.

\`\`\`html
<script>
(function () {
  var orderCode = new URLSearchParams(location.search).get("order_id"); // ou path param
  if (!orderCode) return;
  var eventId = "purchase:" + orderCode; // ⚠️ mesmo padrão usado pelo webhook

  // helpers (mesmos do passo 2 — caso a thank-you esteja em domínio diferente, redefina)
  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\\]\\\\\\/+^]/g, "\\\\$&") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function readGaClientId() {
    var ga = readCookie("_ga"); if (!ga) return null;
    var parts = ga.split("."); if (parts.length < 4) return null;
    return parts.slice(-2).join(".");
  }

  // Late-bind: tenta 3x com 50ms se _ga ainda não foi setado pelo gtag.js
  function withGaClientId(cb, attempt) {
    attempt = attempt || 0;
    var gcid = readGaClientId();
    if (gcid || attempt >= 3) return cb(gcid);
    setTimeout(function(){ withGaClientId(cb, attempt + 1); }, 50);
  }

  withGaClientId(function (gaClientId) {
    var payload = {
      event_id: eventId,
      order_id: orderCode,
      external_id: orderCode,
      // signals que o webhook do gateway NÃO tem acesso:
      fbp: readCookie("_fbp") || undefined,
      fbc: readCookie("_fbc") || undefined,
      ga_client_id: gaClientId || undefined,
      client_id: gaClientId || undefined, // alias GA4
      user_agent: navigator.userAgent,
      client_user_agent: navigator.userAgent, // alias Meta
      landing_page: sessionStorage.getItem("ct_landing") || location.href,
      referrer: sessionStorage.getItem("ct_referrer") || document.referrer || undefined,
      // Se a thank-you injetar valor/moeda, inclua:
      // value: ..., currency: "BRL",
    };

    // CapiTrack SDK (server-side dedup pelo event_id)
    if (window.CapiTrack) CapiTrack.track("Purchase", payload);

    // window.dataLayer (GA4 / GTM nativos)
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "purchase",
      ecommerce: { transaction_id: orderCode, currency: "BRL" },
      ga_client_id: gaClientId || undefined,
    });
  });
})();
</script>
\`\`\`

> 🔒 F5 na thank-you NÃO duplica: o backend dedupe pelo \`event_id = purchase:<orderCode>\`
> em janela de 48h em \`event_deliveries\`.
> 🔒 \`client_ip\` é capturado server-side pelo CapiTrack (header da requisição) — **nunca**
> envie IP no payload do browser.

## 4. Configurar webhook/postback de ${m.label} para o CapiTrack
**No painel ${m.label}** (\`${m.webhookPath}\`), configure o webhook EXATAMENTE para esta URL:

\`\`\`
${wh}
\`\`\`

Esta é a URL canônica exibida no painel **Webhook Logs** do CapiTrack — não monte manualmente.
Eventos a inscrever (mínimo):
- \`order.paid\` / \`status=APPROVED\` / \`PAID\` / \`Finalizada\`
- \`order.refunded\` / \`CANCELLED\`
- \`order.created\` (opcional, vira \`InitiateCheckout\`)

> ⚠️ **Purchase deve vir do WEBHOOK**, não só da thank-you page. A thank-you é
> apenas reforço com pixel browser (e dedup automático).

O CapiTrack:
1. Valida HMAC do ${m.label} (configure o secret no painel de integrações).
2. Lê o \`${m.orderIdField}\` como \`order_id\` estável.
3. Gera \`event_id = purchase:<order_id>\` — **mesmo padrão da thank-you**.
4. Faz upsert idempotente em \`orders\` / \`payments\` (UNIQUE em \`workspace_id+external_id\`).
5. Correlaciona com a sessão original pelo \`session_id\` (se você passou no link)
   ou pelos UTMs — herdando \`fbp\`/\`fbc\`/\`ga_client_id\`/\`landing_page\`/\`referrer\`/\`user_agent\`
   já capturados no passo 2/3 e armazenados em \`tracking_sources\`.
6. Captura \`client_ip\` automaticamente do header da requisição do gateway
   (X-Forwarded-For / CF-Connecting-IP) — você não precisa enviar.
7. Dispara para Meta CAPI / Google Ads CAPI / TikTok / GA4 — deduplicando contra
   o evento browser pelo \`event_id\`.

## 5. Mapear order_id/transaction_id de forma estável (multi-etapas)
- O \`order_id\` que você usa no \`event_id\` deve ser o **MESMO** entre:
  - Querystring da thank-you page (ex: \`?order_id=123\`)
  - Campo \`${m.orderIdField}\` do payload do webhook
  - ID que o cliente vê no e-mail/recibo
- \`transaction_id\` (ID da transação no gateway interno da ${m.label}) é **separado**
  e vai num campo próprio do payload — não troque pelo \`order_id\`.
- **Multi-etapas (genérico, sem nome fixo)**: se o checkout cobra mais de uma transação
  (ex.: taxa de entrega, taxa de manipulação, seguro, frete express, prioridade,
  garantia, upsell, complemento, **TMT** etc. — pode haver 2, 3, 5+ etapas com
  qualquer nome de página/rota), use:
  - **Pedido principal** → \`event_id = purchase:<root_order_code>\`
  - **Cada etapa adicional** → \`event_id = purchase:<root_order_code>:step:<step_key>\`
    onde \`step_key\` é estável e sem PII (\`shipping_fee\`, \`handling_fee\`, \`upsell_1\`,
    \`insurance\`, \`priority_fee\`, \`warranty\`, \`tmt\`...). **Nunca** dependa de uma
    página chamada "TMT" — descubra dinamicamente todas as etapas pagas no projeto.
  - O \`root_order_code\` deve ser **herdado** em toda etapa adicional (lookup pelo
    \`externalReference\`/\`parent_order_code\`). \`value\` de cada etapa é **isolado**,
    sem somar o pedido principal.
- Sempre propague no payload: \`gclid\`, \`gbraid\`, \`wbraid\`, \`fbclid\`, \`fbp\`, \`fbc\`,
  \`ttclid\`, **\`msclkid\`**, \`ga_client_id\`, \`session_id\`, \`utm_*\`, \`landing_page\`,
  \`referrer\`, \`user_agent\`, \`client_ip\` (este último capturado server-side).

## ⚠️ Regras críticas (Fluxo Final Validado — 04/2026)
1. **Principal: \`event_id = purchase:<root_order_code>\`** (mesmo formato em browser e webhook).
2. **Etapas adicionais: \`event_id = purchase:<root_order_code>:step:<step_key>\`** — referenciam
   sempre o root, nunca o orderCode da própria etapa.
3. **Webhook é a fonte de verdade**. Browser/thank-you é reforço opcional.
4. **Dedup automático**: 48h em \`event_deliveries\` por \`workspace_id+event_id+provider+destination\`.
5. **Click IDs case-sensitive**: nunca aplique \`.toLowerCase()\` em gclid/fbclid/msclkid/etc.
6. **Sem PII em logs**: CPF/e-mail/telefone/endereço/QR ficam server-to-server.
7. **HMAC obrigatório**: configure o secret de webhook no painel de integrações
   do CapiTrack — webhooks sem assinatura válida são rejeitados.

## Validação
1. Faça uma compra teste em ${m.label}. Anote o \`order_id\` mostrado pela plataforma.
2. **Webhook**: confirme em /webhook-logs do CapiTrack que o ${m.label} chegou com
   status \`processed\`, \`signature_valid=true\`, \`order_id\` correto.
3. **Browser** (se thank-you no seu domínio): confirme em /event-logs que aparece
   também a entrada com source=web, mesmo \`event_id = purchase:<order_id>\`,
   trazendo \`fbp\`, \`fbc\`, \`ga_client_id\`, \`user_agent\`, \`landing_page\`, \`referrer\`.
4. **Dedup**: em /destinations confirme que Meta/Google receberam **1** Purchase
   por \`event_id\` (não 2) — e que \`request_json\` raiz traz os signals enriquecidos.
5. F5 na thank-you NÃO duplica.
6. Reentrega manual do webhook NÃO duplica.
7. UTMs / gclid / fbclid / msclkid aparecem persistidos no \`order\` mostrado em /orders.
8. \`client_ip\` aparece no \`event_deliveries.request_json\` (capturado server-side, nunca do browser).

${PASSO_M_HARDENING_BLOCK}

## Não faça
- Não dispare Purchase apenas na thank-you (cliente fecha aba e some).
- Não use \`<external_id>:Purchase\` como event_id — agora é \`purchase:<order_id>\`.
- Não monte URL de webhook no formato antigo \`/gateway-webhook/${m.providerSlug}\`.
- Não logue PII (CPF/e-mail/telefone/endereço/QR-PIX).
- Não normalize click IDs (nunca \`.toLowerCase()\` em gclid/fbclid/msclkid/etc).
- Não envie \`client_ip\` do browser — sempre server-side.
- Não envie e-mail/telefone em texto puro para ads — sempre SHA-256 server-to-server.`;
}

// ──────────────────────────────────────────────────────────────────────────
// Passo M — Hardening sync block (apended to every generated prompt).
// Mantém prompts nativo + externo sincronizados com controles endurecidos:
// test_mode/replay seguro, rate-limit, queue-health, retention dry-run, RLS,
// PII report, export preview/hash-only, consentimento, multi-destination,
// IA em recommendation por padrão.
// ──────────────────────────────────────────────────────────────────────────
export const PASSO_M_HARDENING_BLOCK = `
## 🔐 Controles de release endurecidos (Passo M+N+O+P+Q+R+S — sincronizado)
Aplique TODOS no projeto-alvo:
- **test_mode / replay seguro**: \`webhook-replay-test\` exige owner/admin, valida bounds, NÃO grava \`event_deliveries\` reais e usa rate-limit DB-backed sem IP cru. Nunca exponha \`CRON_SECRET\` no frontend.
- **webhook-auth (Passo N)**: gateway-webhook EXIGE assinatura HMAC válida em produção (Stripe/Yampi/Shopify/Paddle/QuantumPay/genéricos com secret configurado). Sem assinatura ⇒ 401. \`event-replay\` e \`webhook-replay-test\` exigem JWT + workspace admin via \`requireUserJwt\`/\`requireWorkspaceAccess\`.
- **Rate-limit persistente**: SHA-256 do IP antes de qualquer RPC; bounds \`window 10-3600s\` e \`max_hits 1-10000\`. UI em \`/rate-limit-configs\` é role-gated (owner/admin).
- **Queue health + alertas internos**: backlog/falhas em \`queue_health_alerts\` com \`open → acknowledged → resolved\` auditados em \`audit_logs\` (sem PII). Auto-resolve quando condição limpa.
- **Alertas externos opt-in (Passo N)**: canais Slack/email/webhook ficam \`enabled=false\` + \`mode=dry_run\` por padrão. Nenhum dispatch real até toggle explícito do owner. Preview gerado por \`buildAlertPreview\` nunca contém workspace/user IDs.
- **Retention dry-run**: \`retention-job\` por padrão é monitor; execução destrutiva só manual via \`X-Cron-Secret\`. Cron NUNCA roda \`execute=1\` automático.
- **RLS auditado**: tabelas sensíveis (\`event_queue\`, \`queue_health_alerts\`, \`rate_limit_configs\`, \`audit_logs\`, \`audience_seed_exports\`, \`dead_letter_events\`, \`automation_actions\`, \`ad_conversion_destinations\`) têm RLS + policies não-permissivas (leitura por workspace, escrita só owner/admin).
- **Export hash-only + consentimento**: audience export aceita \`dry_run\` (apenas counts), e o export real exige \`require_consent !== false\` e devolve apenas hashes SHA-256.
- **Multi-destination**: cada Purchase pode espelhar para Meta/Google/TikTok/GA4 com dedup 4-col \`(workspace, event_id, provider, destination)\` — cada \`destination_id\`/\`account_id\`/\`conversion_action_id\` retém status e retry separados.
- **IA em recommendation por padrão**: ações automatizadas só com guardrails explícitos; IA sugere, humano confirma — auto apenas com \`automation_rules.execution_mode='auto'\` (NÃO em \`action_json\`) + \`guardrails_json\` (cooldown_hours, max_items_per_run, min_conversions, min_bid_factor/max_bid_factor, allow_pause).
- **Fast-path por gateway (Passo N+O)**: WooCommerce/Braip/CartPanda/PerfectPay seguem \`gateway-fast-path-guides.ts\` — webhook canônico \`?provider=generic\`, secret HMAC obrigatório, propagação de \`root_order_code\`/\`step_key\`/\`external_reference\`. Docs em \`/gateway-docs\`.
- **Data Reuse Center (Passo P+Q+R+S)**: \`/data-reuse-center\` mostra cobertura first-party (gclid/gbraid/wbraid/fbclid/ttclid/msclkid/ga_client_id/utm + email/phone hash) e elegibilidade offline conversion por provider. Tem paginação configurável (200/500/1000/2000/5000), preview por provider hash-only com amostras mascaradas, coverage report por click ID, verificador multi-destination consistency (duplicate/missing credential_ref/consent_gate) e simulador de automações dry-run com guardrails (min_conversions, cooldown_hours, max_budget_change_percent, max_bid_change_percent, rollback_plan). Auto bloqueado por padrão. Reuso NUNCA é cópia de aprendizado interno (ML).
- **Destination registry normalizado (Passo R)**: usar tabela \`ad_conversion_destinations\` (provider, destination_id, account_id, conversion_action_id, event_name, pixel_id, credential_ref, status, consent_gate_required, send_enabled, test_mode_default) com RLS — leitura por workspace, escrita só owner/admin. RPC \`list_ad_conversion_destinations\` nunca retorna segredos. Fallback heurístico para \`gateway_integrations_safe\` apenas quando registry vazio.
- **RPC de Data Reuse com paginação server-side (Passo R)**: usar \`data_reuse_summary(_workspace_id, _limit, _offset)\` (\`SECURITY DEFINER\`, member-gated, sem PII) para totalizar pedidos e cobertura — limites \`1..10000\`. Não fazer \`SELECT\` gigante client-side.
- **Simulador com automation_rules reais (Passo R)**: usar \`simulateRule()\` lendo \`enabled\`/\`execution_mode\`/\`guardrails_json\` da coluna; \`auto\` continua bloqueado a menos que \`guardrails.auto_enabled=true\` explícito. Nenhuma mutação real em Google/Meta/TikTok.
- **Registry admin UI (Passo S)**: página \`/destination-registry\` (role-gated owner/admin) lista, cria e edita linhas de \`ad_conversion_destinations\` com \`credential_ref\` mascarado via \`maskCredentialRef\` — segredos NUNCA aparecem na UI nem em logs. Preencher o registry é o que tira o workspace do fallback heurístico.
- **Keyset pagination (Passo S)**: usar a RPC \`data_reuse_summary_keyset\` com cursor \`(created_at,id)\` e botão "Carregar mais" no Data Reuse Center; manter fallback compatível com \`data_reuse_summary\` quando keyset não estiver disponível.
- **Multi-rule simulator (Passo S)**: \`simulateRulesForScope()\` itera TODAS as \`automation_rules\` aplicáveis por workspace/campanha/customer e agrupa por regra + outcome (allowed/needs_review/blocked/auto_blocked). Nunca curto-circuita na primeira regra; auto continua bloqueado sem \`guardrails.auto_enabled=true\`.
- **Destination dispatch gate (Passo S)**: \`decideDispatch()\` em \`destination-dispatch-gate.ts\` respeita \`send_enabled\`, \`status\`, \`consent_gate_required\` e \`test_mode_default\` por \`destination_id\`. Quando o registry está vazio para o provider, retorna \`fallback: true\` e o despachante legado segue funcionando sem regressão. Nada de chamadas externas reais em test_mode/dry_run.
- **PII report + audit viewer**: confira em \`/pii-release-report\` e \`/audit-logs\` (com redaction client-side de email/CPF/CNPJ/JWT/IP).
- **Relatório operacional**: status consolidado em \`/release-report\` (inclui marcador \`RLS semantic audit\` quando indisponível por falta de PGHOST em CI). Painel de RLS em \`/rls-warnings\`.
`;
