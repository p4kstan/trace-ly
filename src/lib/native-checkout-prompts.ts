/**
 * Gerador de prompts para checkouts NATIVOS (próprios) com qualquer gateway.
 * Cobre PIX, cartão, boleto e assinatura — cada método tem fluxo diferente:
 *  - PIX: assíncrono, dispara Purchase quando webhook chega como "paid"
 *  - Cartão: síncrono, dispara Purchase imediatamente após response 200
 *  - Boleto: assíncrono, dispara Purchase só quando o webhook compensa
 *  - Assinatura: dispara Subscribe no first charge + Purchase em renovações
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
  /** Stack do checkout (ajuda a IA-alvo gerar imports corretos) */
  stack: "react" | "next" | "vue" | "html" | "node-backend" | "unknown";
}

export const GATEWAY_META: Record<GatewayId, {
  label: string;
  /** Onde fica a chamada principal de criação de cobrança (hint pra IA buscar) */
  searchHints: string[];
  /** Estrutura do bloco metadata aceita pelo gateway */
  metadataKey: string;
  /** Status string que indica pagamento confirmado */
  paidStatus: string[];
  /** Endpoint do webhook (apenas referência) */
  webhookDocs?: string;
}> = {
  quantumpay: {
    label: "QuantumPay",
    searchHints: ["quantumpay", "/v1/charges", "amount.*externalReference"],
    metadataKey: "metadata",
    paidStatus: ["paid", "transaction_paid"],
    webhookDocs: "https://docs.quantumpay.com.br/webhooks",
  },
  asaas: {
    label: "Asaas",
    searchHints: ["asaas", "/api/v3/payments", "billingType"],
    metadataKey: "externalReference + customField",
    paidStatus: ["RECEIVED", "CONFIRMED"],
  },
  mercadopago: {
    label: "Mercado Pago",
    searchHints: ["mercadopago", "preferences", "/v1/payments"],
    metadataKey: "metadata",
    paidStatus: ["approved"],
  },
  pagarme: {
    label: "Pagar.me",
    searchHints: ["pagarme", "pagar.me", "/orders", "/charges"],
    metadataKey: "metadata",
    paidStatus: ["paid"],
  },
  stripe: {
    label: "Stripe",
    searchHints: ["stripe", "paymentIntents.create", "checkout.sessions"],
    metadataKey: "metadata",
    paidStatus: ["succeeded", "paid"],
  },
  appmax: {
    label: "Appmax",
    searchHints: ["appmax", "/api/v3/order"],
    metadataKey: "custom_fields",
    paidStatus: ["aprovado", "approved"],
  },
  pagseguro: {
    label: "PagSeguro",
    searchHints: ["pagseguro", "pagbank", "/charges"],
    metadataKey: "metadata",
    paidStatus: ["PAID"],
  },
  iugu: {
    label: "Iugu",
    searchHints: ["iugu", "/v1/invoices"],
    metadataKey: "custom_variables",
    paidStatus: ["paid"],
  },
  efi: {
    label: "Efí (Gerencianet)",
    searchHints: ["gerencianet", "efipay", "/v2/cob"],
    metadataKey: "infoAdicionais",
    paidStatus: ["CONCLUIDA"],
  },
  custom: {
    label: "Custom / Próprio",
    searchHints: ["createOrder", "createCharge", "createPayment"],
    metadataKey: "metadata",
    paidStatus: ["paid", "approved", "succeeded"],
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
    hint: "Webhook com status=paid → dispara Purchase server-side. Frontend pode fazer polling pra disparar o Purchase no browser também (dedup pelo event_id)." },
  card: { label: "Cartão", flow: "sync", ga4Event: "purchase", metaEvent: "Purchase",
    hint: "Resposta síncrona — assim que a API retornar status approved, dispara Purchase imediatamente no checkout (sem esperar webhook)." },
  boleto: { label: "Boleto", flow: "async", ga4Event: "purchase", metaEvent: "Purchase",
    hint: "Boleto leva 1-3 dias úteis pra compensar. Purchase é disparado APENAS pelo webhook quando o status virar paid. NÃO dispare client-side." },
  subscription: { label: "Assinatura", flow: "sync", ga4Event: "purchase", metaEvent: "Subscribe",
    hint: "Primeiro pagamento dispara Subscribe + Purchase. Renovações disparam só Purchase server-side via webhook recurring_paid." },
};

// ──────────────────────────────────────────────────────────────────────────

function captureBlock(): string {
  return `## 1. Capturar tracking na entrada do site
Edite o \`index.html\` e adicione ANTES do </head>:

\`\`\`html
<script>
(function () {
  var p = new URLSearchParams(location.search);
  var keys = ["gclid","gbraid","wbraid","fbclid","ttclid",
              "utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
  keys.forEach(function (k) {
    var v = p.get(k);
    if (v) document.cookie = "ct_" + k + "=" + encodeURIComponent(v) +
      "; path=/; max-age=" + (60*60*24*90) + "; SameSite=Lax";
  });
  if (!sessionStorage.getItem("ct_landing")) {
    sessionStorage.setItem("ct_landing", location.href);
  }
})();
</script>
\`\`\``;
}

function helperBlock(stack: NativeCheckoutConfig["stack"]): string {
  const ext = stack === "html" ? "js" : "ts";
  const typed = ext === "ts";
  return `## 2. Helper para ler tracking
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
  // ⚠️ Click IDs são case-sensitive. Apenas .trim() — NUNCA .toLowerCase().
  const get = (k${typed ? ": string" : ""}) => {
    const v = c["ct_" + k] || url.get(k) || null;
    return v ? String(v).trim() : null;
  };

  // session_id do CapiTrack — usado pelo backend pra fallback de atribuição
  const sessionId = c.ct_session || sessionStorage.getItem("ct_session") || null;

  return {
    gclid: get("gclid"), gbraid: get("gbraid"), wbraid: get("wbraid"),
    fbclid: get("fbclid"), ttclid: get("ttclid"),
    fbp: c._fbp || null, fbc: c._fbc || null,
    session_id: sessionId,
    utm_source: get("utm_source"), utm_medium: get("utm_medium"),
    utm_campaign: get("utm_campaign"), utm_content: get("utm_content"),
    utm_term: get("utm_term"),
    landing_page: sessionStorage.getItem("ct_landing") || location.href,
    referrer: document.referrer || null,
    user_agent: navigator.userAgent,
  };
}
\`\`\``;
}

function gatewayBlock(cfg: NativeCheckoutConfig): string {
  const g = GATEWAY_META[cfg.gateway];
  return `## 3. Enviar tracking no \`${g.metadataKey}\` da ${g.label}
Encontre onde meu código cria a cobrança (busque por: \`${g.searchHints.join("\`, \`")}\`).
Modifique o body pra incluir tracking + customer:

\`\`\`ts
import { readTracking } from "@/lib/tracking";

const tracking = readTracking();
const body = {
  amount: Math.round(total * 100),
  externalReference: orderCode,
  ${g.metadataKey.split(" ")[0]}: {
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      document: customer.document,
    },
    ...tracking,
    orderCode,
  },
};
\`\`\``;
}

function purchaseBlock(cfg: NativeCheckoutConfig): string {
  const hasCard = cfg.methods.includes("card");
  const hasPix = cfg.methods.includes("pix");
  const hasBoleto = cfg.methods.includes("boleto");
  const hasSub = cfg.methods.includes("subscription");

  const sections: string[] = [];

  if (hasCard) {
    sections.push(`### 4a. CARTÃO (síncrono — dispare imediatamente)
\`\`\`ts
import { readTracking } from "@/lib/tracking";

// ⚠️ DISPARE APENAS quando a API retornar status ∈ {approved, paid, succeeded, captured}.
// Status como "pending"/"requires_action" NÃO devem disparar Purchase.
const PAID_STATUSES = ["approved", "paid", "succeeded", "captured", "confirmed"];
if (!PAID_STATUSES.includes(String(response.status).toLowerCase())) return;

const externalId = order.id; // ID da transação no gateway — usado pra dedupe (48h)
const eventId = \`\${externalId}:Purchase\`; // mesmo formato usado pelo webhook server-side

window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: "purchase",
  ecommerce: {
    transaction_id: externalId,
    value: order.total,
    currency: "BRL",
    payment_type: "card",
    items: order.items.map(i => ({
      item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity,
    })),
  },
});

await fetch("${cfg.endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": "${cfg.publicKey}" },
  body: JSON.stringify({
    event_name: "Purchase",
    event_id: eventId,
    external_id: externalId,        // CRÍTICO pra dedupe de 48h no backend
    order_id: externalId,
    value: order.total, currency: "BRL",
    payment_type: "card",
    payment_status: response.status, // backend valida o gate de status
    email: order.customer.email, phone: order.customer.phone,
    customer_document: order.customer.document,
    ...readTracking(),               // inclui session_id pro fallback de atribuição
    action_source: "website", url: location.href,
  }),
});
\`\`\``);
  }

  if (hasPix) {
    sections.push(`### 4b. PIX (assíncrono — polling do status)
\`\`\`ts
// No checkout, faça polling do status do PIX:
async function pollPix(chargeId) {
  for (let i = 0; i < 60; i++) { // 5 min (5s * 60)
    const r = await fetch(\`/api/check-pix-status?id=\${chargeId}\`);
    const { status, order } = await r.json();
    if (status === "paid") {
      firePurchase(order, "pix");
      return;
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

function firePurchase(order, payment_type) {
  const externalId = order.id; // mesmo ID que o gateway envia no webhook → dedupe
  const eventId = \`\${externalId}:Purchase\`;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: "purchase",
    ecommerce: {
      transaction_id: externalId,
      value: order.total, currency: "BRL", payment_type,
      items: order.items,
    },
  });
  fetch("${cfg.endpoint}", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "${cfg.publicKey}" },
    body: JSON.stringify({
      event_name: "Purchase",
      event_id: eventId,
      external_id: externalId,        // CRÍTICO pra dedupe de 48h no backend
      order_id: externalId,
      value: order.total, currency: "BRL", payment_type,
      payment_status: "paid",
      email: order.customer.email, phone: order.customer.phone,
      customer_document: order.customer.document,
      ...readTracking(),               // session_id incluso
      action_source: "website", url: location.href,
    }),
  });
}
\`\`\`

> ℹ️ Se o webhook server-side do gateway também disparar Purchase, o backend do CapiTrack
> deduplica automaticamente pela chave \`external_id:Purchase\` em janela de 48h. Pode coexistir.`);
  }

  if (hasBoleto) {
    sections.push(`### 4c. BOLETO (NÃO dispare client-side)
Boleto leva 1-3 dias para compensar. O Purchase é disparado APENAS pelo webhook server-side
quando o gateway notificar status=paid. CapiTrack já faz isso automaticamente.

No checkout, dispare apenas \`generate_lead\` para marcar a intenção:
\`\`\`ts
window.dataLayer.push({
  event: "generate_lead",
  payment_type: "boleto",
  value: order.total,
  transaction_id: order.id,
});
\`\`\``);
  }

  if (hasSub) {
    sections.push(`### 4d. ASSINATURA (Subscribe + Purchase)
\`\`\`ts
// Primeiro pagamento aprovado:
window.dataLayer.push({
  event: "subscribe",
  ecommerce: {
    transaction_id: subscription.id,
    value: subscription.amount, currency: "BRL",
    plan_id: subscription.plan_id, plan_name: subscription.plan_name,
  },
});

await fetch("${cfg.endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": "${cfg.publicKey}" },
  body: JSON.stringify({
    event_name: "Subscribe", event_id: subscription.id,
    value: subscription.amount, currency: "BRL",
    email: customer.email, phone: customer.phone,
    plan_id: subscription.plan_id,
    ...readTracking(),
    action_source: "website", url: location.href,
  }),
});
// Renovações: webhook recurring_paid → Purchase server-side automático.
\`\`\``);
  }

  return `## 4. Disparar Purchase quando o pagamento for confirmado
${sections.join("\n\n")}`;
}

export function generateNativeCheckoutPrompt(cfg: NativeCheckoutConfig): string {
  const g = GATEWAY_META[cfg.gateway];
  const methods = cfg.methods.map(m => PAYMENT_META[m].label).join(", ");

  return `# Tarefa: Implementar tracking completo de Purchase no checkout nativo (${g.label}) + CapiTrack

## Contexto
Meu checkout é próprio (nativo), gateway: **${g.label}**, métodos ativos: **${methods}**.
Stack: ${cfg.stack}.

As vendas estão sendo criadas mas NÃO chegam como conversão no Google Ads / Meta CAPI
porque não estou enviando gclid, UTMs, _fbp, _fbc, email e telefone para o gateway nem
disparando Purchase ao confirmar o pagamento.

Preciso que você implemente as 4 camadas abaixo. Faça TODAS, não pule nenhuma.

${captureBlock()}

${helperBlock(cfg.stack)}

${gatewayBlock(cfg)}

${purchaseBlock(cfg)}

## Particularidades por método
${cfg.methods.map(m => `- **${PAYMENT_META[m].label}**: ${PAYMENT_META[m].hint}`).join("\n")}

## Validação
1. Abra o site com \`?gclid=TESTE123&utm_source=google\` na URL.
2. Faça uma compra de teste em cada método ativo (${methods}).
3. Cheque cookie \`ct_gclid\` (DevTools → Application → Cookies).
4. Confirme que o body para ${g.label} tem o bloco com gclid + customer.
5. Confirme que a request POST para ${cfg.endpoint} retorna status 200.
6. Verifique no painel CapiTrack (/event-logs) que Purchase aparece com event_id = order.id.

## Não faça
- Não remova nenhuma chamada ao ${g.label} existente.
- Não troque o gateway.
- Não altere o fluxo visual do checkout.
- Apenas adicione as 4 camadas acima.`;
}
