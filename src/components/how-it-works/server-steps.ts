import type { WizardStep } from "./PlatformWizard";

export interface ServerProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  steps: WizardStep[];
}

export const SERVER_PROVIDERS: ServerProvider[] = [
  {
    id: "supabase-edge",
    name: "Supabase Edge Functions",
    icon: "⚡",
    description: "Já integrado ao CapiTrack — mais rápido de configurar",
    steps: [
      {
        title: "Configurar Supabase Edge Functions",
        subtitle: "Servidor serverless já integrado ao CapiTrack",
        explanation: [
          "O CapiTrack já utiliza Supabase Edge Functions como backend. Isso significa que seu servidor de rastreamento já está ativo!",
          "**Vantagens:**",
          "- ✅ Já configurado automaticamente",
          "- ✅ Sem custo adicional de infra",
          "- ✅ Deploy automático",
          "- ✅ Escalável globalmente via Deno Deploy",
          "**O que você precisa verificar:**",
          "- Que seu projeto CapiTrack está ativo",
          "- Que as Edge Functions estão deployed",
          "- O endpoint de coleta já está disponível em:",
        ],
        copySnippet: "https://xpgsipmyrwyjerjvbhmb.supabase.co/functions/v1/track",
        tip: "Esta é a opção recomendada. Zero configuração extra necessária.",
        referenceLinks: [
          { label: "Supabase Edge Functions", url: "https://supabase.com/docs/guides/functions" },
          { label: "Deno Deploy", url: "https://deno.com/deploy" },
        ],
        actionLabel: "Ver System Diagnostic",
        actionRoute: "/system-diagnostic",
      },
    ],
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers",
    icon: "☁️",
    description: "Baixa latência global, free tier generoso (100k req/dia)",
    steps: [
      {
        title: "Criar conta na Cloudflare",
        subtitle: "Plataforma serverless com edge computing global",
        explanation: [
          "O Cloudflare Workers permite rodar código na edge em +300 locais globais, com latência mínima.",
          "**Como criar:**",
          "- Acesse dash.cloudflare.com e crie uma conta",
          "- Vá em Workers & Pages → Create Application → Create Worker",
          "- Dê um nome ao Worker (ex: 'tracking-server')",
          "**Free tier:**",
          "- 100.000 requests/dia",
          "- 10ms CPU time por request",
          "- Sem cold start",
        ],
        inputs: [
          {
            id: "cf_account_id",
            label: "Account ID",
            placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            helpText: "Encontrado em dash.cloudflare.com → canto direito da página Overview",
            validation: /^[a-f0-9]{32}$/,
            validationMessage: "O Account ID deve ter 32 caracteres hexadecimais",
          },
        ],
        tip: "O Cloudflare Workers é a melhor opção custo-benefício para tráfego alto. Sem cold starts!",
        referenceLinks: [
          { label: "Cloudflare Dashboard", url: "https://dash.cloudflare.com" },
          { label: "Doc: Workers Get Started", url: "https://developers.cloudflare.com/workers/get-started/guide/" },
          { label: "Pricing", url: "https://developers.cloudflare.com/workers/platform/pricing/" },
        ],
      },
      {
        title: "Deploy do Worker de Tracking",
        subtitle: "Configure o endpoint de coleta de eventos",
        explanation: [
          "Crie o Worker que vai receber e processar os eventos de rastreamento.",
          "**Usando Wrangler (CLI):**",
          "```bash\nnpm install -g wrangler\nwrangler login\nwrangler init tracking-server\n```",
          "**Configurar o endpoint /collect:**",
          "O Worker deve aceitar POST requests com o payload dos eventos e encaminhar para as plataformas (Meta CAPI, GA4, etc).",
        ],
        inputs: [
          {
            id: "cf_worker_url",
            label: "URL do Worker",
            placeholder: "https://tracking-server.seu-user.workers.dev",
            helpText: "URL gerada após o deploy do Worker",
            validation: /^https:\/\/.+\.workers\.dev/,
            validationMessage: "A URL deve seguir o formato https://nome.user.workers.dev",
          },
        ],
        copySnippet: `export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const body = await request.json();
      // Processar evento e encaminhar para Meta/GA4
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("Tracking Server OK");
  }
};`,
        tip: "Use wrangler tail para debug em tempo real dos requests recebidos.",
        referenceLinks: [
          { label: "Doc: Wrangler CLI", url: "https://developers.cloudflare.com/workers/wrangler/" },
          { label: "Doc: Fetch Handler", url: "https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/" },
        ],
      },
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    icon: "▲",
    description: "Ideal para quem já usa Next.js ou frameworks JS",
    steps: [
      {
        title: "Criar projeto na Vercel",
        subtitle: "Deploy serverless com API Routes",
        explanation: [
          "A Vercel permite criar API Routes serverless que funcionam como endpoint de rastreamento.",
          "**Como criar:**",
          "- Acesse vercel.com e faça login",
          "- Clique em 'Add New' → Project",
          "- Importe do GitHub ou crie um novo projeto",
          "**Estrutura do endpoint:**",
          "- Crie o arquivo api/collect.ts no seu projeto",
          "- Ele será acessível em https://seu-projeto.vercel.app/api/collect",
        ],
        inputs: [
          {
            id: "vercel_project_name",
            label: "Nome do projeto Vercel",
            placeholder: "meu-tracking-server",
            helpText: "Nome do seu projeto na Vercel",
            validation: /^[a-z0-9-]{3,}$/,
            validationMessage: "Use apenas letras minúsculas, números e hífens (mín. 3 chars)",
          },
        ],
        tip: "A Vercel tem um free tier generoso com 100GB de bandwidth/mês.",
        referenceLinks: [
          { label: "Vercel Dashboard", url: "https://vercel.com/dashboard" },
          { label: "Doc: Serverless Functions", url: "https://vercel.com/docs/functions/serverless-functions" },
          { label: "Pricing", url: "https://vercel.com/pricing" },
        ],
      },
      {
        title: "Criar API Route de Coleta",
        subtitle: "Endpoint que recebe e processa eventos",
        explanation: [
          "Crie o arquivo api/collect.ts para receber eventos via POST.",
          "**Estrutura recomendada:**",
        ],
        inputs: [
          {
            id: "vercel_deploy_url",
            label: "URL do deploy",
            placeholder: "https://meu-tracking.vercel.app",
            helpText: "URL do seu projeto após o deploy",
            validation: /^https:\/\/.+\.vercel\.app/,
            validationMessage: "A URL deve seguir o formato https://nome.vercel.app",
          },
        ],
        copySnippet: `// api/collect.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const event = req.body;
  // Encaminhar para Meta CAPI / GA4
  res.status(200).json({ ok: true, event_id: event.event_id });
}`,
        referenceLinks: [
          { label: "Doc: API Routes", url: "https://vercel.com/docs/functions/serverless-functions" },
          { label: "Doc: Environment Variables", url: "https://vercel.com/docs/projects/environment-variables" },
        ],
      },
    ],
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    icon: "🌊",
    description: "VPS simples e confiável, a partir de $4/mês",
    steps: [
      {
        title: "Criar Droplet na DigitalOcean",
        subtitle: "Servidor VPS para rodar seu tracking server",
        explanation: [
          "Um Droplet é uma máquina virtual que roda 24/7, ideal para controle total.",
          "**Como criar:**",
          "- Acesse cloud.digitalocean.com",
          "- Clique em 'Create' → Droplets",
          "- Escolha: Ubuntu 22.04 LTS",
          "- Plano: Basic → $6/mês (1GB RAM, 1 vCPU) é suficiente",
          "- Datacenter: Escolha o mais próximo dos seus usuários",
          "- Autenticação: SSH Key (recomendado) ou Password",
        ],
        inputs: [
          {
            id: "do_droplet_ip",
            label: "IP do Droplet",
            placeholder: "143.198.xxx.xxx",
            helpText: "IP público do Droplet criado",
            validation: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
            validationMessage: "Informe um endereço IP válido",
          },
        ],
        tip: "Use o App Platform da DigitalOcean para deploy automático via GitHub, sem gerenciar servidor.",
        referenceLinks: [
          { label: "DigitalOcean Console", url: "https://cloud.digitalocean.com" },
          { label: "Doc: Create Droplet", url: "https://docs.digitalocean.com/products/droplets/how-to/create/" },
          { label: "App Platform", url: "https://www.digitalocean.com/products/app-platform" },
          { label: "Pricing", url: "https://www.digitalocean.com/pricing/droplets" },
        ],
      },
      {
        title: "Instalar Node.js e configurar servidor",
        subtitle: "Setup do tracking server no Droplet",
        explanation: [
          "Configure o servidor com Node.js + Express/Fastify para receber eventos.",
          "**Comandos no servidor (via SSH):**",
          "```bash\nssh root@SEU_IP\ncurl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\nsudo apt-get install -y nodejs\nmkdir tracking-server && cd tracking-server\nnpm init -y\nnpm install express cors dotenv\n```",
        ],
        inputs: [
          {
            id: "do_domain",
            label: "Domínio do tracking server",
            placeholder: "tracking.seusite.com.br",
            helpText: "Subdomínio apontando para o IP do Droplet",
            validation: /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            validationMessage: "Informe um domínio válido",
          },
        ],
        copySnippet: `const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

app.post("/collect", async (req, res) => {
  const event = req.body;
  console.log("Evento recebido:", event.event_name);
  // Encaminhar para Meta CAPI / GA4
  res.json({ ok: true });
});

app.listen(3000, () => console.log("Tracking server rodando na porta 3000"));`,
        tip: "Use PM2 para manter o servidor rodando: npm install -g pm2 && pm2 start server.js",
        referenceLinks: [
          { label: "Node.js Downloads", url: "https://nodejs.org" },
          { label: "PM2 Process Manager", url: "https://pm2.keymetrics.io" },
          { label: "Let's Encrypt (SSL)", url: "https://letsencrypt.org/getting-started/" },
          { label: "Nginx Reverse Proxy", url: "https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/" },
        ],
      },
    ],
  },
  {
    id: "aws",
    name: "AWS Lambda",
    icon: "🟠",
    description: "Escalável, pay-per-use, integração com toda a AWS",
    steps: [
      {
        title: "Criar Lambda Function na AWS",
        subtitle: "Função serverless para processar eventos",
        explanation: [
          "AWS Lambda permite rodar código sem gerenciar servidores, com escalabilidade automática.",
          "**Como criar:**",
          "- Acesse console.aws.amazon.com → Lambda",
          "- Clique em 'Create function' → Author from scratch",
          "- Runtime: Node.js 20.x",
          "- Architecture: arm64 (mais barato)",
          "**Adicione um API Gateway:**",
          "- Em 'Add trigger' → API Gateway",
          "- Tipo: HTTP API (mais simples e barato)",
          "- Security: Open (vamos autenticar via API Key)",
        ],
        inputs: [
          {
            id: "aws_region",
            label: "Região AWS",
            placeholder: "us-east-1",
            helpText: "Região onde a Lambda será criada (ex: us-east-1, sa-east-1 para São Paulo)",
            validation: /^[a-z]{2}-[a-z]+-\d$/,
            validationMessage: "Use o formato de região AWS (ex: us-east-1)",
          },
          {
            id: "aws_api_gateway_url",
            label: "URL do API Gateway",
            placeholder: "https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com",
            helpText: "URL gerada após criar o API Gateway trigger",
            validation: /^https:\/\/.+\.execute-api\..+\.amazonaws\.com/,
            validationMessage: "A URL deve ser um endpoint válido do API Gateway",
          },
        ],
        tip: "O free tier da AWS Lambda inclui 1 milhão de requests/mês grátis — suficiente para maioria dos sites.",
        referenceLinks: [
          { label: "AWS Console", url: "https://console.aws.amazon.com/lambda" },
          { label: "Doc: Create Lambda", url: "https://docs.aws.amazon.com/lambda/latest/dg/getting-started.html" },
          { label: "Doc: API Gateway", url: "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html" },
          { label: "Pricing", url: "https://aws.amazon.com/lambda/pricing/" },
        ],
      },
    ],
  },
  {
    id: "google-cloud",
    name: "Google Cloud Functions",
    icon: "🔵",
    description: "Integração nativa com GA4 e Google Ads",
    steps: [
      {
        title: "Criar Cloud Function no GCP",
        subtitle: "Função serverless integrada ao ecossistema Google",
        explanation: [
          "Google Cloud Functions é ideal se você já usa GA4 / Google Ads — mesma infraestrutura, menos latência.",
          "**Como criar:**",
          "- Acesse console.cloud.google.com → Cloud Functions",
          "- Clique em 'Create Function'",
          "- Tipo: HTTP trigger",
          "- Runtime: Node.js 20",
          "- Region: us-central1 (ou southamerica-east1 para São Paulo)",
          "**Configurar permissões:**",
          "- Allow unauthenticated invocations (para receber webhooks)",
        ],
        inputs: [
          {
            id: "gcp_project_id",
            label: "GCP Project ID",
            placeholder: "meu-projeto-tracking",
            helpText: "ID do projeto no Google Cloud Console",
            validation: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
            validationMessage: "O Project ID deve ter 6-30 caracteres, começar com letra",
          },
          {
            id: "gcp_function_url",
            label: "URL da Cloud Function",
            placeholder: "https://us-central1-projeto.cloudfunctions.net/tracking",
            helpText: "URL gerada após o deploy da function",
            validation: /^https:\/\/.+\.cloudfunctions\.net\/.+/,
            validationMessage: "A URL deve ser um endpoint válido do Cloud Functions",
          },
        ],
        tip: "Se você usa GA4, essa é a opção com menor latência para enviar eventos via Measurement Protocol.",
        referenceLinks: [
          { label: "GCP Console", url: "https://console.cloud.google.com/functions" },
          { label: "Doc: Cloud Functions", url: "https://cloud.google.com/functions/docs/quickstart" },
          { label: "Pricing", url: "https://cloud.google.com/functions/pricing" },
        ],
      },
    ],
  },
];
