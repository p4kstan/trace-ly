/**
 * Gerador de prompts para checkouts NATIVOS (próprios) com qualquer gateway.
 * O projeto-alvo cria pedidos/pagamentos dentro do próprio site (PIX, cartão,
 * boleto, assinatura) e precisa:
 *  - capturar tracking na entrada
 *  - injetar metadata na chamada do gateway
 *  - disparar Purchase via 3 fontes IDEMPOTENTES (webhook + check-status + reconcile)
 *  - garantir purchase_tracked_at atômico para evitar duplicação
 *
 * Atualizado em 04/2026 com fluxo final validado:
 *  - event_id padrão = `purchase:<root_order_code>` (etapas adicionais — taxa, upsell,
 *    seguro, prioridade, TMT etc. — = `purchase:<root_order_code>:step:<step_key>`)
 *  - Webhook URL canônica: <SUPABASE_URL>/functions/v1/gateway-webhook?provider=<gateway>
 *  - PIX exige: pix-webhook + check-pix-status + reconcile-pix-payments
 *  - Reconcile cron 2-5min, idempotência via `tracked_events` (genérica para N etapas)
 *  - Click IDs case-sensitive (apenas .trim()), sem PII em logs
 */

export type PaymentMethod = "pix" | "card" | "boleto" | "subscription";

export type GatewayId =
  | "quantumpay" | "asaas" | "mercadopago" | "pagarme" | "stripe"
  | "appmax" | "pagseguro" | "iugu" | "efi" | "custom";

export interface NativeCheckoutConfig {
  gateway: GatewayId;
  methods: PaymentMethod[];
  publicKey: string;
  endpoint: string;
  /** URL base do projeto Supabase (para montar a URL canônica do webhook) */
  supabaseUrl: string;
  /** Stack do checkout (ajuda a IA-alvo gerar imports corretos) */
  stack: "react" | "next" | "vue" | "html" | "node-backend" | "unknown";
}

export const GATEWAY_META: Record<GatewayId, {
  label: string;
  /** Slug usado no provider= da URL canônica do webhook */
  providerSlug: string;
  /** Onde fica a chamada principal de criação de cobrança (hint pra IA buscar) */
  searchHints: string[];
  /** Estrutura do bloco metadata aceita pelo gateway */
  metadataKey: string;
  /** Status string que indica pagamento confirmado */
  paidStatus: string[];
}> = {
  quantumpay: {
    label: "QuantumPay", providerSlug: "quantumpay",
    searchHints: ["quantumpay", "/v1/charges", "externalReference"],
    metadataKey: "metadata", paidStatus: ["paid", "transaction_paid"],
  },
  asaas: {
    label: "Asaas", providerSlug: "asaas",
    searchHints: ["asaas", "/api/v3/payments", "billingType"],
    metadataKey: "externalReference + customField", paidStatus: ["RECEIVED", "CONFIRMED"],
  },
  mercadopago: {
    label: "Mercado Pago", providerSlug: "mercadopago",
    searchHints: ["mercadopago", "preferences", "/v1/payments"],
    metadataKey: "metadata", paidStatus: ["approved"],
  },
  pagarme: {
    label: "Pagar.me", providerSlug: "pagarme",
    searchHints: ["pagarme", "pagar.me", "/orders", "/charges"],
    metadataKey: "metadata", paidStatus: ["paid"],
  },
  stripe: {
    label: "Stripe", providerSlug: "stripe",
    searchHints: ["stripe", "paymentIntents.create", "checkout.sessions"],
    metadataKey: "metadata", paidStatus: ["succeeded", "paid"],
  },
  appmax: {
    label: "Appmax", providerSlug: "appmax",
    searchHints: ["appmax", "/api/v3/order"],
    metadataKey: "custom_fields", paidStatus: ["aprovado", "approved"],
  },
  pagseguro: {
    label: "PagSeguro", providerSlug: "pagseguro",
    searchHints: ["pagseguro", "pagbank", "/charges"],
    metadataKey: "metadata", paidStatus: ["PAID"],
  },
  iugu: {
    label: "Iugu", providerSlug: "iugu",
    searchHints: ["iugu", "/v1/invoices"],
    metadataKey: "custom_variables", paidStatus: ["paid"],
  },
  efi: {
    label: "Efí (Gerencianet)", providerSlug: "efi",
    searchHints: ["gerencianet", "efipay", "/v2/cob"],
    metadataKey: "infoAdicionais", paidStatus: ["CONCLUIDA"],
  },
  custom: {
    label: "Custom / Próprio", providerSlug: "generic",
    searchHints: ["createOrder", "createCharge", "createPayment"],
    metadataKey: "metadata", paidStatus: ["paid", "approved", "succeeded"],
  },
};

export const PAYMENT_META: Record<PaymentMethod, {
  label: string;
  flow: "sync" | "async";
  ga4Event: "purchase";
  metaEvent: "Purchase" | "Subscribe";
  hint: string;
}> = {
  pix: { label: "PIX", flow: "async", ga4Event: "purchase", metaEvent: "Purchase",
    hint: "Async. Purchase NUNCA pode depender só do frontend — exige 3 fontes idempotentes (webhook + check-pix-status + reconcile-pix-payments) chamando a mesma firePurchase()." },
  card: { label: "Cartão", flow: "sync", ga4Event: "purchase", metaEvent: "Purchase",
    hint: "Resposta síncrona — assim que a API retornar status approved, dispara Purchase no checkout. Webhook server-side roda em paralelo (idempotente)." },
  boleto: { label: "Boleto", flow: "async", ga4Event: "purchase", metaEvent: "Purchase",
    hint: "Boleto leva 1-3 dias úteis. Purchase apenas via webhook + reconcile-boleto. NÃO dispare client-side." },
  subscription: { label: "Assinatura", flow: "sync", ga4Event: "purchase", metaEvent: "Subscribe",
    hint: "Primeiro pagamento dispara Subscribe + Purchase. Renovações apenas server-side via webhook recurring_paid (idempotente por charge_id)." },
};

// ──────────────────────────────────────────────────────────────────────────

function captureBlock(): string {
  return `## 1. Capturar tracking na entrada do site (cookies + sessionStorage)
Edite o \`index.html\` (ou layout raiz) e adicione ANTES do \`</head>\`:

\`\`\`html
<script>
(function () {
  var p = new URLSearchParams(location.search);
  // Click IDs + UTMs — case-sensitive, NUNCA normalizar
  var keys = [
    "gclid","gbraid","wbraid","fbclid","ttclid","msclkid",
    "utm_source","utm_medium","utm_campaign","utm_content","utm_term"
  ];
  keys.forEach(function (k) {
    var v = p.get(k);
    if (v) document.cookie = "ct_" + k + "=" + encodeURIComponent(v) +
      "; path=/; max-age=" + (60*60*24*90) + "; SameSite=Lax";
  });
  // Landing/referrer só na primeira página da sessão
  if (!sessionStorage.getItem("ct_landing")) {
    sessionStorage.setItem("ct_landing", location.href);
    sessionStorage.setItem("ct_referrer", document.referrer || "");
  }
  // Late-bind do _ga (gtag.js pode setar de forma assíncrona)
  function readGa() {
    var m = document.cookie.match(/(?:^|;\\s*)_ga=GA\\d\\.\\d\\.([^;]+)/);
    return m ? m[1] : null;
  }
  var tries = 0;
  (function tick(){
    var v = readGa();
    if (v) { try { sessionStorage.setItem("ct_ga_client_id", v); } catch(e){} return; }
    if (++tries < 20) setTimeout(tick, 250);
  })();
})();
</script>
\`\`\`

> ⚠️ Click IDs (gclid/gbraid/wbraid/fbclid/ttclid/msclkid) são **case-sensitive**.
> Nunca aplique \`.toLowerCase()\`, \`.normalize()\`, ou regex destrutivo.`;
}

function helperBlock(stack: NativeCheckoutConfig["stack"]): string {
  const ext = stack === "html" ? "js" : "ts";
  const typed = ext === "ts";
  return `## 2. Helper para ler tracking + late-bind de ga_client_id
Crie \`src/lib/tracking.${ext}\`:

\`\`\`${ext}
export function readTracking()${typed ? "" : ""} {
  const c${typed ? ": Record<string, string>" : ""} = Object.fromEntries(
    document.cookie.split("; ").map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
    }).filter(([k]) => k)
  );
  const url = new URLSearchParams(location.search);
  // ⚠️ Click IDs case-sensitive. Apenas .trim() — NUNCA .toLowerCase()/.normalize().
  const get = (k${typed ? ": string" : ""}) => {
    const v = c["ct_" + k] || url.get(k) || null;
    return v ? String(v).trim() : null;
  };

  // ga_client_id com late-bind: tenta cookie _ga primeiro, fallback ao sessionStorage.
  let gaClientId${typed ? ": string | null" : ""} = null;
  const m = (c._ga || "").match(/^GA\\d\\.\\d\\.(.+)$/);
  if (m) gaClientId = m[1];
  else { try { gaClientId = sessionStorage.getItem("ct_ga_client_id"); } catch(e){} }

  // session_id do CapiTrack — usado pelo backend pra fallback de atribuição
  const sessionId = c.ct_session
    || (typeof sessionStorage !== "undefined" && sessionStorage.getItem("ct_session"))
    || null;

  return {
    gclid: get("gclid"), gbraid: get("gbraid"), wbraid: get("wbraid"),
    fbclid: get("fbclid"), ttclid: get("ttclid"), msclkid: get("msclkid"),
    fbp: c._fbp || null, fbc: c._fbc || null,
    ga_client_id: gaClientId,
    client_id: gaClientId, // alias compat
    session_id: sessionId,
    utm_source: get("utm_source"), utm_medium: get("utm_medium"),
    utm_campaign: get("utm_campaign"),
    utm_content: get("utm_content"), utm_term: get("utm_term"),
    landing_page: (typeof sessionStorage !== "undefined"
      && sessionStorage.getItem("ct_landing")) || location.href,
    referrer: (typeof sessionStorage !== "undefined"
      && sessionStorage.getItem("ct_referrer")) || document.referrer || null,
    user_agent: navigator.userAgent,
  };
}
\`\`\``;
}

function gatewayBlock(cfg: NativeCheckoutConfig): string {
  const g = GATEWAY_META[cfg.gateway];
  return `## 3. Persistir tracking + injetar metadata na criação da cobrança ${g.label}
Encontre onde meu código cria a cobrança (busque por: \`${g.searchHints.join("\`, \`")}\`).

**No backend**, antes de chamar o gateway:
1. Gere \`orderCode\` estável (ex: \`EV-YYYYMMDD-<6hex>\`).
2. Persista o pedido com **TODOS** os campos de tracking recebidos do frontend, incluindo
   \`gclid, gbraid, wbraid, fbclid, fbp, fbc, ttclid, msclkid, ga_client_id, session_id,
   utm_*, landing_page, referrer, user_agent, client_ip\` (do \`req.headers["x-forwarded-for"]\`).
3. Crie a coluna \`purchase_tracked_at TIMESTAMPTZ NULL\` no pedido — chave da idempotência.

**Ao chamar o ${g.label}**, injete metadata mínima (NUNCA mande PII em log):

\`\`\`ts
const body = {
  amount: Math.round(total * 100),
  externalReference: orderCode,
  ${g.metadataKey.split(" ")[0]}: {
    orderCode,
    workspace_ref: "${cfg.publicKey || "<PUBLIC_KEY>"}",
    // Identificadores técnicos (não-PII) que retornam no webhook:
    session_id: tracking.session_id,
    ga_client_id: tracking.ga_client_id,
    gclid: tracking.gclid, fbclid: tracking.fbclid, ttclid: tracking.ttclid,
    utm_source: tracking.utm_source, utm_campaign: tracking.utm_campaign,
  },
};
\`\`\`

> ⚠️ NÃO logue CPF, e-mail, telefone, endereço, QR/PIX. Use \`****\` em logs.
> PII só vai server-to-server (já hasheado quando enviado a ads).`;
}

function purchaseBlock(cfg: NativeCheckoutConfig): string {
  const hasCard = cfg.methods.includes("card");
  const hasPix = cfg.methods.includes("pix");
  const hasBoleto = cfg.methods.includes("boleto");
  const hasSub = cfg.methods.includes("subscription");

  const sections: string[] = [];

  // Bloco genérico: regra de checkout multi-etapas (Main + N pagamentos adicionais)
  sections.push(`### 4.0a Checkout MULTI-ETAPAS — Pedido Principal + N Pagamentos Adicionais (CRÍTICO)
Muitos checkouts cobram **mais de uma transação legítima** no mesmo fluxo: pedido principal
\`+\` pagamentos adicionais (ex.: taxa de entrega, taxa de manipulação, seguro, frete express,
prioridade, garantia estendida, upsell de uma segunda tela, complemento, **TMT**, etc.).
Pode haver **2, 3, 5 ou mais etapas** com **qualquer nome de página/rota**.

> ⚠️ **TMT é apenas um exemplo de etapa adicional** — a regra abaixo é **genérica** para N
> pagamentos. **Não assuma o nome "TMT"** — descubra dinamicamente todas as etapas pagas
> que existem no projeto-alvo.

#### Auditoria obrigatória das etapas pagas (faça PRIMEIRO)
Antes de implementar tracking, **mapeie no código do projeto-alvo** todas as páginas/rotas/
componentes/funções que criam pagamento ou checkout session. Liste cada etapa encontrada com:

| campo | descrição |
|-------|-----------|
| \`route/page/component\` | arquivo e rota onde a etapa é cobrada |
| \`gateway/provider\` | gateway usado nessa etapa (pode variar entre etapas) |
| \`product/description\` | o que está sendo cobrado |
| \`value\` | valor isolado dessa etapa |
| \`externalReference/metadata\` | como o gateway identifica a etapa |
| \`status source\` | webhook? polling? confirmação síncrona? |
| \`thank-you / next page\` | para onde o usuário vai após pagar |
| \`step_key\` (sugerido) | identificador estável: \`main\`, \`shipping_fee\`, \`handling_fee\`, \`upsell_1\`, \`insurance\`, \`priority_fee\`, \`warranty\`, etc. |
| \`relação com principal\` | é o pedido raiz, ou depende de um \`root_order_code\`? |

#### Modelo canônico

1. **\`root_order_code\` / \`root_checkout_id\`**: ID estável que representa a JORNADA inteira
   (do início ao fim, abrangendo todas as cobranças). Costuma ser o orderCode do pedido
   principal; se o checkout cria um \`checkoutId\` antes do pedido, esse vira o root.

2. **Pedido principal**:
   - \`step_key = "main"\`
   - \`event_id = \\\`purchase:<root_order_code>\\\`\`

3. **Cada pagamento adicional**:
   - \`step_key\` **estável** derivado do tipo/rota/produto. Ex.: \`shipping_fee\`,
     \`handling_fee\`, \`upsell_1\`, \`insurance\`, \`priority_fee\`, \`warranty\`, \`tmt\`.
   - \`event_id = \\\`purchase:<root_order_code>:step:<step_key>\\\`\`.
   - Se houver **repetições do mesmo tipo** no fluxo (ex.: 2 upsells), use índice
     determinístico ou hash do \`transaction_id\` normalizado para evitar colisão:
     \`purchase:<root>:step:upsell_2\` ou \`purchase:<root>:step:upsell:<txHash8>\`.

4. **Erros que QUEBRAM atribuição (NUNCA fazer):**
   - ❌ Enviar etapa adicional com \`event_id\` cru (\`EV-20260425-XXXX\`) sem prefixo \`purchase:\`.
   - ❌ Usar o orderCode da **própria** etapa adicional como event_id principal
     (\`purchase:<orderCodeDaTaxa>\`) em vez de referenciar o root.
   - ❌ Etapa adicional chegar no \`/track\` sem \`gclid/msclkid/fbp/utm_*/session_id\`
     (gateway criou cobrança com metadata vazia e o backend não buscou o root).
   - ❌ Etapa adicional enviar \`value\` somando o valor do pedido principal
     (infla a receita reportada).

#### Relação pai → filho

5. **\`parent_order_code\` / \`root_order_code\`** persistido no banco em **toda** etapa
   adicional. \`externalReference\` no gateway deve seguir um padrão deterministico, ex.:
   \`step:<step_key>:<root_order_code>\` ou \`<step_key>-<root_order_code>\` — documente
   o padrão escolhido no código.
6. **Webhook, polling e reconcile** devem identificar o root e o \`step_key\` mesmo
   quando a página tem nome diferente (busca por \`externalReference\`, ou por
   \`gateway_transaction_id → orders.parent_order_code\`).

#### Atribuição (herança de metadata)

7. O **pedido principal** captura e persiste: \`gclid, gbraid, wbraid, fbclid, ttclid,
   msclkid, fbp, fbc, ga_client_id, session_id, utm_source, utm_medium, utm_campaign,
   utm_content, utm_term, landing_page, referrer, user_agent\` e \`client_ip\` quando
   disponível.
8. **Toda etapa adicional** herda esses campos do pedido principal (root) **se não
   vierem no metadata do gateway**. Lookup do root pelo \`externalReference\`/
   \`parent_order_code\`. Se metadata da etapa adicional chegar vazia, o backend
   (webhook/polling/reconcile) **completa antes** de chamar \`/track\`.

#### Receita / conversão

9. O pedido principal envia \`value\` do pedido principal.
10. Cada etapa adicional envia \`value\` **somente daquela etapa**, sem somar/inflar
    o pedido principal.
11. Como reportar para os ads (cabeça do anunciante):
    - Quer otimizar **só pelo pedido principal**? Trate as etapas adicionais como
      eventos secundários (secondary conversion) ou apenas registre internamente.
    - Quer otimizar **LTV / receita total**? Envie cada etapa como Purchase separado
      com \`event_id\` único e \`value\` isolado.
    - **Nunca** duplicar o mesmo Purchase para inflar receita.

#### Idempotência multi-source (genérica para N etapas)

12. **Trava por \`event_id\` / \`step_key\`**, não por uma única coluna
    \`purchase_tracked_at\` (que bloquearia as adicionais). Recomendado:

    \`\`\`sql
    -- tabela genérica de despachos por evento (preferida quando N é dinâmico)
    create table public.tracked_events (
      event_id text primary key,
      root_order_code text not null,
      step_key text not null,
      source text not null,
      tracked_at timestamptz not null default now()
    );
    create index on public.tracked_events (root_order_code);
    \`\`\`

    Ou, se o número de etapas é **fixo e pequeno**, uma coluna por etapa
    (\`purchase_tracked_at\`, \`shipping_fee_tracked_at\`, \`upsell_1_tracked_at\`).
13. Webhook, polling, reconcile e fallback browser-side **passam pela mesma função
    idempotente** por \`event_id\`. F5, reentrega de webhook, polling simultâneo e
    reconcile **não podem duplicar**.

#### Browser-side (fallback)

14. Remover qualquer Purchase browser-side com \`event_id\` cru (sem prefixo).
15. Se houver fallback no navegador (ex.: thank-you page), ele deve usar **exatamente
    o mesmo** \`event_id\` server-side: main = \`purchase:<root_order_code>\`,
    extras = \`purchase:<root_order_code>:step:<step_key>\`.
16. \`sessionStorage\` deve ser **por event_id**, não uma flag única que bloqueia
    todas as etapas:
    \`\`\`ts
    const fired = JSON.parse(sessionStorage.getItem("ct_fired_purchases") || "[]");
    if (fired.includes(eventId)) return;
    fired.push(eventId);
    sessionStorage.setItem("ct_fired_purchases", JSON.stringify(fired));
    \`\`\`

#### Função genérica recomendada

\`\`\`ts
// supabase/functions/_shared/fire-step-purchase.ts
// Genérica para QUALQUER etapa adicional (taxa, upsell, seguro, prioridade, TMT, etc.)
export async function maybeFireStepPurchase(opts: {
  rootOrderCode: string;
  stepKey: string;          // "shipping_fee" | "handling_fee" | "upsell_1" | "insurance" | "tmt" | ...
  stepOrderCode: string;    // orderCode da própria etapa adicional
  source: string;           // "webhook" | "polling" | "reconcile" | "frontend"
}) {
  const { rootOrderCode, stepKey, stepOrderCode, source } = opts;
  const eventId = \`purchase:\${rootOrderCode}:step:\${stepKey}\`;

  // 1) Trava atômica POR event_id (suporta N etapas sem colidir entre si)
  const { data: lock, error: lockErr } = await supabase
    .from("tracked_events")
    .insert({ event_id: eventId, root_order_code: rootOrderCode, step_key: stepKey, source })
    .select().maybeSingle();
  if (lockErr) {
    if (String(lockErr.message).includes("duplicate")) {
      console.log({ source, eventId, skipped: "already_tracked" });
      return { fired: false, reason: "already_tracked" };
    }
    throw lockErr;
  }

  // 2) Carrega o pedido raiz (atribuição)
  const { data: root } = await supabase
    .from("orders").select("*").eq("order_code", rootOrderCode).maybeSingle();
  if (!root) {
    console.log({ source, eventId, skipped: "root_not_found" });
    return { fired: false, reason: "root_not_found" };
  }

  // 3) Carrega a transação da etapa adicional (valor isolado)
  const { data: step } = await supabase
    .from("orders").select("*").eq("order_code", stepOrderCode).maybeSingle();
  if (!step) {
    console.log({ source, eventId, skipped: "step_not_found" });
    return { fired: false, reason: "step_not_found" };
  }

  // 4) Despacha — value APENAS desta etapa, metadata HERDADA do root
  const r = await fetch("${cfg.endpoint}", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "${cfg.publicKey || "<PUBLIC_KEY>"}" },
    body: JSON.stringify({
      event_name: "Purchase",
      event_id: eventId,
      order_id: stepOrderCode,
      parent_order_id: rootOrderCode,
      step_key: stepKey,
      transaction_id: step.gateway_transaction_id,
      value: step.total,                         // ⚠️ APENAS o valor desta etapa
      currency: step.currency || "BRL",
      payment_status: "paid",
      action_source: source === "frontend" ? "website" : "system_generated",
      // Metadata HERDADA do root (case-sensitive, sem normalização):
      gclid: root.gclid, gbraid: root.gbraid, wbraid: root.wbraid,
      fbclid: root.fbclid, ttclid: root.ttclid, msclkid: root.msclkid,
      fbp: root.fbp, fbc: root.fbc,
      ga_client_id: root.ga_client_id, client_id: root.ga_client_id,
      session_id: root.session_id,
      utm_source: root.utm_source, utm_medium: root.utm_medium,
      utm_campaign: root.utm_campaign, utm_content: root.utm_content,
      utm_term: root.utm_term,
      landing_page: root.landing_page, referrer: root.referrer,
      user_agent: root.user_agent, client_ip: root.client_ip,
      email: root.customer_email, phone: root.customer_phone,
    }),
  });

  // 5) Se o POST falhar, REMOVA a trava para a próxima fonte tentar
  if (!r.ok) {
    await supabase.from("tracked_events").delete().eq("event_id", eventId);
    throw new Error(\`fire failed: \${r.status}\`);
  }

  console.log({ source, eventId, rootOrderCode, stepKey, fired: true, value: step.total });
  return { fired: true, eventId };
}
\`\`\`

> 💡 **Exemplo concreto** com TMT (apenas um dentre N possíveis):
> \`maybeFireStepPurchase({ rootOrderCode, stepKey: "tmt", stepOrderCode: tmtOrderCode, source: "pix-webhook" })\`
> → gera \`event_id = purchase:<rootOrderCode>:step:tmt\`.

> 🔒 **Logs sem PII**: registre apenas \`root_order_code, step_key, event_id, value, source,
> provider, status\`. Nunca CPF, e-mail, telefone, endereço, PIX copia-e-cola ou QR code.`);

  // Função compartilhada — central de Purchase do PEDIDO PRINCIPAL idempotente
  sections.push(`### 4.0b \`maybeFirePurchase()\` — idempotência atômica do PEDIDO PRINCIPAL (CRÍTICO)
Crie no backend uma função compartilhada chamada por **todas** as fontes do pedido principal
(webhook, check-status, reconcile, frontend). Garante "exactly-once" via UPDATE atômico.

> Para **cada pagamento adicional** descoberto na auditoria (taxa, upsell, seguro, prioridade,
> TMT etc.), use a função genérica \`maybeFireStepPurchase({ rootOrderCode, stepKey,
> stepOrderCode, source })\` mostrada na seção 4.0a — ela aceita **N etapas** sem alterar código.

\`\`\`ts
// supabase/functions/_shared/fire-purchase.ts (ou backend equivalente)
// Específico para o PEDIDO PRINCIPAL (root). Para etapas adicionais, use
// maybeFireStepPurchase({ rootOrderCode, stepKey, stepOrderCode, source }).
export async function maybeFirePurchase(orderCode: string, source: string) {
  // 1) UPDATE atômico: só prossegue se purchase_tracked_at AINDA é NULL
  const { data, error } = await supabase
    .from("orders")
    .update({ purchase_tracked_at: new Date().toISOString(), purchase_tracked_source: source })
    .eq("order_code", orderCode)
    .is("purchase_tracked_at", null)
    .select("*, items:order_items(*)")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    // Já foi tracked por outra fonte → no-op silencioso (idempotente)
    console.log({ source, orderCode, skipped: "already_tracked" });
    return { fired: false, reason: "already_tracked" };
  }

  // 2) event_id do PRINCIPAL (root). Etapas adicionais NÃO passam por aqui.
  const eventId = \`purchase:\${orderCode}\`;

  // 3) Dispara para CapiTrack (server-side) com TODOS os metadados técnicos
  const r = await fetch("${cfg.endpoint}", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "${cfg.publicKey || "<PUBLIC_KEY>"}" },
    body: JSON.stringify({
      event_name: "Purchase",
      event_id: eventId,
      order_id: orderCode,
      transaction_id: data.gateway_transaction_id,
      gateway_order_id: data.gateway_order_id,
      external_id: data.gateway_transaction_id || orderCode,
      value: data.total, currency: data.currency || "BRL",
      payment_type: data.payment_method,
      payment_status: "paid",
      // PII server-to-server (CapiTrack hasheia antes de mandar pra ads):
      email: data.customer_email, phone: data.customer_phone,
      customer_document: data.customer_document,
      // Metadados técnicos — case-sensitive, sem normalização:
      gclid: data.gclid, gbraid: data.gbraid, wbraid: data.wbraid,
      fbclid: data.fbclid, ttclid: data.ttclid, msclkid: data.msclkid,
      fbp: data.fbp, fbc: data.fbc,
      ga_client_id: data.ga_client_id, client_id: data.ga_client_id,
      session_id: data.session_id,
      utm_source: data.utm_source, utm_medium: data.utm_medium,
      utm_campaign: data.utm_campaign, utm_content: data.utm_content,
      utm_term: data.utm_term,
      landing_page: data.landing_page, referrer: data.referrer,
      user_agent: data.user_agent, client_ip: data.client_ip,
      action_source: source === "frontend" ? "website" : "system_generated",
      url: data.landing_page || null,
    }),
  });

  // 4) Se o POST falhar, REVERTA purchase_tracked_at pra próxima fonte tentar
  if (!r.ok) {
    await supabase.from("orders").update({ purchase_tracked_at: null })
      .eq("order_code", orderCode);
    throw new Error(\`fire failed: \${r.status}\`);
  }

  console.log({ source, orderCode, eventId, fired: true });
  return { fired: true, eventId };
}
\`\`\`

> ⚠️ \`event_id\` do principal = **\`purchase:<root_order_code>\`**. Etapas adicionais
> (taxa/upsell/seguro/prioridade/TMT/etc.) = **\`purchase:<root_order_code>:step:<step_key>\`**
> via \`maybeFireStepPurchase\`. Não use mais \`<externalId>:Purchase\` nem event_id cru
> (\`EV-...\`). \`transaction_id\`/\`gateway_order_id\` são preservados em campos separados.`);

  if (hasCard) {
    sections.push(`### 4a. CARTÃO (síncrono — chama maybeFirePurchase no backend)
\`\`\`ts
// 1) Frontend: ao receber resposta approved da sua API → chama backend
const r = await fetch("/api/orders/" + orderCode + "/confirm-card", { method: "POST" });

// 2) Backend (handler da rota): valida status do gateway e chama maybeFirePurchase
const PAID = ["approved","paid","succeeded","captured","confirmed"];
if (!PAID.includes(String(gatewayResp.status).toLowerCase())) return res.json({ ok: false });
await maybeFirePurchase(orderCode, "frontend-card");
return res.json({ ok: true });

// 3) Webhook server-side do gateway (em paralelo) → chama o MESMO maybeFirePurchase
//    com source="webhook-card" — o segundo é silenciosamente skipped pela trava atômica.
\`\`\``);
  }

  if (hasPix) {
    sections.push(`### 4b. PIX (assíncrono — 3 FONTES IDEMPOTENTES OBRIGATÓRIAS)
PIX é assíncrono. Purchase **NUNCA** pode depender só do frontend. Crie 3 fontes
que chamam a MESMA \`maybeFirePurchase()\`:

#### 4b.1 Webhook do gateway (\`pix-webhook\`)
\`\`\`ts
// supabase/functions/pix-webhook/index.ts
Deno.serve(async (req) => {
  // Valide HMAC do gateway. Sem secret válido → 401.
  const payload = await req.json();
  if (!isPaidPix(payload)) return new Response("ignored", { status: 200 });
  const orderCode = extractOrderCode(payload); // do metadata.orderCode
  await persistPaymentStatus(orderCode, "paid", payload);
  await maybeFirePurchase(orderCode, "pix-webhook");
  return new Response("ok");
});
\`\`\`

#### 4b.2 Polling do frontend (\`check-pix-status\`)
\`\`\`ts
// supabase/functions/check-pix-status/index.ts
Deno.serve(async (req) => {
  const { orderCode } = await req.json();
  const status = await gatewayQueryStatus(orderCode); // GET no gateway
  if (status === "paid") {
    await persistPaymentStatus(orderCode, "paid");
    await maybeFirePurchase(orderCode, "check-pix-status");
  }
  return Response.json({ status });
});

// Frontend faz polling enquanto a tela do QR estiver aberta:
async function pollPix(orderCode) {
  for (let i = 0; i < 60; i++) { // 5 min
    const r = await fetch("/functions/v1/check-pix-status", {
      method: "POST", body: JSON.stringify({ orderCode }),
    });
    const { status } = await r.json();
    if (status === "paid") { window.location.href = "/obrigado/" + orderCode; return; }
    await new Promise(r => setTimeout(r, 5000));
  }
}
\`\`\`

#### 4b.3 Reconciliação cron (\`reconcile-pix-payments\`)
**Obrigatório.** Cliente fechou a aba E webhook falhou? O cron resolve.
\`\`\`ts
// supabase/functions/reconcile-pix-payments/index.ts
Deno.serve(async (req) => {
  // Protegido por x-cron-secret
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET"))
    return new Response("forbidden", { status: 403 });

  // Busca pedidos PIX recentes/pendentes sem Purchase confirmado
  const { data: orders } = await supabase
    .from("orders")
    .select("order_code, gateway_order_id")
    .eq("payment_method", "pix")
    .is("purchase_tracked_at", null)
    .gte("created_at", new Date(Date.now() - 48*3600*1000).toISOString())
    .limit(200);

  let fired = 0;
  for (const o of orders || []) {
    const status = await gatewayQueryStatus(o.order_code);
    if (status === "paid") {
      await persistPaymentStatus(o.order_code, "paid");
      const r = await maybeFirePurchase(o.order_code, "reconcile-pix");
      if (r.fired) fired++;
    }
  }
  return Response.json({ checked: orders?.length || 0, fired });
});
\`\`\`

Agende via pg_cron a cada 2-5 min:
\`\`\`sql
select cron.schedule(
  'reconcile-pix-payments', '*/3 * * * *',
  $$ select net.http_post(
       url:='${cfg.supabaseUrl}/functions/v1/reconcile-pix-payments',
       headers:='{"x-cron-secret":"<CRON_SECRET>","Content-Type":"application/json"}'::jsonb
     ); $$
);
\`\`\`

> 🔒 As 3 fontes chamam \`maybeFirePurchase\` → **sempre** uma única conversão por \`orderCode\`.`);
  }

  if (hasBoleto) {
    sections.push(`### 4c. BOLETO (NÃO dispare client-side)
Boleto leva 1-3 dias. Purchase apenas via:
- \`boleto-webhook\` (gateway notifica compensação) → \`maybeFirePurchase(orderCode, "boleto-webhook")\`
- \`reconcile-boleto-payments\` (cron diário) → mesma trava atômica
No checkout, dispare apenas \`generate_lead\`/\`InitiateCheckout\`:
\`\`\`ts
window.dataLayer.push({
  event: "generate_lead", payment_type: "boleto",
  value: order.total, transaction_id: order.order_code,
});
\`\`\``);
  }

  if (hasSub) {
    sections.push(`### 4d. ASSINATURA (Subscribe + Purchase)
\`\`\`ts
// 1º pagamento aprovado → frontend dispara Subscribe (sync, idempotente por subscription_id)
window.dataLayer.push({
  event: "subscribe",
  ecommerce: {
    transaction_id: subscription.id,
    value: subscription.amount, currency: "BRL",
    plan_id: subscription.plan_id,
  },
});
// E o backend chama:
await maybeFirePurchase(subscription.first_charge_order_code, "subscribe-first-charge");

// Renovações: webhook recurring_paid → maybeFirePurchase com event_id renovado
//   event_id = \`purchase:\${charge.order_code}\` — cada cobrança tem seu orderCode próprio.
\`\`\``);
  }

  return `## 4. Disparar Purchase via fontes IDEMPOTENTES (\`maybeFirePurchase\`)
${sections.join("\n\n")}`;
}

function webhookUrl(cfg: NativeCheckoutConfig): string {
  const g = GATEWAY_META[cfg.gateway];
  return `${cfg.supabaseUrl}/functions/v1/gateway-webhook?provider=${g.providerSlug}`;
}

export function generateNativeCheckoutPrompt(cfg: NativeCheckoutConfig): string {
  const g = GATEWAY_META[cfg.gateway];
  const methods = cfg.methods.map(m => PAYMENT_META[m].label).join(", ");
  const wh = webhookUrl(cfg);

  return `# Tarefa: Implementar tracking completo de Purchase em checkout NATIVO (${g.label}) + CapiTrack

## Contexto
Meu checkout é próprio (nativo). O **meu site cria o pedido/pagamento dentro dele**.
Gateway: **${g.label}**. Métodos ativos: **${methods}**. Stack: \`${cfg.stack}\`.

As vendas estão sendo criadas mas NÃO chegam como conversão no Google Ads / Meta CAPI / TikTok
porque (1) tracking não é persistido no pedido, (2) Purchase não é disparado quando o pagamento
confirma, e (3) PIX depende só do frontend → cliente fecha a aba e a venda some.

Implemente as **5 camadas** abaixo. Faça TODAS, na ordem.

${captureBlock()}

${helperBlock(cfg.stack)}

${gatewayBlock(cfg)}

${purchaseBlock(cfg)}

## 5. Configuração do webhook (URL canônica do CapiTrack)
**No painel do ${g.label}**, configure o webhook EXATAMENTE para esta URL:

\`\`\`
${wh}
\`\`\`

Esta é a mesma URL exibida no painel **Webhook Logs** do CapiTrack. Não monte manualmente.
Se houver \`workspace_id\` ou \`api_key\` exigidos pelo backend, **não invente** — confirme no painel.

## Particularidades por método
${cfg.methods.map(m => `- **${PAYMENT_META[m].label}**: ${PAYMENT_META[m].hint}`).join("\n")}

## ⚠️ Regras críticas (Fluxo Final Validado — 04/2026, multi-etapas genérico)
1. **\`event_id\` do principal = \`purchase:<root_order_code>\`**. **Etapas adicionais**
   (taxa de entrega, taxa de manipulação, seguro, frete express, prioridade, garantia,
   upsell de segunda tela, **TMT** etc.) = **\`purchase:<root_order_code>:step:<step_key>\`**
   onde \`step_key\` é estável (ex.: \`shipping_fee\`, \`handling_fee\`, \`upsell_1\`,
   \`insurance\`, \`priority_fee\`, \`warranty\`, \`tmt\`). NÃO use mais \`<externalId>:Purchase\`
   nem event_id cru tipo \`EV-...\`. \`transaction_id\` e \`gateway_order_id\` são campos
   **separados** no payload. **TMT é apenas exemplo de etapa adicional, nunca regra fixa.**
2. **Auditoria obrigatória**: descubra no código TODAS as páginas/rotas/componentes que
   criam pagamento. Pode haver 2, 3, 5+ etapas com qualquer nome. Liste cada uma com
   \`route, gateway, value, externalReference, status source, step_key sugerido,
   relação com root\` antes de implementar tracking.
3. **Modelo canônico**: \`root_order_code\` representa a jornada inteira; principal usa
   \`step_key=main\`; cada etapa adicional tem \`step_key\` derivado do tipo. Para
   repetições do mesmo tipo (ex.: 2 upsells), use índice/hash determinístico.
4. **Relação pai-filho**: toda etapa adicional persiste \`parent_order_code\`/
   \`root_order_code\` no banco. \`externalReference\` no gateway segue padrão
   determinístico (ex.: \`step:<step_key>:<root_order_code>\`). Webhook/polling/reconcile
   identificam o root e o step_key mesmo se a página tiver nome diferente.
5. **Herança de metadata**: principal captura \`gclid, gbraid, wbraid, fbclid, ttclid,
   msclkid, fbp, fbc, ga_client_id, session_id, utm_*, landing_page, referrer,
   user_agent, client_ip\`. **Toda etapa adicional herda do root** se metadata do
   gateway vier vazia — o backend completa **antes** de chamar \`/track\`.
6. **Receita isolada**: principal envia \`value\` do principal. Cada etapa adicional
   envia \`value\` **somente daquela etapa**, sem somar/inflar o principal. Para
   otimizar só pelo principal, trate as adicionais como secondary conversion;
   para LTV/receita total, eventos separados com event_id único. **Nunca** duplicar
   o mesmo Purchase.
7. **Idempotência multi-source genérica**: trava por \`event_id\`/\`step_key\`,
   **não** por uma única coluna que bloqueia as adicionais. Para N etapas dinâmicas,
   use tabela \`tracked_events\` com \`unique(event_id)\`. Webhook, polling, reconcile
   e fallback browser-side passam pela MESMA função idempotente — F5, reentrega,
   polling simultâneo e reconcile **não podem** duplicar nenhuma etapa.
8. **PIX exige 3 fontes** (para o principal E para CADA etapa adicional PIX):
   \`pix-webhook\` + \`check-pix-status\` + \`reconcile-pix-payments\` (cron 2-5min).
9. **Click IDs case-sensitive**: \`gclid/gbraid/wbraid/fbclid/ttclid/msclkid\`
   apenas \`.trim()\` — nunca \`.toLowerCase()\`/\`.normalize()\`.
10. **Trava de status pago**: Purchase só dispara quando \`status ∈ {paid, approved,
    confirmed, succeeded, captured, pix_paid, order_paid}\`.
11. **Browser-side fallback**: se existir disparo na thank-you, use exatamente
    \`purchase:<root_order_code>\` (principal) e
    \`purchase:<root_order_code>:step:<step_key>\` (adicionais) — **nunca** event_id cru.
    \`sessionStorage\` deve ser **por event_id** (lista), não uma flag única que
    bloqueia todas as etapas.
12. **Sem PII em logs**: nada de CPF/e-mail/telefone/endereço/QR/PIX/payload sensível.
    Logue apenas \`root_order_code, step_key, event_id, value, source, provider,
    status\`. PII é hasheada server-side pelo CapiTrack antes dos ads.

## Validação obrigatória (faça uma compra teste percorrendo TODAS as etapas pagas)
1. Abra o site com \`?gclid=TESTE-CaseSensitive_123&utm_source=google&utm_term=palavra-chave\`.
2. Confirme que cookies \`ct_gclid\`, \`ct_utm_*\` foram setados (com case preservado).
3. **Para cada etapa paga descoberta na auditoria** (principal + N adicionais), pague de
   verdade e verifique:
   - [ ] **Cada etapa** aparece em \`/event-logs\` com seu próprio \`event_id\`:
         principal = \`purchase:<root_order_code>\`,
         adicionais = \`purchase:<root_order_code>:step:<step_key>\`.
   - [ ] **NÃO** existe nenhum Purchase com event_id cru tipo \`EV-...\` (sem prefixo).
   - [ ] **NÃO** existe etapa adicional usando o orderCode dela própria como
         event_id principal (\`purchase:<orderCodeDaEtapa>\`).
   - [ ] **Toda etapa adicional** carrega \`gclid/msclkid/utm_*/fbp/session_id\`
         **idênticos** ao do principal (herança via root).
   - [ ] O \`value\` de cada etapa adicional é APENAS o valor dela, sem somar o principal.
   - [ ] \`event_deliveries\`: 1 linha por provider para o principal + 1 linha por
         provider para cada etapa adicional. Sem duplicatas dentro da mesma etapa.
4. **PIX**: pague um QR e:
   - [ ] Cenário A (webhook chega): trava registra \`source=pix-webhook\`.
   - [ ] Cenário B (webhook falha mas tela aberta): \`check-pix-status\` registra
         \`source=check-pix-status\`.
   - [ ] Cenário C (webhook falha + cliente fechou aba): cron \`reconcile-pix-payments\`
         registra \`source=reconcile-pix\` em ≤5min.
   - [ ] Em todos os cenários, **uma única** linha em \`event_deliveries\` por etapa.
5. **Cartão**: aprove uma compra. Webhook em paralelo é skipped silenciosamente.
6. **F5 na thank-you** NÃO duplica nenhuma etapa (frontend não dispara — backend já tracked).
7. **Reentregar webhook** do mesmo pedido NÃO duplica (trava por \`event_id\` bloqueia).
8. \`msclkid\` e \`ga_client_id\` aparecem persistidos no payload quando existirem.
9. Falha eventual em Google Ads com \`UNPARSEABLE_GCLID\` para gclid de teste sintético
   (\`TESTE-CaseSensitive_123\`) é **esperada** e **não indica bug** — apenas confirma
   que o engine recebeu/preservou o gclid corretamente.
10. Confirme no painel CapiTrack \`/event-logs\` que cada Purchase chegou com:
    \`event_id\` correto, \`order_id\`, \`parent_order_id\` (em adicionais), \`step_key\`,
    \`transaction_id\`, \`session_id\`, \`gclid\` (case preservado), \`fbp\`, \`user_agent\`, \`client_ip\`.

${PASSO_M_HARDENING_BLOCK}

## Não faça
- Não use mais \`<externalId>:Purchase\` como event_id padrão.
- Não envie event_id cru tipo \`EV-...\` (sem prefixo \`purchase:\`).
- Não trate "TMT" como regra fixa — é apenas um \`step_key\` possível dentre N. Descubra
  os nomes reais das etapas adicionais lendo o código do projeto-alvo.
- Não use o orderCode de uma etapa adicional como event_id principal — sempre referencie
  o root com \`:step:<step_key>\`.
- Não dispare etapas adicionais sem antes herdar metadata de atribuição do root.
- Não some o valor do principal no \`value\` de uma etapa adicional.
- Não use uma única coluna \`purchase_tracked_at\` como trava global — isso bloqueia
  as etapas adicionais. Use trava por \`event_id\` (tabela \`tracked_events\`) ou
  colunas separadas por etapa fixa.
- Não use \`sessionStorage\` com flag única no browser — use lista de event_ids já disparados.
- Não monte URL de webhook no formato antigo \`/gateway-webhook/<gateway>\` — use a query \`?provider=\`.
- Não dispare Purchase em status pendente.
- Não logue PII em texto puro (CPF, e-mail, telefone, endereço, QR/PIX copia-e-cola).
- Não remova chamadas existentes ao ${g.label}; só **adicione** as camadas acima.`;
}

// ──────────────────────────────────────────────────────────────────────────
// Passo M — Hardening sync block (apended to every generated prompt).
// Mantém prompts nativo + externo sincronizados com controles endurecidos:
// test_mode/replay seguro, rate-limit, queue-health, retention dry-run, RLS,
// PII report, export preview/hash-only, consentimento, multi-destination,
// IA em recommendation por padrão.
// ──────────────────────────────────────────────────────────────────────────
export const PASSO_M_HARDENING_BLOCK = `
## 🔐 Controles de release endurecidos (Passo M+N+O+P+Q — sincronizado)
Aplique TODOS no projeto-alvo:
- **test_mode / replay seguro**: \`webhook-replay-test\` exige owner/admin, valida bounds, NÃO grava \`event_deliveries\` reais e usa rate-limit DB-backed sem IP cru. Nunca exponha \`CRON_SECRET\` no frontend.
- **webhook-auth (Passo N)**: gateway-webhook EXIGE assinatura HMAC válida em produção (Stripe/Yampi/Shopify/Paddle/QuantumPay/genéricos com secret configurado). Sem assinatura ⇒ 401. \`event-replay\` e \`webhook-replay-test\` exigem JWT + workspace admin via \`requireUserJwt\`/\`requireWorkspaceAccess\`.
- **Rate-limit persistente**: SHA-256 do IP antes de qualquer RPC; bounds \`window 10-3600s\` e \`max_hits 1-10000\`. UI em \`/rate-limit-configs\` é role-gated (owner/admin).
- **Queue health + alertas internos**: backlog/falhas em \`queue_health_alerts\` com \`open → acknowledged → resolved\` auditados em \`audit_logs\` (sem PII). Auto-resolve quando condição limpa.
- **Alertas externos opt-in (Passo N)**: canais Slack/email/webhook ficam \`enabled=false\` + \`mode=dry_run\` por padrão. Nenhum dispatch real até toggle explícito do owner. Preview gerado por \`buildAlertPreview\` nunca contém workspace/user IDs.
- **Retention dry-run**: \`retention-job\` por padrão é monitor; execução destrutiva só manual via \`X-Cron-Secret\`. Cron NUNCA roda \`execute=1\` automático.
- **RLS auditado**: tabelas sensíveis (\`event_queue\`, \`queue_health_alerts\`, \`rate_limit_configs\`, \`audit_logs\`, \`audience_seed_exports\`, \`dead_letter_events\`, \`automation_actions\`) têm RLS + policies não-permissivas.
- **Export hash-only + consentimento**: audience export aceita \`dry_run\` (apenas counts), e o export real exige \`require_consent !== false\` e devolve apenas hashes SHA-256.
- **Multi-destination**: cada Purchase pode espelhar para Meta/Google/TikTok/GA4 com dedup 4-col \`(workspace, event_id, provider, destination)\` — cada \`destination_id\`/\`account_id\`/\`conversion_action_id\` retém status e retry separados.
- **IA em recommendation por padrão**: ações automatizadas só com guardrails explícitos; IA sugere, humano confirma — auto apenas com \`automation_rules.execution_mode='auto'\` (NÃO em \`action_json\`) + \`guardrails_json\` (cooldown_hours, max_items_per_run, min_conversions, min_bid_factor/max_bid_factor, allow_pause).
- **Fast-path por gateway (Passo N+O)**: WooCommerce/Braip/CartPanda/PerfectPay seguem \`gateway-fast-path-guides.ts\` — webhook canônico \`?provider=generic\`, secret HMAC obrigatório, propagação de \`root_order_code\`/\`step_key\`/\`external_reference\`. Docs em \`/gateway-docs\`.
- **Data Reuse Center (Passo P+Q)**: \`/data-reuse-center\` mostra cobertura first-party (gclid/gbraid/wbraid/fbclid/ttclid/msclkid/ga_client_id/utm + email/phone hash) e elegibilidade offline conversion por provider. Tem paginação configurável (200/500/1000/2000/5000), preview por provider hash-only com amostras mascaradas, coverage report por click ID, verificador multi-destination consistency (duplicate/missing credential_ref/consent_gate) e simulador de automações dry-run com guardrails (min_conversions, cooldown_hours, max_budget_change_percent, max_bid_change_percent, rollback_plan). Auto bloqueado por padrão. Reuso NUNCA é cópia de aprendizado interno (ML).
- **PII report + audit viewer**: confira em \`/pii-release-report\` e \`/audit-logs\` (com redaction client-side de email/CPF/CNPJ/JWT/IP).
- **Relatório operacional**: status consolidado em \`/release-report\` (inclui marcador \`RLS semantic audit\` quando indisponível por falta de PGHOST em CI). Painel de RLS em \`/rls-warnings\`.
`;

