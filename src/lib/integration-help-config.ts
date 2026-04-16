/**
 * Configuração contextual de ajuda por plataforma de integração.
 *
 * Cada provider define:
 *  - campos do formulário (com tipo: "input" ou "readonly")
 *  - checklist de passos resumidos
 *  - outputs gerados pela plataforma
 *  - links externos
 */

export interface FieldHelp {
  key: string;
  label: string;
  placeholder?: string;
  type: "password" | "text";
  /** "paste_here" = pegar lá e colar aqui.  "copy_from" = gerado aqui, copiar e colar lá */
  direction: "paste_here" | "copy_from";
  required: boolean;
  securityWarning?: string;
  help?: {
    title: string;
    steps: string[];
    note?: string;
    link?: { url: string; label: string };
  };
}

export interface GeneratedOutput {
  label: string;
  /** Função que recebe params e retorna a URL/value */
  buildValue: (params: { supabaseUrl: string; workspaceId: string; integrationId?: string; provider: string }) => string;
  helpText: string;
  /** Onde colar esse valor na plataforma externa */
  pasteInstructions?: string[];
}

/** Tipo de integração determina o fluxo do modal */
export type IntegrationType = "external_api" | "webhook_only" | "hybrid" | "auto_token";

export interface ProviderConfig {
  label: string;
  emoji: string;
  country: "br" | "int";
  description: string;
  /** Tipo de integração — define o fluxo do modal */
  integrationType: IntegrationType;
  /** Checklist resumido exibido no topo do modal */
  checklist: string[];
  fields: FieldHelp[];
  generatedOutputs: GeneratedOutput[];
  /** Link principal da plataforma */
  docsLink?: { url: string; label: string };
  /** Passos finais após preencher / gerar tudo */
  nextSteps?: string[];
}

const webhookOutput = (pasteSteps: string[]): GeneratedOutput => ({
  label: "URL do Webhook",
  buildValue: ({ supabaseUrl, workspaceId, provider, integrationId }) =>
    `${supabaseUrl}/functions/v1/gateway-webhook?workspace_id=${workspaceId}&provider=${provider}${integrationId ? `&integration_id=${integrationId}` : ""}`,
  helpText: "Copie esta URL e cadastre na plataforma externa como endpoint de webhook.",
  pasteInstructions: pasteSteps,
});

// ─── PROVIDERS ──────────────────────────────────────────────

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  // ═══════════════════════════════════════════════════════════
  // INTERNACIONAL
  // ═══════════════════════════════════════════════════════════

  stripe: {
    label: "Stripe",
    integrationType: "hybrid",
    emoji: "💳",
    country: "int",
    description: "Gateway internacional de pagamentos com suporte completo a webhooks.",
    checklist: [
      "Pegue a API Key (Secret Key) no Stripe Dashboard",
      "Cole a Secret Key aqui",
      "Copie a URL de Webhook gerada abaixo",
      "Cadastre a URL no Stripe → Developers → Webhooks",
      "Copie o Signing Secret e cole aqui",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Key (Secret Key)",
        placeholder: "sk_live_... ou sk_test_...",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key do Stripe?",
          steps: [
            "Acesse dashboard.stripe.com e faça login",
            "No menu lateral, clique em Developers",
            "Clique em API Keys",
            "Em Standard Keys, copie a Secret Key (sk_live_... ou sk_test_...)",
          ],
          note: "Use sk_test_ para ambiente de testes e sk_live_ para produção.",
          link: { url: "https://dashboard.stripe.com/apikeys", label: "Abrir Stripe Dashboard" },
        },
      },
      {
        key: "webhookSecret",
        label: "Webhook Signing Secret",
        placeholder: "whsec_...",
        type: "password",
        direction: "paste_here",
        required: false,
        securityWarning: "Não compartilhe este segredo com terceiros.",
        help: {
          title: "Como obter o Webhook Signing Secret?",
          steps: [
            "No Stripe Dashboard, clique em Developers → Webhooks",
            "Clique no botão Add Endpoint",
            "Cole a URL de webhook gerada pelo CapiTrack (abaixo) no campo Endpoint URL",
            "Em Events to send, selecione: checkout.session.completed e payment_intent.succeeded",
            "Clique em Add Endpoint para salvar",
            "Na página do endpoint criado, clique em Reveal Signing Secret",
            "Copie o valor que começa com whsec_...",
          ],
          link: { url: "https://dashboard.stripe.com/webhooks", label: "Abrir Stripe Webhooks" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Stripe Dashboard, clique em Developers → Webhooks",
        "Clique no botão Add Endpoint",
        "Cole esta URL no campo Endpoint URL",
      ]),
    ],
    docsLink: { url: "https://stripe.com/docs/webhooks", label: "Documentação Stripe Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Stripe → Developers → Webhooks → Add Endpoint",
      "Cole o Signing Secret gerado pelo Stripe no campo acima",
      "Envie um pagamento de teste para validar a integração",
    ],
  },

  paypal: {
    label: "PayPal",
    integrationType: "hybrid",
    emoji: "🅿️",
    country: "int",
    description: "Pagamentos internacionais via PayPal Checkout e IPN.",
    checklist: [
      "Acesse o PayPal Developer Dashboard",
      "Copie o Client ID e Secret",
      "Cole aqui",
      "Copie a URL de webhook e cadastre no PayPal",
    ],
    fields: [
      {
        key: "credentials",
        label: "Client ID",
        placeholder: "Client ID do PayPal",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Client ID do PayPal?",
          steps: [
            "Acesse developer.paypal.com e faça login",
            "Clique em Apps & Credentials no menu lateral",
            "Selecione a aba Live (produção) ou Sandbox (testes)",
            "Clique na sua aplicação ou crie uma nova",
            "Copie o Client ID exibido na página da aplicação",
          ],
          link: { url: "https://developer.paypal.com/dashboard/applications/live", label: "Abrir PayPal Developers" },
        },
      },
      {
        key: "webhookSecret",
        label: "Secret Key",
        placeholder: "Secret do PayPal",
        type: "password",
        direction: "paste_here",
        required: true,
        securityWarning: "Não compartilhe este segredo com terceiros.",
        help: {
          title: "Onde encontrar a Secret Key?",
          steps: [
            "Na mesma página da aplicação no PayPal Developers",
            "Clique em Show abaixo de Secret",
            "Copie o valor exibido",
          ],
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No PayPal Developers, acesse sua aplicação",
        "Clique em Add Webhook",
        "Cole esta URL no campo Webhook URL",
        "Selecione os eventos: PAYMENT.SALE.COMPLETED, CHECKOUT.ORDER.APPROVED",
      ]),
    ],
    docsLink: { url: "https://developer.paypal.com/docs/api-basics/notifications/webhooks/", label: "Documentação PayPal Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no PayPal Developers → sua app → Webhooks",
      "Selecione os eventos de pagamento",
      "Teste com uma transação sandbox",
    ],
  },

  shopify: {
    label: "Shopify",
    integrationType: "hybrid",
    emoji: "🛍️",
    country: "int",
    description: "Plataforma de e-commerce com webhooks de pedidos.",
    checklist: [
      "Crie um Custom App no Shopify Admin",
      "Copie o Admin API Access Token",
      "Cole aqui junto com a URL da loja",
      "Copie a URL de webhook e cadastre no Shopify",
    ],
    fields: [
      {
        key: "credentials",
        label: "Admin API Access Token",
        placeholder: "shpat_...",
        type: "password",
        direction: "paste_here",
        required: true,
        securityWarning: "O token só é exibido uma vez. Salve-o em local seguro.",
        help: {
          title: "Como obter o Access Token do Shopify?",
          steps: [
            "Acesse o admin da sua loja: sua-loja.myshopify.com/admin",
            "Clique em Settings (⚙️) no canto inferior esquerdo",
            "Clique em Apps and sales channels",
            "Clique em Develop apps → Create an app",
            "Dê um nome ao app (ex: CapiTrack)",
            "Em Configuration, clique em Configure Admin API scopes",
            "Ative os scopes: read_orders, read_customers, read_checkouts",
            "Clique em Install app",
            "Copie o Admin API access token exibido (shpat_...)",
          ],
          link: { url: "https://admin.shopify.com/store", label: "Abrir Shopify Admin" },
        },
      },
      {
        key: "webhookSecret",
        label: "URL da Loja",
        placeholder: "sua-loja.myshopify.com",
        type: "text",
        direction: "paste_here",
        required: true,
        help: {
          title: "Qual é a URL da sua loja?",
          steps: [
            "É o domínio myshopify.com da sua loja",
            "Formato: sua-loja.myshopify.com",
            "Encontre no Shopify Admin → Settings → Domains",
          ],
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Shopify Admin, vá em Settings → Notifications",
        "Role até Webhooks e clique em Create webhook",
        "Selecione o evento (ex: Order payment) e o formato JSON",
        "Cole esta URL no campo URL",
      ]),
    ],
    docsLink: { url: "https://shopify.dev/docs/apps/build/webhooks", label: "Documentação Shopify Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Shopify Admin → Settings → Notifications → Webhooks",
      "Selecione os eventos de pedido relevantes",
      "Faça um pedido de teste para validar",
    ],
  },

  paddle: {
    label: "Paddle",
    integrationType: "hybrid",
    emoji: "🏓",
    country: "int",
    description: "Merchant of Record para vendas globais de SaaS e produtos digitais.",
    checklist: [
      "Acesse o Paddle Dashboard",
      "Copie a API Key",
      "Cole aqui",
      "Copie a URL de webhook e cadastre no Paddle",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Key",
        placeholder: "pdl_live_... ou pdl_sdbx_...",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key do Paddle?",
          steps: [
            "Acesse vendors.paddle.com e faça login",
            "No menu lateral, clique em Developer Tools → Authentication",
            "Clique em Generate API Key",
            "Copie a chave gerada",
          ],
          link: { url: "https://vendors.paddle.com/authentication", label: "Abrir Paddle Dashboard" },
        },
      },
      {
        key: "webhookSecret",
        label: "Webhook Secret Key",
        placeholder: "pdl_ntfset_...",
        type: "password",
        direction: "paste_here",
        required: false,
        securityWarning: "Usado para verificar assinatura dos webhooks.",
        help: {
          title: "Como obter o Webhook Secret?",
          steps: [
            "No Paddle Dashboard, vá em Developer Tools → Notifications",
            "Crie ou edite uma Notification Destination",
            "Copie o Secret Key exibido",
          ],
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Paddle Dashboard, vá em Developer Tools → Notifications",
        "Clique em New Destination",
        "Cole esta URL no campo URL",
        "Selecione os eventos: transaction.completed, subscription.activated",
      ]),
    ],
    docsLink: { url: "https://developer.paddle.com/webhooks/overview", label: "Documentação Paddle Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Paddle → Developer Tools → Notifications",
      "Selecione os eventos de transação",
      "Teste com uma transação sandbox",
    ],
  },

  gumroad: {
    label: "Gumroad",
    integrationType: "hybrid",
    emoji: "🎨",
    country: "int",
    description: "Plataforma para venda de produtos digitais e criativos.",
    checklist: [
      "Acesse Gumroad → Settings → Advanced",
      "Copie o Access Token",
      "Cole aqui",
      "Cadastre a URL de webhook (Ping)",
    ],
    fields: [
      {
        key: "credentials",
        label: "Access Token",
        placeholder: "Token do Gumroad",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Access Token?",
          steps: [
            "Acesse gumroad.com e faça login",
            "Clique no seu avatar → Settings",
            "Clique na aba Advanced",
            "Em Application API, clique em Create application ou use o token existente",
            "Copie o Access Token",
          ],
          link: { url: "https://app.gumroad.com/settings/advanced", label: "Abrir Gumroad Settings" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Gumroad, acesse Settings → Advanced",
        "No campo Ping URL (Webhook), cole esta URL",
        "Clique em Update para salvar",
      ]),
    ],
    docsLink: { url: "https://help.gumroad.com/article/164-webhooks", label: "Documentação Gumroad Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Gumroad → Settings → Advanced → Ping URL",
      "Faça uma venda de teste para validar",
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // BRASIL
  // ═══════════════════════════════════════════════════════════

  mercadopago: {
    label: "Mercado Pago",
    integrationType: "hybrid",
    emoji: "🟡",
    country: "br",
    description: "Principal gateway de pagamentos do Brasil.",
    checklist: [
      "Acesse Mercado Pago Developers",
      "Copie o Access Token de produção",
      "Cole aqui",
      "Copie a URL de webhook e cadastre no painel",
    ],
    fields: [
      {
        key: "credentials",
        label: "Access Token",
        placeholder: "APP_USR-...",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Access Token?",
          steps: [
            "Acesse mercadopago.com.br/developers e faça login",
            "No menu lateral, clique em Suas Integrações",
            "Selecione ou crie uma aplicação",
            "Clique na aba Credenciais de produção",
            "Copie o Access Token (começa com APP_USR-...)",
          ],
          link: { url: "https://www.mercadopago.com.br/developers/panel/app", label: "Abrir Mercado Pago Developers" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Mercado Pago Developers, acesse sua aplicação",
        "Clique na aba Webhooks no menu lateral",
        "Clique em Configurar notificações",
        "Cole esta URL no campo URL de produção",
        "Selecione os eventos: payment, merchant_order",
      ]),
    ],
    docsLink: { url: "https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks", label: "Documentação Mercado Pago Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Mercado Pago → Suas Integrações → Webhooks",
      "Selecione os eventos de pagamento",
      "Faça uma compra de teste para validar",
    ],
  },

  hotmart: {
    label: "Hotmart",
    integrationType: "hybrid",
    emoji: "🔥",
    country: "br",
    description: "Plataforma de produtos digitais e infoprodutos.",
    checklist: [
      "Acesse a Hotmart → Ferramentas → Webhooks",
      "Copie o Client ID da sua aplicação",
      "Copie o Client Secret",
      "Cole ambos aqui",
      "Copie a URL de webhook gerada e cadastre na Hotmart",
    ],
    fields: [
      {
        key: "credentials",
        label: "Client ID / API Key",
        placeholder: "Seu Client ID da Hotmart",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Como obter o Client ID na Hotmart?",
          steps: [
            "Acesse app-vlc.hotmart.com e faça login",
            "No menu lateral, clique em Ferramentas",
            "Clique em Integrações ou APIs",
            "Localize sua aplicação (ou crie uma nova)",
            "Na página da aplicação, copie o campo Client ID",
          ],
          link: { url: "https://app-vlc.hotmart.com/tools/webhook", label: "Abrir Hotmart Webhooks" },
        },
      },
      {
        key: "webhookSecret",
        label: "Webhook Token / Secret",
        placeholder: "Token de autenticação do webhook",
        type: "password",
        direction: "paste_here",
        required: false,
        securityWarning: "Não compartilhe este segredo.",
        help: {
          title: "Como obter o Token do Webhook?",
          steps: [
            "Na Hotmart, vá em Ferramentas → Webhooks",
            "Clique em Configurar webhook ou edite um existente",
            "Na seção de segurança/autenticação, copie ou gere o token",
            "Cole aqui",
          ],
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "Na Hotmart, vá em Ferramentas → Webhooks",
        "Clique em Criar novo webhook",
        "Cole esta URL no campo de endpoint/URL",
        "Selecione os eventos: PURCHASE_COMPLETE, PURCHASE_REFUNDED",
      ]),
    ],
    docsLink: { url: "https://developers.hotmart.com/docs/pt-BR/", label: "Documentação Hotmart Developers" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Hotmart → Ferramentas → Webhooks",
      "Selecione os eventos (PURCHASE_COMPLETE, etc.)",
      "Faça uma compra de teste para validar",
    ],
  },

  kiwify: {
    label: "Kiwify",
    integrationType: "hybrid",
    emoji: "🥝",
    country: "br",
    description: "Plataforma de vendas de produtos digitais.",
    checklist: [
      "Acesse a Kiwify → Integrações → Webhooks",
      "Gere ou copie o token do webhook",
      "Cole aqui",
      "Copie a URL de webhook gerada e cadastre na Kiwify",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token do Webhook",
        placeholder: "Token da Kiwify",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Como obter o Token na Kiwify?",
          steps: [
            "Acesse dashboard.kiwify.com.br e faça login",
            "No menu lateral, clique em Configurações",
            "Clique na aba Webhooks",
            "Gere um novo webhook ou copie o token existente",
            "Cole o token aqui",
          ],
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "Na Kiwify, acesse Configurações → Webhooks",
        "Clique em Adicionar webhook",
        "Cole esta URL no campo URL",
        "Selecione os eventos de compra",
      ]),
    ],
    docsLink: { url: "https://help.kiwify.com.br", label: "Central de Ajuda Kiwify" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Kiwify → Configurações → Webhooks",
      "Selecione os eventos desejados",
      "Teste com uma transação para validar",
    ],
  },

  fortpay: {
    label: "FortPay",
    integrationType: "webhook_only",
    emoji: "🏰",
    country: "br",
    description: "Gateway de pagamentos com integração via webhook URL.",
    checklist: [
      "Crie a integração aqui",
      "A plataforma gerará uma URL única de webhook",
      "Copie essa URL",
      "Cadastre no painel da FortPay",
    ],
    fields: [],
    generatedOutputs: [
      {
        ...webhookOutput([
          "Acesse o painel da FortPay e faça login",
          "Vá em Configurações → Webhooks / Notificações",
          "Clique em Adicionar endpoint",
          "Cole esta URL no campo de URL de notificação",
          "Salve as configurações",
        ]),
        helpText: "A FortPay requer apenas a URL de webhook. Não é necessário preencher token manualmente.",
      },
    ],
    docsLink: { url: "https://fortpay.com.br", label: "Abrir FortPay" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "No painel da FortPay, cadastre como endpoint de notificação",
      "Salve e teste com uma transação",
    ],
  },

  pagarme: {
    label: "Pagar.me",
    integrationType: "hybrid",
    emoji: "🟢",
    country: "br",
    description: "Gateway de pagamentos brasileiro da Stone.",
    checklist: [
      "Pegue a API Key no painel Pagar.me",
      "Cole aqui",
      "Copie a URL de webhook e cadastre no Pagar.me",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Key",
        placeholder: "ak_live_... ou ak_test_...",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key do Pagar.me?",
          steps: [
            "Acesse dashboard.pagar.me e faça login",
            "No menu lateral, clique em Configurações",
            "Clique em Chaves de API",
            "Copie a chave de API (ak_live_... ou ak_test_...)",
          ],
          link: { url: "https://dashboard.pagar.me", label: "Abrir Pagar.me Dashboard" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Pagar.me Dashboard, vá em Configurações → Webhooks",
        "Clique em Adicionar endpoint",
        "Cole esta URL e selecione os eventos de pagamento",
      ]),
    ],
    docsLink: { url: "https://docs.pagar.me/reference/webhooks-1", label: "Documentação Pagar.me Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Pagar.me → Configurações → Webhooks",
      "Selecione os eventos de transação",
      "Faça uma transação de teste para validar",
    ],
  },

  asaas: {
    label: "Asaas",
    integrationType: "hybrid",
    emoji: "🔵",
    country: "br",
    description: "Plataforma de cobranças e pagamentos.",
    checklist: [
      "Pegue a API Key no Asaas",
      "Cole aqui",
      "Copie a URL de webhook e cadastre",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Key",
        placeholder: "$aact_... (chave de API do Asaas)",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key do Asaas?",
          steps: [
            "Acesse app.asaas.com e faça login",
            "Clique no ícone de engrenagem (Configurações)",
            "No menu lateral, clique em Integrações",
            "Clique na aba API",
            "Clique em Gerar nova chave de API (ou copie a existente)",
            "Copie a chave (começa com $aact_...)",
          ],
          link: { url: "https://www.asaas.com/config/api", label: "Abrir Asaas API" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Asaas, vá em Configurações → Integrações → Webhooks",
        "Clique em Adicionar webhook",
        "Cole esta URL no campo de URL",
        "Selecione os eventos de cobrança e pagamento",
      ]),
    ],
    docsLink: { url: "https://docs.asaas.com/reference/webhooks", label: "Documentação Asaas Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Asaas → Configurações → Integrações → Webhooks",
      "Selecione os eventos de pagamento",
      "Teste com uma cobrança para validar",
    ],
  },

  appmax: {
    label: "Appmax",
    integrationType: "hybrid",
    emoji: "📱",
    country: "br",
    description: "Plataforma de vendas online e checkout.",
    checklist: [
      "Pegue o token de API no painel Appmax",
      "Cole aqui",
      "Cadastre a URL de webhook na Appmax",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da Appmax",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Appmax?",
          steps: [
            "Acesse o painel da Appmax e faça login",
            "No menu, clique em Configurações",
            "Clique na aba API / Integrações",
            "Localize o campo Token de acesso",
            "Copie o token exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Appmax, vá em Configurações → Webhooks", "Clique em Adicionar webhook", "Cole esta URL"])],
    docsLink: { url: "https://appmax.com.br", label: "Abrir Appmax" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Appmax → Configurações → Webhooks",
      "Salve e teste com um pedido",
    ],
  },

  monetizze: {
    label: "Monetizze",
    integrationType: "hybrid",
    emoji: "💰",
    country: "br",
    description: "Plataforma de afiliados e produtos digitais.",
    checklist: [
      "Pegue o token na Monetizze",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Monetizze",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Monetizze?",
          steps: [
            "Acesse app.monetizze.com.br e faça login",
            "No menu, clique em Configurações",
            "Clique em Integrações ou API",
            "Localize o campo Token de acesso",
            "Copie o token exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Monetizze, vá em Configurações → Integrações → Webhooks", "Adicione esta URL como endpoint"])],
    docsLink: { url: "https://app.monetizze.com.br", label: "Abrir Monetizze" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Monetizze → Integrações → Webhooks",
      "Selecione os eventos de venda",
      "Teste com uma transação para validar",
    ],
  },

  eduzz: {
    label: "Eduzz",
    integrationType: "hybrid",
    emoji: "📚",
    country: "br",
    description: "Plataforma de produtos digitais e cursos.",
    checklist: [
      "Pegue a API Key na Eduzz",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Key",
        placeholder: "Sua chave da Eduzz",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key da Eduzz?",
          steps: [
            "Acesse orbita.eduzz.com e faça login",
            "No menu, clique em Configurações",
            "Clique em API / Integrações",
            "Localize ou gere sua chave de API",
            "Copie a API Key exibida",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Eduzz, vá em Configurações → Webhooks", "Clique em Adicionar webhook", "Cole esta URL"])],
    docsLink: { url: "https://developers.eduzz.com", label: "Documentação Eduzz Developers" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Eduzz → Configurações → Webhooks",
      "Selecione os eventos de compra",
      "Teste com uma transação para validar",
    ],
  },

  cakto: {
    label: "Cakto",
    integrationType: "hybrid",
    emoji: "🎯",
    country: "br",
    description: "Plataforma de vendas de infoprodutos.",
    checklist: [
      "Pegue o token na Cakto",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Cakto",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Cakto?",
          steps: [
            "Acesse o painel da Cakto e faça login",
            "No menu lateral, clique em Integrações",
            "Clique em API ou Configurações de API",
            "Copie o token de acesso exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Cakto, vá em Integrações → Webhooks", "Adicione esta URL como endpoint"])],
    docsLink: { url: "https://cakto.com.br", label: "Abrir Cakto" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Cakto → Integrações → Webhooks",
      "Selecione os eventos de venda",
      "Teste com uma transação para validar",
    ],
  },

  kirvano: {
    label: "Kirvano",
    integrationType: "hybrid",
    emoji: "🚀",
    country: "br",
    description: "Plataforma de checkout e vendas.",
    checklist: [
      "Pegue o token no painel Kirvano",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Kirvano",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Kirvano?",
          steps: [
            "Acesse o painel da Kirvano e faça login",
            "No menu, clique em Configurações",
            "Clique na aba API / Integrações",
            "Copie o token exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Kirvano, vá em Configurações → Webhooks", "Adicione esta URL como endpoint"])],
    docsLink: { url: "https://kirvano.com", label: "Abrir Kirvano" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Kirvano → Configurações → Webhooks",
      "Selecione os eventos de checkout",
      "Teste com uma transação para validar",
    ],
  },

  pagseguro: {
    label: "PagSeguro",
    integrationType: "hybrid",
    emoji: "🟠",
    country: "br",
    description: "Gateway de pagamentos do PagBank.",
    checklist: [
      "Pegue o token no PagSeguro/PagBank",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token do PagSeguro",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token do PagSeguro?",
          steps: [
            "Acesse minhaconta.pagseguro.uol.com.br e faça login",
            "No menu, clique em Integrações",
            "Clique em Token de segurança",
            "Clique em Gerar novo token (se necessário)",
            "Copie o token exibido",
          ],
          link: { url: "https://pagseguro.uol.com.br", label: "Abrir PagSeguro" },
        },
      },
    ],
    generatedOutputs: [webhookOutput(["No PagSeguro, vá em Integrações → Notificações", "Cole esta URL no campo de URL de notificação"])],
    docsLink: { url: "https://dev.pagbank.uol.com.br/reference/webhooks", label: "Documentação PagBank/PagSeguro" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no PagSeguro → Integrações → Notificações",
      "Selecione os eventos de pagamento",
      "Teste com uma transação para validar",
    ],
  },

  pushinpay: {
    label: "PushinPay",
    integrationType: "hybrid",
    emoji: "⚡",
    country: "br",
    description: "Gateway de pagamentos via Pix.",
    checklist: [
      "Pegue o token na PushinPay",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da PushinPay",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da PushinPay?",
          steps: [
            "Acesse o painel da PushinPay e faça login",
            "No menu, clique em Configurações",
            "Clique em API / Chaves",
            "Copie o token de acesso exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na PushinPay, vá em Configurações → Webhooks", "Cole esta URL como endpoint"])],
    docsLink: { url: "https://pushinpay.com.br", label: "Abrir PushinPay" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na PushinPay → Configurações → Webhooks",
      "Selecione os eventos de Pix",
      "Teste com um pagamento Pix para validar",
    ],
  },

  perfectpay: {
    label: "Perfect Pay",
    integrationType: "hybrid",
    emoji: "✅",
    country: "br",
    description: "Plataforma de checkout e pagamentos.",
    checklist: [
      "Pegue o token na Perfect Pay",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Perfect Pay",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Perfect Pay?",
          steps: [
            "Acesse o painel da Perfect Pay e faça login",
            "No menu, clique em Integrações",
            "Clique na aba API",
            "Copie o token de acesso exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Perfect Pay, vá em Integrações → Webhooks", "Cole esta URL como endpoint"])],
    docsLink: { url: "https://perfectpay.com.br", label: "Abrir Perfect Pay" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Perfect Pay → Integrações → Webhooks",
      "Selecione os eventos de compra",
      "Teste com uma transação para validar",
    ],
  },

  greenn: {
    label: "Greenn",
    integrationType: "hybrid",
    emoji: "🌿",
    country: "br",
    description: "Plataforma de vendas e checkout.",
    checklist: [
      "Pegue o token na Greenn",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Greenn",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Greenn?",
          steps: [
            "Acesse o painel da Greenn e faça login",
            "No menu, clique em Configurações",
            "Clique em API / Integrações",
            "Copie o token de acesso exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Greenn, vá em Configurações → Webhooks", "Cole esta URL como endpoint"])],
    docsLink: { url: "https://greenn.com.br", label: "Abrir Greenn" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Greenn → Configurações → Webhooks",
      "Selecione os eventos de venda",
      "Teste com uma transação para validar",
    ],
  },

  ticto: {
    label: "Ticto",
    integrationType: "hybrid",
    emoji: "🎪",
    country: "br",
    description: "Plataforma de checkout e vendas.",
    checklist: [
      "Pegue o token na Ticto",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Ticto",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Ticto?",
          steps: [
            "Acesse o painel da Ticto e faça login",
            "No menu lateral, clique em Configurações",
            "Clique em Integrações ou API",
            "Copie o token de acesso exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Ticto, vá em Configurações → Webhooks", "Cole esta URL como endpoint"])],
    docsLink: { url: "https://ticto.com.br", label: "Abrir Ticto" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Ticto → Configurações → Webhooks",
      "Selecione os eventos de checkout",
      "Teste com uma transação para validar",
    ],
  },

  yampi: {
    label: "Yampi Payments",
    integrationType: "hybrid",
    emoji: "🛒",
    country: "br",
    description: "Plataforma de e-commerce e checkout.",
    checklist: [
      "Pegue o token na Yampi",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Yampi",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Yampi?",
          steps: [
            "Acesse o painel da Yampi e faça login",
            "No menu, clique em Configurações",
            "Clique em Integrações → API",
            "Copie o User Token e Secret Key exibidos",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Yampi, vá em Configurações → Webhooks", "Cole esta URL como endpoint"])],
    docsLink: { url: "https://docs.yampi.com.br", label: "Documentação Yampi" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Yampi → Configurações → Webhooks",
      "Selecione os eventos de pedido",
      "Teste com um pedido para validar",
    ],
  },

  vindi: {
    label: "Vindi",
    integrationType: "hybrid",
    emoji: "💜",
    country: "br",
    description: "Plataforma de pagamentos recorrentes.",
    checklist: [
      "Pegue a API Key na Vindi",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Key",
        placeholder: "Chave da Vindi",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key da Vindi?",
          steps: [
            "Acesse app.vindi.com.br e faça login",
            "No menu, clique em Configurações",
            "Clique em Chaves de API",
            "Copie a chave privada (Private Key)",
          ],
          link: { url: "https://app.vindi.com.br", label: "Abrir Vindi" },
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Vindi, vá em Configurações → Webhooks", "Clique em Novo webhook", "Cole esta URL"])],
    docsLink: { url: "https://atendimento.vindi.com.br/hc/pt-br/articles/203305800", label: "Documentação Vindi Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Vindi → Configurações → Webhooks",
      "Selecione os eventos de cobrança",
      "Teste com uma cobrança para validar",
    ],
  },

  iugu: {
    label: "Iugu",
    integrationType: "hybrid",
    emoji: "🧾",
    country: "br",
    description: "Plataforma de pagamentos e cobranças.",
    checklist: [
      "Pegue o token na Iugu",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da Iugu",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Iugu?",
          steps: [
            "Acesse alia.iugu.com e faça login",
            "No menu, clique em Administração",
            "Clique em Chaves de API",
            "Copie o token de produção (Live) ou teste (Test)",
          ],
          link: { url: "https://alia.iugu.com", label: "Abrir Iugu" },
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Iugu, vá em Configurações → Gatilhos", "Adicione um novo gatilho com esta URL"])],
    docsLink: { url: "https://dev.iugu.com/reference/webhooks", label: "Documentação Iugu Webhooks" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Iugu → Configurações → Gatilhos",
      "Selecione os eventos de pagamento",
      "Teste com uma cobrança para validar",
    ],
  },

  efi: {
    label: "Gerencianet / Efí",
    integrationType: "hybrid",
    emoji: "💎",
    country: "br",
    description: "Gateway de pagamentos Pix e boleto.",
    checklist: [
      "Pegue as credenciais na Efí",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "Client ID / Credencial",
        placeholder: "Client_Id_...",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar as credenciais da Efí?",
          steps: [
            "Acesse app.sejaefi.com.br e faça login",
            "No menu, clique em API",
            "Clique em Minhas Aplicações",
            "Selecione sua aplicação (ou crie uma nova)",
            "Copie o Client ID exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Efí, vá em API → Webhooks", "Cole esta URL como endpoint de notificação"])],
    docsLink: { url: "https://dev.efipay.com.br", label: "Documentação Efí Pay" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Efí → API → Webhooks",
      "Configure os eventos de pagamento",
      "Teste com uma transação para validar",
    ],
  },

  abacatepay: {
    label: "AbacatePay",
    integrationType: "hybrid",
    emoji: "🥑",
    country: "br",
    description: "Gateway de pagamentos Pix.",
    checklist: [
      "Pegue o token na AbacatePay",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da AbacatePay",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da AbacatePay?",
          steps: [
            "Acesse o painel da AbacatePay e faça login",
            "No menu, clique em Configurações",
            "Clique em API / Chaves de acesso",
            "Copie o token exibido",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na AbacatePay, vá em Configurações → Webhooks", "Cole esta URL como endpoint"])],
    docsLink: { url: "https://abacatepay.com", label: "Abrir AbacatePay" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na AbacatePay → Configurações → Webhooks",
      "Selecione os eventos Pix",
      "Teste com um pagamento Pix para validar",
    ],
  },

  hubla: {
    label: "Hubla",
    integrationType: "hybrid",
    emoji: "🔗",
    country: "br",
    description: "Plataforma de comunidades e pagamentos.",
    checklist: [
      "Pegue o token na Hubla",
      "Cole aqui",
      "Cadastre a URL de webhook",
    ],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da Hubla",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token da Hubla?",
          steps: [
            "Acesse o painel da Hubla e faça login",
            "No menu, clique em Configurações",
            "Clique em Integrações",
            "Localize a seção de API e copie o token",
          ],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Hubla, vá em Configurações → Webhooks", "Cole esta URL como endpoint"])],
    docsLink: { url: "https://hubla.com.br", label: "Abrir Hubla" },
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Hubla → Configurações → Webhooks",
      "Selecione os eventos de pagamento",
      "Teste com uma transação para validar",
    ],
  },

  quantumpay: {
    label: "Quantum Pay",
    integrationType: "hybrid",
    emoji: "⚛️",
    country: "br",
    description: "Gateway brasileiro de PIX (PIX IN e PIX OUT) com webhooks assinados via HMAC-SHA256.",
    checklist: [
      "Acesse o Dashboard da Quantum Pay → aba Quantum Pay API",
      "Copie Account ID, API Key (Pública) e API Secret e cole abaixo",
      "Vá em Webhooks → Criar novo webhook",
      "Cole a URL gerada abaixo como endpoint",
      "Selecione os eventos: transaction_paid, transaction_refunded, transaction_created",
      "Copie o signatureSecret (whk_live_...) que aparece após a criação e cole abaixo",
    ],
    fields: [
      {
        key: "accountId",
        label: "Account ID",
        placeholder: "cmo0bzx6b00009h1ayt33i1je",
        type: "text",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Account ID?",
          steps: [
            "Acesse app.quantumpay.com.br e faça login",
            "Vá em Integrações / API → aba Quantum Pay API",
            "Copie o valor exibido em ACCOUNT ID",
          ],
          link: { url: "https://app.quantumpay.com.br", label: "Abrir Quantum Pay" },
        },
      },
      {
        key: "apiKey",
        label: "API Key (Pública)",
        placeholder: "cmo0cdr6a0000139h33t25y1u",
        type: "text",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key Pública?",
          steps: [
            "Na mesma aba Quantum Pay API",
            "Copie o valor exibido em API KEY (PÚBLICA)",
          ],
        },
      },
      {
        key: "apiSecret",
        label: "API Secret",
        placeholder: "Sua chave secreta da API",
        type: "password",
        direction: "paste_here",
        required: true,
        securityWarning: "Mantenha esse secret seguro. Usado para autenticar requisições server-to-server.",
        help: {
          title: "Onde encontrar a API Secret?",
          steps: [
            "Na mesma aba Quantum Pay API",
            "Em API SECRET (SECRETA), clique no ícone de olho para revelar",
            "Copie o valor completo",
          ],
        },
      },
      {
        key: "webhookSecret",
        label: "Webhook Signature Secret (whk_live_...)",
        placeholder: "whk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        type: "password",
        direction: "paste_here",
        required: true,
        securityWarning: "Esse secret valida a autenticidade dos webhooks. Não compartilhe.",
        help: {
          title: "Como obter o Signature Secret do Webhook?",
          steps: [
            "Acesse app.quantumpay.com.br → aba Webhooks",
            "Clique em Criar novo webhook",
            "Cole a URL do CapiTrack (gerada abaixo) como endpoint",
            "Selecione os eventos (recomendado: transaction_paid, transaction_refunded)",
            "Após criar, copie o signatureSecret que começa com whk_live_...",
            "Cole aqui — ele NÃO é exibido novamente!",
          ],
          note: "A validação por HMAC-SHA256 garante a autenticidade dos eventos recebidos.",
          link: { url: "https://docs.quantumpay.com.br/webhook", label: "Documentação Webhooks" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Dashboard da Quantum Pay, vá em Webhooks",
        "Clique em Criar novo webhook",
        "Cole esta URL no campo de endpoint",
        "Selecione os eventos: transaction_paid (Purchase), transaction_refunded, transaction_created (opcional)",
        "Salve e copie o signatureSecret gerado para o campo acima",
      ]),
    ],
    docsLink: { url: "https://docs.quantumpay.com.br/", label: "Documentação Quantum Pay" },
    nextSteps: [
      "Cole as 3 credenciais (Account ID, API Key, API Secret) acima",
      "Copie a URL de webhook gerada e cadastre na Quantum Pay",
      "Cole o signatureSecret retornado e salve",
      "Faça uma transação PIX de teste — verifique em Event Logs",
    ],
  },
};

/** Retorna providers por país */
export const getProvidersByCountry = (country: "br" | "int") =>
  Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.country === country)
    .map(([value, c]) => ({ value, ...c }));
