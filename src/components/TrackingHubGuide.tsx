import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Radio, Send, Code, FileText, Key, Globe, Zap, ShoppingCart,
  CheckCircle, ArrowRight, AlertCircle, BookOpen,
} from "lucide-react";

const steps = [
  {
    icon: Key,
    title: "1. Crie uma API Key",
    description:
      "Vá em API Keys no menu lateral e clique em \"Nova Chave\". Isso gera uma public_key (ex: pk_live_xxx) que será usada pelo SDK para autenticar os eventos enviados do seu site. Cada key está vinculada ao seu workspace.",
  },
  {
    icon: Radio,
    title: "2. Cadastre uma Tracking Source",
    description:
      "Em Tracking Sources, clique em \"Nova Source\" e preencha: nome (ex: \"Meu Site Principal\"), tipo (Website, Checkout, Landing Page, API ou Webhook) e domínio principal (ex: meusite.com.br). A source organiza de onde vêm seus eventos e vincula automaticamente a API Key ativa.",
  },
  {
    icon: Globe,
    title: "3. Configure domínios permitidos",
    description:
      "Para segurança, o sistema valida a origem dos eventos. Cadastre seus domínios em Pixels > Domínios Permitidos ou diretamente na Tracking Source. O endpoint /track verifica o header Origin/Referer contra essa lista. Suporte a wildcard (*.meusite.com.br).",
  },
  {
    icon: Code,
    title: "4. Instale o SDK no seu site",
    description:
      "Vá em SDK Setup, copie o snippet de instalação e cole antes do </head> do seu site. O SDK captura automaticamente: PageView, UTMs (utm_source, utm_medium, etc.), click IDs (fbclid, gclid, ttclid), cookies Meta (fbp/fbc), fingerprint, sessão e anonymous ID. Ative debug: true para ver um painel visual com os eventos em tempo real.",
  },
  {
    icon: Send,
    title: "5. Configure Destinations (destinos)",
    description:
      "Vá em Integrações e ative os destinos para onde seus eventos devem ser enviados: Meta Conversions API, GA4 Measurement Protocol, Google Ads ou TikTok Events API. Preencha as credenciais de cada plataforma (pixel ID, access token, measurement ID, etc.). Os destinos ativos aparecem na página Destinations.",
  },
  {
    icon: Zap,
    title: "6. O EventRouter faz o resto",
    description:
      "Quando um evento chega pelo SDK ou pela API server-to-server, o sistema automaticamente: valida a key e o domínio, resolve identidade e sessão, persiste o evento, e aciona o EventRouter que distribui para todos os destinos ativos do seu workspace. Tudo com logs detalhados, retries automáticos e deduplicação por event_id.",
  },
  {
    icon: FileText,
    title: "7. Monitore nos Logs",
    description:
      "Use Integration Logs para ver cada entrega: provider, status (delivered/failed), latência, request/response completo. Use Event Logs para ver todos os eventos recebidos. Use System Health para um diagnóstico completo do pipeline.",
  },
];

const faqs = [
  {
    q: "Qual a diferença entre Tracking Source e Destination?",
    a: "Tracking Source é de onde vêm os eventos (seu site, checkout, API). Destination é para onde eles vão (Meta, GA4, TikTok). O fluxo é: Source → CapiTrack → Destinations.",
  },
  {
    q: "Preciso instalar o SDK E configurar o server-side?",
    a: "Não necessariamente. O SDK sozinho já envia eventos via server-side para o endpoint /track. Se você quiser enviar eventos diretamente do seu backend (ex: pagamentos via webhook), use a API server-to-server com a mesma public_key no header X-Api-Key.",
  },
  {
    q: "Como funciona a deduplicação?",
    a: "Cada evento pode conter um event_id único. Se o mesmo event_id for enviado novamente para o mesmo workspace, o sistema retorna status 'deduplicated' sem processar duplicado. Isso evita contagem dobrada especialmente em cenários browser + server.",
  },
  {
    q: "O que acontece quando um destino falha?",
    a: "O EventRouter registra a falha em integration_logs com o erro completo. Eventos com falha parcial ficam com status 'partial'. O sistema de retries na fila (Queue) tenta reenviar automaticamente com backoff exponencial.",
  },
  {
    q: "Como funciona a resolução de identidade?",
    a: "Quando um evento chega com email, telefone, external_id ou fingerprint, o sistema busca uma identidade existente no workspace. Se encontra, reutiliza. Se não, cria uma nova. O identify() do SDK vincula dados de usuário à sessão para enriquecer todos os eventos subsequentes.",
  },
  {
    q: "Posso usar isso com gateways de pagamento?",
    a: "Sim! Webhooks de gateways (Stripe, Mercado Pago, Hotmart, etc.) chegam pelo módulo de Gateways, são normalizados em eventos internos e o EventRouter envia Purchase para Meta/GA4/TikTok automaticamente com reconciliação de sessão/identidade.",
  },
  {
    q: "O que é o modo debug do SDK?",
    a: "Ao inicializar com debug: true, o SDK exibe um painel flutuante no canto inferior do site mostrando cada evento enviado, status de entrega, IDs de sessão e erros em tempo real. Útil para validar a instalação. Você também pode ativar/desativar em runtime com capitrack('debug', true).",
  },
  {
    q: "Como configuro UTMs e click IDs?",
    a: "Não precisa configurar nada. O SDK captura automaticamente todos os UTMs (utm_source, utm_medium, utm_campaign, utm_content, utm_term) e click IDs (fbclid, gclid, ttclid) da URL. Eles são persistidos em cookie, localStorage e sessionStorage para sobreviver a navegações e reloads.",
  },
];

export function TrackingHubGuide({ variant = "full" }: { variant?: "full" | "compact" }) {
  if (variant === "compact") {
    return (
      <Card className="glass-card border-primary/20 bg-primary/[0.03]">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Como configurar?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                O fluxo básico é: <strong>API Key</strong> → <strong>Tracking Source</strong> → <strong>Instalar SDK</strong> → <strong>Configurar Destinations</strong>. 
                Veja o guia completo na seção abaixo ou acesse <strong>SDK Setup</strong> no menu.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Steps */}
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-5">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Guia de Configuração — Tracking Hub</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            O Tracking Hub do CapiTrack AI funciona como uma plataforma unificada de coleta e distribuição de eventos. 
            Ele combina pixel manager, Conversions API, server-side tracking, event router e attribution tracking em um único sistema. 
            Siga os passos abaixo para configurar tudo do zero.
          </p>

          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-4 group">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <step.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 bg-border/40 mt-2" />
                  )}
                </div>
                <div className="pb-5">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{step.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Flow diagram */}
      <Card className="glass-card">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Fluxo de Dados</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {[
              { label: "Usuário", sub: "navega no site" },
              { label: "SDK", sub: "captura evento" },
              { label: "/track", sub: "endpoint" },
              { label: "Normalização", sub: "sessão + identidade" },
              { label: "EventRouter", sub: "distribui" },
              { label: "Destinations", sub: "Meta / GA4 / TikTok" },
            ].map((item, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <div className="bg-muted/40 border border-border/30 rounded-lg px-3 py-2 text-center min-w-[90px]">
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                </div>
                {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Perguntas Frequentes</h3>
          </div>
          <Accordion type="multiple" className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-border/30">
                <AccordionTrigger className="text-xs font-medium text-foreground hover:text-primary py-3">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-3">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
