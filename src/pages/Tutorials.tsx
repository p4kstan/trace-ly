import { useState, useMemo } from "react";
import { Search, Copy, Check, ChevronRight, ExternalLink, BookOpen, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useWorkspace, useApiKeys } from "@/hooks/use-tracking-data";
import { cn } from "@/lib/utils";

/* ─── types ─── */
interface Guide {
  id: string;
  title: string;
  icon: string;
  category: "tracking" | "pixel" | "gateway";
  sections: Section[];
}
interface Section {
  title: string;
  steps?: Step[];
  snippet?: string;
  cards?: CardInfo[];
  fields?: FieldInfo[];
  note?: string;
}
interface Step { text: string; }
interface CardInfo { title: string; steps: string[]; }
interface FieldInfo { label: string; tip: string; }

/* ─── data ─── */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const WEBHOOK_ENDPOINT = `${SUPABASE_URL}/functions/v1/gateway-webhook`;

function buildGuides(apiKey: string): Guide[] {
  const snippet = `<script>
  (function(){
    var ct=window.capitrack=function(){ct.q.push(arguments)};ct.q=[];
    ct("init","${apiKey || "SUA_API_KEY"}",{endpoint:"${SUPABASE_URL}/functions/v1/track"});
    ct("page");
    var s=document.createElement("script");
    s.src="${window.location.origin}/sdk.js";
    s.async=true;
    document.head.appendChild(s);
  })();
</script>`;

  return [
    {
      id: "sdk",
      title: "SDK / Instalação",
      icon: "🔧",
      category: "tracking",
      sections: [
        {
          title: "Instalar o Tracking no seu site",
          note: "Esse código instala o rastreamento no seu site. Cole antes do </head>.",
          snippet,
        },
        {
          title: "Onde instalar",
          cards: [
            { title: "WordPress", steps: ["Acesse Aparência → Editor de Temas", "Abra header.php", "Cole o snippet antes do </head>", "Salve"] },
            { title: "Shopify", steps: ["Configurações → Checkout", "Seção Scripts adicionais", "Cole o snippet", "Salve"] },
            { title: "HTML Puro", steps: ["Abra o arquivo index.html", "Cole o snippet antes do </head>", "Faça deploy"] },
          ],
        },
      ],
    },
    {
      id: "api-keys",
      title: "API Keys",
      icon: "🔑",
      category: "tracking",
      sections: [
        {
          title: "Gerar sua API Key",
          steps: [
            { text: "Acesse API Keys no menu lateral" },
            { text: "Clique em Gerar Nova Chave" },
            { text: "Copie a chave pública gerada" },
            { text: "Use a chave no snippet de instalação" },
          ],
          note: "A chave pública é usada no SDK do cliente. Nunca compartilhe a chave secreta.",
        },
      ],
    },
    {
      id: "meta-pixel",
      title: "Meta Pixel",
      icon: "📊",
      category: "pixel",
      sections: [
        {
          title: "Campos necessários",
          fields: [
            { label: "Pixel ID", tip: "Identificador único do seu pixel Meta (ex: 123456789012345)" },
            { label: "Access Token", tip: "Token da Conversions API para envio server-side" },
            { label: "Test Event Code", tip: "Código para testar eventos sem afetar dados reais" },
            { label: "Domínio", tip: "Domínio autorizado a enviar eventos (ex: meusite.com.br)" },
          ],
        },
        {
          title: "Onde pegar o Pixel ID",
          steps: [
            { text: "Acesse o Meta Business Manager" },
            { text: "Vá em Events Manager" },
            { text: "Selecione seu Pixel" },
            { text: "Copie o Pixel ID no topo da página" },
          ],
        },
        {
          title: "Onde pegar o Access Token",
          steps: [
            { text: "No Events Manager, clique em Settings" },
            { text: "Role até Conversions API" },
            { text: "Clique em Generate Access Token" },
            { text: "Copie e guarde o token com segurança" },
          ],
          note: "O token só é exibido uma vez. Salve-o imediatamente.",
        },
        {
          title: "Testar eventos",
          steps: [
            { text: "No Events Manager, vá em Test Events" },
            { text: "Copie o Test Event Code exibido" },
            { text: "Cole no campo correspondente do CapiTrack" },
            { text: "Envie um evento de teste pelo seu site" },
          ],
        },
      ],
    },
    {
      id: "stripe",
      title: "Stripe",
      icon: "💳",
      category: "gateway",
      sections: [
        {
          title: "Campos necessários",
          fields: [
            { label: "API Key (sk_live_ ou sk_test_)", tip: "Chave secreta do Stripe para autenticação" },
            { label: "Webhook Secret (whsec_)", tip: "Segredo para validar assinaturas de webhook" },
          ],
        },
        {
          title: "Onde pegar a API Key",
          steps: [
            { text: "Acesse o Dashboard do Stripe" },
            { text: "Vá em Developers → API Keys" },
            { text: "Copie a Secret Key (sk_live_ ou sk_test_)" },
          ],
        },
        {
          title: "Configurar Webhook",
          steps: [
            { text: "No Stripe Dashboard, vá em Developers → Webhooks" },
            { text: "Clique em Add Endpoint" },
            { text: "Cole o endpoint abaixo" },
            { text: "Selecione os eventos: checkout.session.completed, payment_intent.succeeded" },
            { text: "Copie o Webhook Signing Secret (whsec_...)" },
          ],
          snippet: WEBHOOK_ENDPOINT,
          note: "Use o modo Test para validar antes de ir para produção.",
        },
      ],
    },
    {
      id: "hotmart",
      title: "Hotmart",
      icon: "🔥",
      category: "gateway",
      sections: [
        {
          title: "Configurar Webhook Hotmart",
          steps: [
            { text: "Acesse o painel da Hotmart" },
            { text: "Vá em Ferramentas → Webhooks" },
            { text: "Clique em Criar Webhook" },
            { text: "Cole o endpoint abaixo" },
            { text: "Selecione os eventos desejados (ex: PURCHASE_COMPLETE)" },
          ],
          snippet: WEBHOOK_ENDPOINT,
        },
      ],
    },
    {
      id: "shopify",
      title: "Shopify",
      icon: "🛒",
      category: "gateway",
      sections: [
        {
          title: "Configurar Webhook Shopify",
          steps: [
            { text: "No admin Shopify, vá em Settings → Notifications" },
            { text: "Role até Webhooks" },
            { text: "Clique em Create Webhook" },
            { text: "Selecione o evento (ex: Order payment)" },
            { text: "Cole o endpoint abaixo" },
            { text: "Formato: JSON" },
          ],
          snippet: WEBHOOK_ENDPOINT,
        },
      ],
    },
    {
      id: "mercadopago",
      title: "Mercado Pago",
      icon: "💰",
      category: "gateway",
      sections: [
        {
          title: "Campos necessários",
          fields: [
            { label: "Access Token", tip: "Token de acesso da sua conta Mercado Pago" },
          ],
        },
        {
          title: "Configurar Webhook",
          steps: [
            { text: "Acesse Mercado Pago Developers" },
            { text: "Vá em Suas Integrações → Webhooks" },
            { text: "Cole o endpoint abaixo" },
            { text: "Selecione o tópico: payment" },
          ],
          snippet: WEBHOOK_ENDPOINT,
        },
        {
          title: "Onde pegar o Access Token",
          steps: [
            { text: "No Mercado Pago Developers, vá em Credenciais" },
            { text: "Selecione a aplicação" },
            { text: "Copie o Access Token de produção" },
          ],
          note: "Use credenciais de teste antes de ir para produção.",
        },
      ],
    },
  ];
}

/* ─── helpers ─── */
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copiado!");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
      {label ?? "Copiar"}
    </Button>
  );
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3 mt-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-sm text-foreground/85">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

function SnippetBlock({ code }: { code: string }) {
  return (
    <div className="relative mt-3 rounded-lg border border-border bg-muted/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
        <span className="text-[11px] font-mono text-muted-foreground">snippet</span>
        <CopyButton text={code} label="Copiar código" />
      </div>
      <pre className="p-4 text-xs font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">{code}</pre>
    </div>
  );
}

function FieldList({ fields }: { fields: FieldInfo[] }) {
  return (
    <div className="grid gap-2 mt-3">
      {fields.map((f) => (
        <div key={f.label} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <span className="text-sm font-medium text-foreground">{f.label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground hover:text-primary cursor-help transition-colors text-xs">ℹ️</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">{f.tip}</TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}

function PlatformCards({ cards }: { cards: CardInfo[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
      {cards.map((c) => (
        <div key={c.title} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">{c.title}</h4>
          <ol className="space-y-1.5">
            {c.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-primary font-semibold">{i + 1}.</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/* ─── completion tracking (local) ─── */
function useCompleted() {
  const [done, setDone] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("ct-tutorials-done");
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("ct-tutorials-done", JSON.stringify([...next]));
      return next;
    });
  };
  return { done, toggle };
}

/* ─── main ─── */
export default function Tutorials() {
  const { data: workspace } = useWorkspace();
  const { data: apiKeys } = useApiKeys(workspace?.id);
  const activeKey = apiKeys?.find((k: any) => k.status === "active")?.public_key ?? "";
  const guides = useMemo(() => buildGuides(activeKey), [activeKey]);

  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState("sdk");
  const { done, toggle } = useCompleted();

  const filtered = guides.filter(
    (g) =>
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.sections.some((s) => s.title.toLowerCase().includes(search.toLowerCase()))
  );

  const active = filtered.find((g) => g.id === activeId) ?? filtered[0];

  const categories = [
    { key: "tracking", label: "Tracking" },
    { key: "pixel", label: "Pixel" },
    { key: "gateway", label: "Gateways" },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          Tutoriais e Configuração
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Guias passo a passo para configurar integrações e tracking</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar tutorial..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-56 flex-shrink-0 space-y-4 hidden md:block">
          {categories.map((cat) => {
            const items = filtered.filter((g) => g.category === cat.key);
            if (!items.length) return null;
            return (
              <div key={cat.key}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">{cat.label}</p>
                <ul className="space-y-0.5">
                  {items.map((g) => (
                    <li key={g.id}>
                      <button
                        onClick={() => setActiveId(g.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
                          active?.id === g.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        <span className="text-base">{g.icon}</span>
                        <span className="flex-1 truncate">{g.title}</span>
                        {done.has(g.id) && <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {active ? (
            <div className="space-y-4">
              {/* Title bar */}
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{active.icon}</span>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{active.title}</h2>
                    <Badge variant="secondary" className="mt-1 text-[10px]">{active.category}</Badge>
                  </div>
                </div>
                <Button
                  variant={done.has(active.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggle(active.id)}
                  className="gap-1.5"
                >
                  {done.has(active.id) ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  {done.has(active.id) ? "Concluído" : "Marcar concluído"}
                </Button>
              </div>

              {/* Sections */}
              <Accordion type="multiple" defaultValue={active.sections.map((_, i) => `s-${i}`)} className="space-y-2">
                {active.sections.map((sec, i) => (
                  <AccordionItem key={i} value={`s-${i}`} className="rounded-lg border border-border bg-card px-4">
                    <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline py-3">
                      {sec.title}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 space-y-3">
                      {sec.note && (
                        <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/10 p-3">
                          <span className="text-primary text-sm">ℹ️</span>
                          <p className="text-xs text-muted-foreground leading-relaxed">{sec.note}</p>
                        </div>
                      )}
                      {sec.fields && <FieldList fields={sec.fields} />}
                      {sec.steps && <StepList steps={sec.steps} />}
                      {sec.snippet && <SnippetBlock code={sec.snippet} />}
                      {sec.cards && <PlatformCards cards={sec.cards} />}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">Nenhum tutorial encontrado.</div>
          )}
        </div>
      </div>
    </div>
  );
}
