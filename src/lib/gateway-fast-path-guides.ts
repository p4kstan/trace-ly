/**
 * Gateway Fast-Path Guides — Passo N.
 *
 * Read-only checklists/templates for gateways that today route through the
 * `generic` adapter (WooCommerce, Braip, CartPanda, PerfectPay).
 *
 * Pure data — NO secrets, NO live URLs with tokens, NO PII. Used by the prompt
 * generator and the operational release report to give operators a copy-paste
 * setup script per gateway.
 */

export interface GatewayFastPathField {
  name: string;
  required: boolean;
  notes: string;
}

export interface GatewayFastPathGuide {
  id: "woocommerce" | "braip" | "cartpanda" | "perfectpay";
  label: string;
  webhookUrlPattern: string;
  /** Headers / signature requirements that MUST be set before go-live. */
  signatureRequirement: string;
  fields: GatewayFastPathField[];
  /** How to propagate UTMs / click IDs through the checkout to the webhook. */
  propagation: string[];
  /** Multi-step (upsell/order-bump) guidance. */
  multiStep: string;
  /** Plain-text checklist the operator confirms BEFORE go-live. */
  checklist: string[];
}

const COMMON_FIELDS: GatewayFastPathField[] = [
  { name: "transaction_id", required: true, notes: "ID estável da cobrança no gateway." },
  { name: "order_code", required: true, notes: "Código do pedido no painel do lojista." },
  {
    name: "root_order_code",
    required: true,
    notes:
      "Código da jornada raiz. Igual a order_code para o pedido principal; etapas adicionais herdam do principal.",
  },
  {
    name: "external_reference",
    required: true,
    notes: "Ex.: `step:upsell_1:<root_order_code>`. Permite reidratar root + step_key sem PII.",
  },
  { name: "step_key", required: false, notes: "main / shipping_fee / upsell_1 / insurance / warranty…" },
  { name: "amount", required: true, notes: "Valor isolado da etapa (não soma o principal)." },
  { name: "currency", required: true, notes: "ISO-4217." },
  {
    name: "status",
    required: true,
    notes: "Mapeie para canônico: paid/pending/refunded/canceled/chargeback/expired/failed.",
  },
  {
    name: "customer.email_hash",
    required: false,
    notes: "SHA-256(lowercased email). Email cru NUNCA atravessa o adapter.",
  },
  { name: "tracking.session_id", required: false, notes: "Correlação com a sessão capturada no SDK." },
  { name: "tracking.gclid", required: false, notes: "Click ID Google. Apenas .trim()." },
  { name: "tracking.fbclid", required: false, notes: "Click ID Meta. Apenas .trim()." },
];

const COMMON_PROPAGATION = [
  "Persistir UTMs/click IDs no front em `sessionStorage` por 30 min.",
  "Anexar `gclid`/`fbclid`/`ttclid` no payload do checkout em `external_reference` ou metadata custom.",
  "Garantir que `root_order_code` é gerado UMA vez (cliente) e propagado para upsell/order-bump.",
  "SDK CapiTrack envia `session_id` que deve voltar no webhook via metadata.",
];

const COMMON_CHECKLIST = [
  "[ ] Webhook URL canônica `?provider=<slug>` configurada no painel do gateway.",
  "[ ] Secret de assinatura HMAC criado e armazenado em backend (NUNCA no frontend).",
  "[ ] Eventos paid/refunded/canceled/chargeback habilitados no painel.",
  "[ ] Test mode validado com `webhook-replay-test` (rate-limit + JWT + workspace OK).",
  "[ ] Multi-etapa: order-bump/upsell envia `external_reference` com `step:<step_key>:<root>`.",
  "[ ] Logs do gateway-webhook não contêm email/CPF/telefone crus (verificar `/pii-release-report`).",
  "[ ] Rate-limit DB-backed ativo na rota.",
  "[ ] Dedup 4-col (`workspace, event_id, provider, destination`) confirmado em `/canonical-audit`.",
];

export const GATEWAY_FAST_PATH_GUIDES: GatewayFastPathGuide[] = [
  {
    id: "woocommerce",
    label: "WooCommerce",
    webhookUrlPattern: "https://<workspace>.functions.supabase.co/gateway-webhook?provider=generic",
    signatureRequirement:
      "Use o plugin nativo de Webhooks do WooCommerce com SHA256 + secret. O secret é configurado em WooCommerce → Settings → Advanced → Webhooks. NUNCA exponha o secret em PHP themes/plugins customizados.",
    fields: COMMON_FIELDS,
    propagation: [
      ...COMMON_PROPAGATION,
      "Use `add_filter('woocommerce_webhook_payload', ...)` para injetar `root_order_code`, `external_reference` e `tracking.*` derivados do `wc_session`.",
      "Plugin `WooCommerce Subscriptions` cria etapas adicionais — passar `step_key='renewal'` no metadata.",
    ],
    multiStep:
      "Order Bumps via plugins (FunnelKit, CartFlows): cada bump gera uma `WC_Order` separada. Anexar `parent_order_id` em metadata custom para que o adapter remonte `root_order_code`.",
    checklist: COMMON_CHECKLIST,
  },
  {
    id: "braip",
    label: "Braip",
    webhookUrlPattern: "https://<workspace>.functions.supabase.co/gateway-webhook?provider=generic",
    signatureRequirement:
      "Braip envia `Authorization: Basic <base64>` no postback. Configure o secret em painel Braip → Postbacks. Verifique no adapter via `verifyHmac`-like helper antes de aceitar payload em produção.",
    fields: COMMON_FIELDS,
    propagation: [
      ...COMMON_PROPAGATION,
      "Braip aceita campo livre `xcod` que deve carregar `external_reference`.",
      "Click IDs viajam via `?utm_content=gclid:<id>;fbclid:<id>` no link de afiliado e são repassados no postback.",
    ],
    multiStep:
      "Order-bump nativo da Braip envia eventos separados de `sale_status_enum`. Cada um deve receber `step_key` distinto (`main`, `bump_1`, `upsell_1`).",
    checklist: COMMON_CHECKLIST,
  },
  {
    id: "cartpanda",
    label: "CartPanda",
    webhookUrlPattern: "https://<workspace>.functions.supabase.co/gateway-webhook?provider=generic",
    signatureRequirement:
      "CartPanda assina com `X-CartPanda-Hmac-SHA256`. O secret é gerado no painel → Apps → Webhooks. Sem assinatura válida em produção, rejeitar com 401.",
    fields: COMMON_FIELDS,
    propagation: [
      ...COMMON_PROPAGATION,
      "Theme Liquid: injetar `root_order_code` em `cart.attributes._root_order_code`.",
      "Upsell pós-checkout aparece como nova `Order`; usar `note_attributes` para carregar `parent_order_id`.",
    ],
    multiStep:
      "Funis de upsell pós-purchase: cada step é uma nova ordem; vincule via `note_attributes._step_key` e `_root_order_code`.",
    checklist: COMMON_CHECKLIST,
  },
  {
    id: "perfectpay",
    label: "PerfectPay",
    webhookUrlPattern: "https://<workspace>.functions.supabase.co/gateway-webhook?provider=generic",
    signatureRequirement:
      "PerfectPay envia `Token` no header customizado. Configure no painel → Integrações → Postbacks. Validar o token em produção; ausência ou mismatch retorna 401.",
    fields: COMMON_FIELDS,
    propagation: [
      ...COMMON_PROPAGATION,
      "Campo `metadados` aceita JSON livre — passe `external_reference` e `step_key` aqui.",
      "Para infoprodutos, garantir que `sale_status_enum` mapeia corretamente para `paid`/`refunded`.",
    ],
    multiStep:
      "PerfectPay não tem order-bump nativo; quando você usa hotsite externo + upsell, gere `root_order_code` no front e propague para todas as cobranças.",
    checklist: COMMON_CHECKLIST,
  },
];

export function getFastPathGuide(id: string): GatewayFastPathGuide | undefined {
  return GATEWAY_FAST_PATH_GUIDES.find((g) => g.id === id);
}
