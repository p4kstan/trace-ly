import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Server, Globe, Send, Code, Shield,
  ArrowRight, ArrowLeft, CheckCircle, ChevronDown, ChevronUp,
  Zap, ExternalLink, Radio, Key, FileText,
  Monitor, Cloud, Database, Workflow,
} from "lucide-react";

const PILLARS = [
  {
    id: "server",
    icon: Server,
    title: "1. Servidor (Backend)",
    subtitle: "Quem recebe os eventos",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    summary: "Você precisa de um servidor que receba os eventos enviados pelo seu site. É ele que processa, valida e distribui tudo.",
    explanation: [
      "Quando um usuário faz uma ação no seu site (compra, cadastro, clique), essa informação precisa ir para algum lugar. O navegador sozinho não consegue enviar para Meta, Google, TikTok de forma confiável — bloqueadores de anúncios, ITP do Safari e restrições de cookies impedem isso.",
      "A solução é ter um servidor intermediário. O site envia para o SEU servidor, e ele repassa para as plataformas de anúncio. Isso é o que chamam de 'Server-Side Tracking'.",
      "Opções comuns: VPS, Cloudflare Workers, Vercel, ou Supabase Edge Functions. O CapiTrack AI já usa Supabase Edge Functions como backend — você não precisa configurar nenhum servidor.",
    ],
    referenceLinks: [
      { label: "DigitalOcean", url: "https://www.digitalocean.com" },
      { label: "AWS", url: "https://aws.amazon.com" },
      { label: "Google Cloud", url: "https://cloud.google.com" },
      { label: "Cloudflare Workers", url: "https://workers.cloudflare.com" },
      { label: "Vercel", url: "https://vercel.com" },
      { label: "Supabase Edge Functions", url: "https://supabase.com/edge-functions" },
    ],
    whatCapitrackDoes: "O CapiTrack AI já possui um servidor pronto (Edge Functions) que recebe, processa e distribui seus eventos automaticamente. Zero configuração de infraestrutura.",
    status: "configured",
    actionLabel: "Ver System Health",
    actionRoute: "/system-diagnostic",
  },
  {
    id: "endpoint",
    icon: Radio,
    title: "2. Endpoint de Coleta",
    subtitle: "Para onde o site envia os dados",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    summary: "Um endpoint é uma URL que recebe os eventos. Tipo: https://tracking.seudominio.com/collect",
    explanation: [
      "O endpoint de coleta é a 'porta de entrada' dos seus eventos. É uma URL que aceita requisições POST com dados como: nome do evento, valor, e-mail do usuário, UTMs, etc.",
      "Exemplo de payload que chega no endpoint:",
      '{\n  "event": "purchase",\n  "value": 297,\n  "email": "user@email.com",\n  "utm_source": "facebook",\n  "utm_campaign": "black_friday"\n}',
      "O endpoint precisa: validar a API Key, verificar o domínio de origem, resolver a identidade do usuário (via email/telefone/fingerprint), salvar o evento no banco e acionar o roteamento para as plataformas.",
      "No CapiTrack, o endpoint é: /functions/v1/track — ele faz tudo isso automaticamente, incluindo deduplicação por event_id para evitar contagem duplicada.",
    ],
    referenceLinks: [],
    whatCapitrackDoes: "Seu endpoint já está ativo em /functions/v1/track. Ele valida keys, resolve identidade, persiste eventos e aciona o EventRouter — tudo automático.",
    status: "configured",
    actionLabel: "Criar API Key",
    actionRoute: "/api-keys",
  },
  {
    id: "destinations",
    icon: Send,
    title: "3. Envio para Plataformas (CAPI)",
    subtitle: "Meta, Google, TikTok recebem seus eventos",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    summary: "Depois de receber o evento, seu servidor precisa repassar para Meta Conversions API, GA4, TikTok Events API, etc.",
    explanation: [
      "Cada plataforma de anúncio tem sua própria API para receber eventos server-side:",
      "• Meta Conversions API (CAPI) — Envia Purchase, Lead, AddToCart, etc. Precisa de: Pixel ID e Access Token. Suporta batching de até 1000 eventos por request.",
      "• Google Analytics 4 (GA4) — Measurement Protocol. Envia eventos para o GA4. Precisa de: Measurement ID e API Secret.",
      "• TikTok Events API — Similar à Meta CAPI. Precisa de: Pixel Code e Access Token.",
      "• Google Ads — Enhanced Conversions API para otimização de campanhas.",
      "O grande desafio é manter cada integração atualizada (APIs mudam), tratar erros, implementar retries com backoff exponencial e garantir que nenhum evento se perca.",
      "O CapiTrack faz isso via EventRouter: quando um evento chega, ele automaticamente distribui para TODOS os destinos ativos do seu workspace, com retries automáticos e logs detalhados.",
    ],
    whatCapitrackDoes: "O EventRouter distribui automaticamente para todos os destinos configurados. Suporta Meta CAPI (batch), GA4, TikTok e Google Ads com retries e logs completos.",
    status: "action_needed",
    actionLabel: "Configurar Destinos",
    actionRoute: "/integrations",
  },
  {
    id: "domain",
    icon: Globe,
    title: "4. Domínio Próprio",
    subtitle: "Mais confiança e menos bloqueios",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    summary: "Usar tracking.seudominio.com ao invés de domínios terceiros melhora a precisão e evita bloqueios.",
    explanation: [
      "Bloqueadores de anúncios funcionam com listas de domínios conhecidos. Se seu tracking usa um domínio terceiro (como connect.facebook.net), ele é bloqueado facilmente.",
      "Com domínio próprio (tracking.seudominio.com), o navegador trata como first-party — cookies duram mais, bloqueadores não interferem e a taxa de match de identidade sobe significativamente.",
      "Como configurar:",
      "1. Adicione um subdomínio DNS (ex: tracking.seudominio.com) apontando para seu servidor",
      "2. Configure SSL (HTTPS é obrigatório)",
      "3. Cadastre os domínios permitidos no CapiTrack para validação de segurança (Origin/Referer)",
      "O CapiTrack valida o header Origin/Referer de cada evento contra a lista de domínios permitidos do workspace. Suporta wildcards (*.seudominio.com).",
    ],
    whatCapitrackDoes: "Cadastre seus domínios em Tracking Sources. O sistema valida automaticamente a origem dos eventos para segurança. Suporte a wildcards.",
    status: "action_needed",
    actionLabel: "Cadastrar Domínio",
    actionRoute: "/tracking-sources",
  },
  {
    id: "script",
    icon: Code,
    title: "5. Script no Site (SDK)",
    subtitle: "Captura eventos do navegador",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
    summary: "Um script JavaScript no seu site captura ações do usuário e envia para o seu endpoint.",
    explanation: [
      "O SDK é um script leve (~5KB) que você cola no HTML do seu site. Ele captura automaticamente:",
      "• PageView — cada página visitada\n• UTMs — utm_source, utm_medium, utm_campaign, utm_content, utm_term\n• Click IDs — fbclid (Meta), gclid (Google), ttclid (TikTok)\n• Cookies Meta — _fbp e _fbc para melhorar o match rate\n• Fingerprint — identificação anônima do navegador\n• Sessão — gerenciamento automático com timeout de 30min",
      "Além da captura automática, você pode rastrear eventos customizados:",
      'capitrack("track", "Purchase", {\n  value: 297.00,\n  currency: "BRL",\n  email: "cliente@email.com"\n});',
      'Ou identificar o usuário:\n\ncapitrack("identify", {\n  email: "cliente@email.com",\n  phone: "5511999999999"\n});',
      "O SDK envia tudo via POST para o endpoint /track com a API Key configurada. Funciona com qualquer site: WordPress, Shopify, HTML, React, etc.",
    ],
    whatCapitrackDoes: "SDK v3 pronto para copiar e colar. Captura automática de PageView, UTMs, click IDs, cookies, fingerprint e sessões. Modo debug visual incluso.",
    status: "action_needed",
    actionLabel: "Copiar SDK",
    actionRoute: "/sdk-setup",
  },
];

function PillarCard({
  pillar,
  index,
  isActive,
  isCompleted,
  onSelect,
}: {
  pillar: typeof PILLARS[0];
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  onSelect: () => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className={`glass-card transition-all duration-300 cursor-pointer ${
        isActive ? `ring-1 ${pillar.borderColor} ${pillar.bgColor}` : "hover:border-border/50"
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center gap-4 p-4">
          <div className={`w-12 h-12 rounded-xl ${pillar.bgColor} flex items-center justify-center shrink-0`}>
            <pillar.icon className={`w-6 h-6 ${pillar.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{pillar.title}</h3>
              {pillar.status === "configured" && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                  <CheckCircle className="w-3 h-3 mr-1" /> Pronto
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{pillar.subtitle}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Summary always visible */}
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{pillar.summary}</p>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-border/30 px-4 py-4 space-y-4 animate-fade-in">
            {/* Detailed explanation */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" /> Explicação Detalhada
              </h4>
              {pillar.explanation.map((text, i) => (
                <div key={i}>
                  {text.includes("{") || text.includes("capitrack(") ? (
                    <pre className="bg-muted/30 border border-border/30 rounded-lg p-3 text-[11px] font-mono text-foreground overflow-x-auto leading-relaxed">
                      {text}
                    </pre>
                  ) : text.startsWith("•") ? (
                    <p className="text-xs text-muted-foreground leading-relaxed pl-2">{text}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                  )}
                </div>
              ))}
            </div>

            {/* What CapiTrack does */}
            <div className={`${pillar.bgColor} border ${pillar.borderColor} rounded-lg p-3`}>
              <div className="flex items-start gap-2">
                <Zap className={`w-4 h-4 ${pillar.color} mt-0.5 shrink-0`} />
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">O que o CapiTrack AI já faz por você:</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{pillar.whatCapitrackDoes}</p>
                </div>
              </div>
            </div>

            {/* Action button */}
            <Button
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={(e) => { e.stopPropagation(); navigate(pillar.actionRoute); }}
            >
              {pillar.actionLabel} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function HowItWorks() {
  const navigate = useNavigate();
  const [activePillar, setActivePillar] = useState<number | null>(null);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">Como Funciona</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Entenda os 5 pilares do tracking server-side e como o CapiTrack já resolve cada um
        </p>
      </div>

      {/* Architecture overview */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-primary" /> Arquitetura — Visão Geral
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            {[
              { icon: Monitor, label: "Seu Site", sub: "SDK captura eventos" },
              { icon: Cloud, label: "Seu Servidor", sub: "CapiTrack (Edge Functions)" },
              { icon: Database, label: "Banco de Dados", sub: "Eventos persistidos" },
              { icon: Send, label: "Plataformas", sub: "Meta / GA4 / TikTok" },
            ].map((item, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <div className="bg-muted/40 border border-border/30 rounded-lg px-4 py-3 text-center min-w-[100px]">
                  <item.icon className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                </div>
                {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
            Isso é exatamente o que plataformas como Stape fazem — mas aqui você tem <strong className="text-foreground">controle total</strong>, sem mensalidade extra e com multi-plataforma nativo.
          </p>
        </CardContent>
      </Card>

      {/* 5 Pillars */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> Os 5 Pilares — Clique para expandir
        </h2>
        {PILLARS.map((pillar, i) => (
          <PillarCard
            key={pillar.id}
            pillar={pillar}
            index={i}
            isActive={activePillar === i}
            isCompleted={pillar.status === "configured"}
            onSelect={() => setActivePillar(activePillar === i ? null : i)}
          />
        ))}
      </div>

      {/* Quick start CTA */}
      <Card className="glass-card border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">Pronto para começar?</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Siga o guia interativo passo-a-passo e configure tudo em minutos.
              </p>
            </div>
            <Button size="sm" className="gap-2 shrink-0" onClick={() => navigate("/tracking-guide")}>
              Iniciar Setup <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
