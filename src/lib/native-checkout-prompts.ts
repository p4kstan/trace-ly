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
 *  - event_id padrão = `purchase:<orderCode>` (TMT/upsell = `purchase:<orderCode>:tmt`)
 *  - Webhook URL canônica: <SUPABASE_URL>/functions/v1/gateway-webhook?provider=<gateway>
 *  - PIX exige: pix-webhook + check-pix-status + reconcile-pix-payments
 *  - Reconcile cron 2-5min, idempotência via purchase_tracked_at IS NULL
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

  // Função compartilhada — central de Purchase idempotente
  sections.push(`### 4.0 \`maybeFirePurchase()\` — idempotência atômica (CRÍTICO)
Crie no backend uma função compartilhada chamada por **todas** as fontes (webhook, check-status, reconcile, frontend). Garante "exactly-once" via UPDATE atômico:

\`\`\`ts
// supabase/functions/_shared/fire-purchase.ts (ou backend equivalente)
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

  // 2) Monta event_id no NOVO PADRÃO
  const eventId = data.is_tmt
    ? \`purchase:\${orderCode}:tmt\`
    : \`purchase:\${orderCode}\`;

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

> ⚠️ \`event_id\` segue o padrão **\`purchase:<orderCode>\`** (TMT/upsell = \`purchase:<orderCode>:tmt\`).
> Não use mais \`<externalId>:Purchase\`. \`transaction_id\`/\`gateway_order_id\` são preservados em campos separados.`);

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

## ⚠️ Regras críticas (Fluxo Final Validado — 04/2026)
1. **\`event_id\` = \`purchase:<orderCode>\`** (NÃO use mais \`<externalId>:Purchase\`).
   Para TMT/upsell/pagamento separado: \`purchase:<orderCode>:tmt\`.
   \`transaction_id\` e \`gateway_order_id\` são campos **separados** no payload.
2. **Idempotência via \`purchase_tracked_at\`**: UPDATE atômico com \`WHERE purchase_tracked_at IS NULL\`.
   Todas as fontes (webhook, check-status, reconcile, frontend) chamam o MESMO \`maybeFirePurchase\`.
3. **PIX exige 3 fontes**: \`pix-webhook\` + \`check-pix-status\` + \`reconcile-pix-payments\` (cron 2-5min).
4. **Click IDs case-sensitive**: \`gclid/gbraid/wbraid/fbclid/ttclid/msclkid\` apenas \`.trim()\`.
5. **Trava de status pago**: Purchase só dispara quando \`status ∈ {paid, approved, confirmed, succeeded, captured, pix_paid, order_paid}\`.
6. **Metadados obrigatórios persistidos no pedido**:
   \`gclid, gbraid, wbraid, fbclid, fbp, fbc, ttclid, msclkid, ga_client_id, session_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, referrer,
    user_agent, client_ip\`.
7. **Sem PII em logs**: nada de CPF/e-mail/telefone/endereço/QR/PIX em \`console.log\`.
   E-mail/telefone/documento são hasheados pelo CapiTrack antes de chegar nas plataformas
   de ads (você apenas envia em texto cru via HTTPS server-to-server).

## Validação (faça uma compra teste em cada método)
1. Abra o site com \`?gclid=TESTE-CaseSensitive_123&utm_source=google&utm_term=palavra-chave\`.
2. Confirme que cookies \`ct_gclid\`, \`ct_utm_*\` foram setados (com case preservado).
3. **PIX**: pague um QR e:
   - [ ] Cenário A (webhook chega): \`pix-webhook\` registra \`purchase_tracked_source=pix-webhook\`.
   - [ ] Cenário B (webhook falha mas tela aberta): \`check-pix-status\` registra \`purchase_tracked_source=check-pix-status\`.
   - [ ] Cenário C (webhook falha + cliente fechou aba): cron \`reconcile-pix-payments\` registra \`purchase_tracked_source=reconcile-pix\` em ≤5min.
   - [ ] **Em todos os cenários**, há **uma única** linha em \`event_deliveries\` por provider.
4. **Cartão**: aprove uma compra. \`event_id = purchase:<orderCode>\`. Webhook em paralelo é skipped silenciosamente.
5. **F5 na página de obrigado** NÃO duplica (frontend não dispara — backend já tracked).
6. **Reentregar webhook do mesmo pedido** NÃO duplica (\`purchase_tracked_at\` bloqueia).
7. \`msclkid\` e \`ga_client_id\` aparecem persistidos no payload quando existirem.
8. Confirme no painel CapiTrack /event-logs que a request \`Purchase\` chegou com:
   \`event_id\` correto, \`order_id\`, \`transaction_id\`, \`session_id\`, \`gclid\` (case preservado),
   \`fbp\`, \`user_agent\`, \`client_ip\`.

## Não faça
- Não use mais \`<externalId>:Purchase\` como event_id padrão.
- Não monte URL de webhook no formato antigo \`/gateway-webhook/<gateway>\` — use a query \`?provider=\`.
- Não dispare Purchase em status pendente.
- Não logue PII em texto puro.
- Não remova chamadas existentes ao ${g.label}; só **adicione** as camadas acima.`;
}
