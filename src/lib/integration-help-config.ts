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
  stripe: {
    label: "Stripe",
    integrationType: "hybrid" as const,
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
            "Acesse o Dashboard do Stripe",
            "Vá em Developers → API Keys",
            "Copie a Secret Key (sk_live_... ou sk_test_...)",
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
            "No Stripe Dashboard, vá em Developers → Webhooks",
            "Clique em Add Endpoint",
            "Cole a URL de webhook gerada pelo CapiTrack (abaixo)",
            "Selecione os eventos: checkout.session.completed, payment_intent.succeeded",
            "Após criar, copie o Signing Secret (whsec_...)",
          ],
          link: { url: "https://dashboard.stripe.com/webhooks", label: "Abrir Stripe Webhooks" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Stripe Dashboard, vá em Developers → Webhooks",
        "Clique em Add Endpoint",
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

  mercadopago: {
    label: "Mercado Pago",
    integrationType: "hybrid" as const,
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
            "Acesse Mercado Pago Developers",
            "Vá em Suas Integrações → Credenciais",
            "Copie o Access Token de produção",
          ],
          link: { url: "https://www.mercadopago.com.br/developers/panel/app", label: "Abrir Mercado Pago Developers" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Mercado Pago, acesse Suas Integrações → Webhooks",
        "Clique em Configurar notificações",
        "Cole esta URL no campo de URL de notificação",
      ]),
    ],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Mercado Pago → Integrações → Webhooks",
      "Faça uma compra de teste para validar",
    ],
  },

  hotmart: {
    label: "Hotmart",
    integrationType: "hybrid" as const,
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
            "Acesse o painel da Hotmart",
            "Vá em Ferramentas → Integrações / APIs",
            "Localize sua aplicação",
            "Copie o Client ID",
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
            "Acesse a configuração de webhooks na Hotmart",
            "Gere ou copie o token de autenticação",
            "Cole aqui",
          ],
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "Na Hotmart, vá em Ferramentas → Webhooks",
        "Clique em Criar novo webhook",
        "Cole esta URL no campo de endpoint",
        "Selecione os eventos desejados (ex: PURCHASE_COMPLETE)",
      ]),
    ],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Hotmart → Ferramentas → Webhooks",
      "Selecione os eventos (PURCHASE_COMPLETE, etc.)",
      "Faça uma compra de teste para validar",
    ],
  },

  kiwify: {
    label: "Kiwify",
    integrationType: "hybrid" as const,
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
            "Acesse a área de integrações/webhooks da Kiwify",
            "Gere ou copie o token/chave do webhook",
            "Cole aqui",
          ],
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "Na Kiwify, acesse Integrações → Webhooks",
        "Adicione um novo webhook",
        "Cole esta URL no campo de URL",
      ]),
    ],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Kiwify → Integrações → Webhooks",
      "Teste com uma transação para validar",
    ],
  },

  fortpay: {
    label: "FortPay",
    integrationType: "webhook_only" as const,
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
          "No painel da FortPay, acesse Configurações → Webhooks",
          "Adicione um novo endpoint",
          "Cole esta URL gerada",
        ]),
        helpText: "A FortPay requer apenas a URL de webhook. Não é necessário preencher token manualmente.",
      },
    ],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "No painel da FortPay, cadastre como endpoint de notificação",
      "Salve e teste com uma transação",
    ],
  },

  pagarme: {
    label: "Pagar.me",
    integrationType: "hybrid" as const,
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
          title: "Onde encontrar a API Key?",
          steps: [
            "Acesse o Dashboard do Pagar.me",
            "Vá em Configurações → Chaves de API",
            "Copie a chave de API",
          ],
          link: { url: "https://dashboard.pagar.me", label: "Abrir Pagar.me Dashboard" },
        },
      },
    ],
    generatedOutputs: [
      webhookOutput([
        "No Pagar.me, acesse Configurações → Webhooks",
        "Adicione um novo endpoint com esta URL",
      ]),
    ],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Pagar.me → Configurações → Webhooks",
      "Salve a integração",
      "Faça uma transação de teste para validar",
    ],
  },

  asaas: {
    label: "Asaas",
    integrationType: "hybrid" as const,
    emoji: "🔵",
    country: "br",
    description: "Plataforma de cobranças e pagamentos.",
    checklist: ["Pegue a API Key no Asaas", "Cole aqui", "Copie a URL de webhook e cadastre"],
    fields: [
      {
        key: "credentials",
        label: "API Key",
        placeholder: "Sua chave de API do Asaas",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key?",
          steps: ["Acesse o painel do Asaas", "Vá em Integrações → API", "Copie a chave de API"],
          link: { url: "https://www.asaas.com", label: "Abrir Asaas" },
        },
      },
    ],
    generatedOutputs: [webhookOutput(["No Asaas, acesse Integrações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no Asaas → Integrações → Webhooks",
      "Salve a integração",
      "Teste com uma cobrança para validar",
    ],
  },

  appmax: {
    label: "Appmax",
    integrationType: "hybrid" as const,
    emoji: "📱",
    country: "br",
    description: "Plataforma de vendas online.",
    checklist: ["Pegue o token de API no Appmax", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da Appmax",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token?",
          steps: ["Acesse o painel da Appmax", "Vá em Configurações → API", "Copie o token de acesso"],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Appmax, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Appmax → Configurações → Webhooks",
      "Salve a integração",
      "Teste com um pedido para validar",
    ],
  },

  monetizze: {
    label: "Monetizze",
    integrationType: "hybrid" as const,
    emoji: "💰",
    country: "br",
    description: "Plataforma de afiliados e produtos digitais.",
    checklist: ["Pegue o token na Monetizze", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Monetizze",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token?",
          steps: ["Acesse o painel da Monetizze", "Vá em Configurações → Integrações", "Copie o token de acesso"],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Monetizze, acesse Integrações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Monetizze → Integrações → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  eduzz: {
    label: "Eduzz",
    integrationType: "hybrid" as const,
    emoji: "📚",
    country: "br",
    description: "Plataforma de produtos digitais e cursos.",
    checklist: ["Pegue a API Key na Eduzz", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "API Key",
        placeholder: "Sua chave da Eduzz",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar a API Key?",
          steps: ["Acesse o painel da Eduzz", "Vá em Configurações → API / Integrações", "Copie a API Key"],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Eduzz, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Eduzz → Configurações → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  cakto: {
    label: "Cakto",
    integrationType: "hybrid" as const,
    emoji: "🎯",
    country: "br",
    description: "Plataforma de vendas de infoprodutos.",
    checklist: ["Pegue o token na Cakto", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Cakto",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da Cakto", "Vá em Integrações → API", "Copie o token"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Cakto, acesse Integrações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Cakto → Integrações → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  kirvano: {
    label: "Kirvano",
    integrationType: "hybrid" as const,
    emoji: "🚀",
    country: "br",
    description: "Plataforma de checkout e vendas.",
    checklist: ["Pegue o token na Kirvano", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Kirvano",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da Kirvano", "Vá em Configurações → API", "Copie o token"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Kirvano, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Kirvano → Configurações → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  pagseguro: {
    label: "PagSeguro",
    integrationType: "hybrid" as const,
    emoji: "🟠",
    country: "br",
    description: "Gateway de pagamentos do PagBank.",
    checklist: ["Pegue o token no PagSeguro", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token do PagSeguro",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar o Token?",
          steps: ["Acesse o painel do PagSeguro/PagBank", "Vá em Integrações → API", "Copie o token"],
          link: { url: "https://pagseguro.uol.com.br", label: "Abrir PagSeguro" },
        },
      },
    ],
    generatedOutputs: [webhookOutput(["No PagSeguro, acesse Integrações → Notificações", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre no PagSeguro → Integrações → Notificações",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  pushinpay: {
    label: "PushinPay",
    integrationType: "hybrid" as const,
    emoji: "⚡",
    country: "br",
    description: "Gateway de pagamentos via Pix.",
    checklist: ["Pegue o token na PushinPay", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da PushinPay",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da PushinPay", "Vá em Configurações → API", "Copie o token"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na PushinPay, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na PushinPay → Configurações → Webhooks",
      "Salve a integração",
      "Teste com um pagamento Pix para validar",
    ],
  },

  perfectpay: {
    label: "Perfect Pay",
    integrationType: "hybrid" as const,
    emoji: "✅",
    country: "br",
    description: "Plataforma de checkout e pagamentos.",
    checklist: ["Pegue o token na Perfect Pay", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Perfect Pay",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da Perfect Pay", "Vá em Integrações → API", "Copie o token"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Perfect Pay, acesse Integrações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Perfect Pay → Integrações → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  greenn: {
    label: "Greenn",
    integrationType: "hybrid" as const,
    emoji: "🌿",
    country: "br",
    description: "Plataforma de vendas e checkout.",
    checklist: ["Pegue o token na Greenn", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Greenn",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da Greenn", "Vá em Configurações → API", "Copie o token"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Greenn, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Greenn → Configurações → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  ticto: {
    label: "Ticto",
    integrationType: "hybrid" as const,
    emoji: "🎪",
    country: "br",
    description: "Plataforma de checkout e vendas.",
    checklist: ["Pegue o token na Ticto", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Ticto",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da Ticto", "Vá em Configurações → API", "Copie o token"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Ticto, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Ticto → Configurações → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  yampi: {
    label: "Yampi Payments",
    integrationType: "hybrid" as const,
    emoji: "🛒",
    country: "br",
    description: "Plataforma de e-commerce e checkout.",
    checklist: ["Pegue o token na Yampi", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Token da API",
        placeholder: "Token da Yampi",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da Yampi", "Vá em Configurações → API", "Copie o token"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Yampi, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Yampi → Configurações → Webhooks",
      "Salve a integração",
      "Teste com um pedido para validar",
    ],
  },

  vindi: {
    label: "Vindi",
    integrationType: "hybrid" as const,
    emoji: "💜",
    country: "br",
    description: "Plataforma de pagamentos recorrentes.",
    checklist: ["Pegue a API Key na Vindi", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "API Key",
        placeholder: "Chave da Vindi",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar?",
          steps: ["Acesse o painel da Vindi", "Vá em Configurações → Chaves de API", "Copie a chave"],
          link: { url: "https://app.vindi.com.br", label: "Abrir Vindi" },
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Vindi, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Vindi → Configurações → Webhooks",
      "Salve a integração",
      "Teste com uma cobrança para validar",
    ],
  },

  iugu: {
    label: "Iugu",
    integrationType: "hybrid" as const,
    emoji: "🧾",
    country: "br",
    description: "Plataforma de pagamentos e cobranças.",
    checklist: ["Pegue o token na Iugu", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da Iugu",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar?",
          steps: ["Acesse o painel da Iugu", "Vá em Administração → Chaves de API", "Copie o token"],
          link: { url: "https://alia.iugu.com", label: "Abrir Iugu" },
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Iugu, acesse Configurações → Gatilhos / Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Iugu → Configurações → Gatilhos / Webhooks",
      "Salve a integração",
      "Teste com uma cobrança para validar",
    ],
  },

  efi: {
    label: "Gerencianet / Efí",
    integrationType: "hybrid" as const,
    emoji: "💎",
    country: "br",
    description: "Gateway de pagamentos Pix e boleto.",
    checklist: ["Pegue as credenciais na Efí", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "Client ID / Credencial",
        placeholder: "Credencial da Efí",
        type: "password",
        direction: "paste_here",
        required: true,
        help: {
          title: "Onde encontrar?",
          steps: ["Acesse o painel da Efí (Gerencianet)", "Vá em API → Minhas Aplicações", "Copie o Client ID"],
        },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Efí, acesse API → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Efí → API → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },

  abacatepay: {
    label: "AbacatePay",
    integrationType: "hybrid" as const,
    emoji: "🥑",
    country: "br",
    description: "Gateway de pagamentos Pix.",
    checklist: ["Pegue o token na AbacatePay", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da AbacatePay",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da AbacatePay", "Vá em Configurações → API", "Copie o token"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na AbacatePay, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na AbacatePay → Configurações → Webhooks",
      "Salve a integração",
      "Teste com um pagamento Pix para validar",
    ],
  },

  hubla: {
    label: "Hubla",
    integrationType: "hybrid" as const,
    emoji: "🔗",
    country: "br",
    description: "Plataforma de comunidades e pagamentos.",
    checklist: ["Pegue o token na Hubla", "Cole aqui", "Cadastre a URL de webhook"],
    fields: [
      {
        key: "credentials",
        label: "API Token",
        placeholder: "Token da Hubla",
        type: "password",
        direction: "paste_here",
        required: true,
        help: { title: "Onde encontrar?", steps: ["Acesse o painel da Hubla", "Vá em Configurações → Integrações", "Copie o token de API"] },
      },
    ],
    generatedOutputs: [webhookOutput(["Na Hubla, acesse Configurações → Webhooks", "Cadastre esta URL"])],
    nextSteps: [
      "Copie a URL de webhook gerada acima",
      "Cadastre na Hubla → Configurações → Webhooks",
      "Salve a integração",
      "Teste com uma transação para validar",
    ],
  },
};

/** Retorna providers por país */
export const getProvidersByCountry = (country: "br" | "int") =>
  Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.country === country)
    .map(([value, c]) => ({ value, ...c }));
