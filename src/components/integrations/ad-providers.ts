/**
 * AD_PROVIDERS — display metadata + form field schemas for conversion
 * destinations (Meta, Google Ads, TikTok, GA4, Firebase).
 * Centralized here so DestinationDialog and DestinationList share it.
 */
export interface ProviderField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  help?: string;
  helpLink?: { url: string; label: string };
}

export interface ProviderConfig {
  label: string;
  emoji: string;
  desc: string;
  fields: ProviderField[];
}

export const AD_PROVIDERS: Record<string, ProviderConfig> = {
  meta: {
    label: "Meta Ads", emoji: "📘", desc: "Conversions API (CAPI)",
    fields: [
      { key: "destination_id", label: "Pixel ID", placeholder: "123456789012345", help: "Meta Events Manager → Fontes de dados → Selecione o Pixel → O ID aparece no topo da página", helpLink: { url: "https://business.facebook.com/events_manager2", label: "Abrir Events Manager" } },
      { key: "access_token", label: "Access Token", placeholder: "EAAxxxxxxx...", secret: true, help: "Meta Events Manager → Configurações → Gerar Token de Acesso", helpLink: { url: "https://developers.facebook.com/tools/explorer/", label: "Abrir Graph API Explorer" } },
      { key: "test_event_code", label: "Test Event Code (opcional)", placeholder: "TEST12345", help: "Meta Events Manager → Testar Eventos → O código aparece no topo da aba de teste" },
    ],
  },
  google_ads: {
    label: "Google Ads", emoji: "🔍", desc: "Offline Conversions API",
    fields: [
      { key: "destination_id", label: "Conversion Action ID", placeholder: "123456789", help: "É o ID numérico da ação de conversão que você quer rastrear no Google Ads (ex: Compra, Lead).\n\nPasso a passo:\n1. Acesse ads.google.com e selecione a conta correta no canto superior direito.\n2. No menu esquerdo, clique em 'Metas' (ícone de alvo) → 'Conversões' → 'Resumo'.\n3. Se ainda não tiver uma conversão criada, clique em '+ Nova ação de conversão' → escolha 'Site' e configure (nome, valor, contagem).\n4. Clique no nome da conversão na lista — você será levado à página de detalhes.\n5. Olhe a URL do navegador: você verá algo como '...&ctId=123456789'. O número após 'ctId=' é o seu Conversion Action ID.\n6. Cole apenas os números aqui (sem letras nem traços).", helpLink: { url: "https://ads.google.com/aw/conversions", label: "Abrir Google Ads Conversões" } },
      { key: "access_token", label: "OAuth Access Token", placeholder: "ya29.xxxxxxx...", secret: true, help: "Token temporário (válido ~1h) que autoriza o CapiTrack a enviar conversões para sua conta Google Ads em seu nome.\n\nPasso a passo (via OAuth Playground — mais rápido para teste):\n1. Acesse developers.google.com/oauthplayground.\n2. Na lista da esquerda (Step 1), role até 'Google Ads API v15' (ou superior) e marque o escopo 'https://www.googleapis.com/auth/adwords'.\n3. Clique em 'Authorize APIs' (botão azul) e faça login com a conta Google que tem acesso ao Google Ads.\n4. Aceite as permissões solicitadas.\n5. Em 'Step 2', clique em 'Exchange authorization code for tokens'.\n6. Copie o valor do campo 'Access token' (começa com 'ya29.') e cole aqui.\n\n⚠️ Atenção: este token expira em 1 hora. Para produção, recomenda-se gerar um Refresh Token (procedimento avançado via Google Cloud Console).", helpLink: { url: "https://developers.google.com/oauthplayground/", label: "Abrir OAuth Playground" } },
      { key: "customer_id", label: "Customer ID", placeholder: "123-456-7890", help: "É o identificador único da sua conta Google Ads, no formato XXX-XXX-XXXX.\n\nPasso a passo:\n1. Acesse ads.google.com e faça login.\n2. Olhe no canto superior direito da tela — abaixo do nome da conta aparecerá o ID (ex: 909-234-6354).\n3. Copie e cole aqui exatamente como aparece, COM os traços (ex: 909-234-6354).\n\n⚠️ Importante: NÃO use o Customer ID da sua MCC (conta Manager) aqui. Use o ID da conta normal onde estão as campanhas e conversões. A MCC só é usada para gerar o Developer Token.", helpLink: { url: "https://ads.google.com", label: "Abrir Google Ads" } },
      { key: "developer_token", label: "Developer Token", placeholder: "xxxxxxxxxxxxxxxx", secret: true, help: "Token que autoriza sua aplicação a usar a Google Ads API. ⚠️ Só pode ser gerado em uma conta MCC (Manager Account).\n\nPré-requisito: você precisa ter uma conta MCC criada e a sua conta normal vinculada a ela. Se ainda não tem, veja 'Como funciona → Setup Google' no menu lateral.\n\nPasso a passo:\n1. Faça login em ads.google.com com a conta MCC (troque a conta pelo avatar no canto superior direito se necessário).\n2. No menu esquerdo, vá em 'Ferramentas' (ícone de chave inglesa) → seção 'Configuração' → 'Central de API'.\n   Atalho: ads.google.com/aw/apicenter\n3. Se aparecer 'disponível apenas para contas de administrador', você NÃO está logado na MCC. Troque a conta.\n4. Na Central de API, clique em 'Aplicar para acesso básico'.\n5. Preencha o formulário (nome da empresa, site, caso de uso = 'Conversion tracking').\n6. Após aprovado (geralmente 24-48h, às vezes instantâneo), o Developer Token aparece no topo da página.\n7. Copie e cole aqui.", helpLink: { url: "https://ads.google.com/aw/apicenter", label: "Abrir Centro de API" } },
    ],
  },
  tiktok: {
    label: "TikTok Ads", emoji: "🎵", desc: "Events API",
    fields: [
      { key: "destination_id", label: "Pixel Code", placeholder: "CXXXXXXXXXXXXXXXXX", help: "TikTok Ads Manager → Ativos → Eventos → Gerenciamento de Eventos Web → O código aparece no topo", helpLink: { url: "https://ads.tiktok.com/i18n/events_manager", label: "Abrir Events Manager" } },
      { key: "access_token", label: "Access Token", placeholder: "xxxxxxxxxxxxxxxx", secret: true, help: "TikTok for Business → Painel de Desenvolvedor → Meus Apps → Gerar Token", helpLink: { url: "https://business-api.tiktok.com/portal/apps", label: "Abrir Portal de Apps" } },
      { key: "test_event_code", label: "Test Event Code (opcional)", placeholder: "TEST12345", help: "TikTok Events Manager → Testar Eventos → O código é gerado automaticamente" },
    ],
  },
  ga4: {
    label: "Google Analytics 4", emoji: "📊", desc: "Measurement Protocol",
    fields: [
      { key: "destination_id", label: "Measurement ID", placeholder: "G-XXXXXXXXXX", help: "Google Analytics → Administração → Fluxos de dados → O ID de medição (G-XXXXXXX) aparece no topo", helpLink: { url: "https://analytics.google.com/analytics/web/#/admin", label: "Abrir GA4 Admin" } },
      { key: "access_token", label: "API Secret", placeholder: "xxxxxxxxxxxxxxxx", secret: true, help: "GA4 → Administração → Fluxos de dados → Segredos da API do Measurement Protocol → Criar", helpLink: { url: "https://analytics.google.com/analytics/web/#/admin", label: "Abrir GA4 Admin" } },
    ],
  },
  firebase: {
    label: "Firebase Analytics", emoji: "🔥", desc: "Firebase SDK + Measurement Protocol",
    fields: [
      { key: "destination_id", label: "Measurement ID", placeholder: "G-XXXXXXXXXX", help: "Firebase Console → Configurações do projeto → Integrações → Google Analytics → O Measurement ID (G-XXXXXXX)", helpLink: { url: "https://console.firebase.google.com/", label: "Abrir Firebase Console" } },
      { key: "access_token", label: "API Secret (Measurement Protocol)", placeholder: "xxxxxxxxxxxxxxxx", secret: true, help: "GA4 → Administração → Fluxos de dados → Segredos da API do Measurement Protocol → Criar", helpLink: { url: "https://analytics.google.com/analytics/web/#/admin", label: "Abrir GA4 Admin" } },
      { key: "api_key", label: "Firebase API Key (público)", placeholder: "AIzaSy...", help: "Firebase Console → Configurações do projeto → Geral → Configuração do SDK → apiKey" },
      { key: "app_id", label: "Firebase App ID", placeholder: "1:123456789:web:abc123", help: "Firebase Console → Configurações do projeto → Geral → Seus apps → App ID" },
      { key: "project_id", label: "Firebase Project ID", placeholder: "meu-projeto-firebase", help: "Firebase Console → Configurações do projeto → Geral → ID do projeto" },
    ],
  },
};
