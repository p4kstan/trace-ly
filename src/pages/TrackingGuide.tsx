import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { generatePublicKey } from "@/lib/key-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Key, Radio, Globe, Code, Send, FileText, CheckCircle, Circle,
  ArrowRight, ArrowLeft, Copy, Loader2, ExternalLink, Zap, BookOpen,
  ChevronDown, RefreshCw,
} from "lucide-react";

// ─── Step definitions ───
const STEPS = [
  { id: "apikey", title: "Criar API Key", icon: Key, description: "Gere uma chave pública para autenticar eventos" },
  { id: "source", title: "Tracking Source", icon: Radio, description: "Cadastre a origem dos seus eventos" },
  { id: "domain", title: "Domínios Permitidos", icon: Globe, description: "Autorize os domínios que podem enviar eventos" },
  { id: "sdk", title: "Instalar SDK", icon: Code, description: "Copie e cole o snippet no seu site" },
  { id: "destination", title: "Destinations", icon: Send, description: "Configure para onde os eventos serão enviados" },
  { id: "test", title: "Testar & Validar", icon: CheckCircle, description: "Verifique se tudo está funcionando" },
];

// ─── Hook: check completion status ───
function useSetupStatus(workspaceId?: string) {
  const apiKeysQuery = useQuery({
    queryKey: ["setup-api-keys", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("api_keys").select("id, public_key").eq("workspace_id", workspaceId!).eq("status", "active");
      return data || [];
    },
  });

  const sourcesQuery = useQuery({
    queryKey: ["setup-sources", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("tracking_sources").select("id, primary_domain").eq("workspace_id", workspaceId!).eq("status", "active");
      return data || [];
    },
  });

  const destinationsQuery = useQuery({
    queryKey: ["setup-destinations", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("gateway_integrations").select("id, provider").eq("workspace_id", workspaceId!).eq("status", "active");
      return data || [];
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["setup-events", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id").eq("workspace_id", workspaceId!).limit(1);
      return data || [];
    },
  });

  return {
    apiKeys: apiKeysQuery.data || [],
    sources: sourcesQuery.data || [],
    destinations: destinationsQuery.data || [],
    hasEvents: (eventsQuery.data || []).length > 0,
    isLoading: apiKeysQuery.isLoading,
    refetchAll: () => {
      apiKeysQuery.refetch();
      sourcesQuery.refetch();
      destinationsQuery.refetch();
      eventsQuery.refetch();
    },
  };
}

export default function TrackingGuide() {
  const { data: workspace } = useWorkspace();
  const status = useSetupStatus(workspace?.id);
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  // Auto-advance logic
  const stepCompleted = useCallback((stepIndex: number) => {
    switch (stepIndex) {
      case 0: return status.apiKeys.length > 0;
      case 1: return status.sources.length > 0;
      case 2: return status.sources.some((s: any) => s.primary_domain);
      case 3: return true; // SDK install is manual, can't auto-detect
      case 4: return status.destinations.length > 0;
      case 5: return status.hasEvents;
      default: return false;
    }
  }, [status]);

  // Auto-advance when step is completed
  useEffect(() => {
    if (stepCompleted(currentStep) && currentStep < STEPS.length - 1) {
      const timer = setTimeout(() => {
        if (stepCompleted(currentStep)) {
          setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
          toast.success(`✓ ${STEPS[currentStep].title} concluído!`);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [stepCompleted, currentStep]);

  const completedCount = STEPS.filter((_, i) => stepCompleted(i)).length;
  const progress = Math.round((completedCount / STEPS.length) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">Setup do Tracking Hub</h1>
          <p className="text-sm text-muted-foreground">
            Siga cada etapa — o sistema avança automaticamente quando detecta que você concluiu
          </p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1.5">
          {completedCount}/{STEPS.length} concluídos
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-muted/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, hsl(var(--primary)), hsl(265 80% 60%))",
          }}
        />
      </div>

      {/* Step navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STEPS.map((step, i) => {
          const done = stepCompleted(i);
          const active = i === currentStep;
          return (
            <button
              key={step.id}
              onClick={() => setCurrentStep(i)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                active
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : done
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-muted/20 text-muted-foreground border border-border/20 hover:bg-muted/40"
              }`}
            >
              {done ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <Circle className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{step.title}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Active step content */}
      <Card className="glass-card border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-5">
            {(() => { const Icon = STEPS[currentStep].icon; return <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="w-5 h-5 text-primary" /></div>; })()}
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Etapa {currentStep + 1}: {STEPS[currentStep].title}
              </h2>
              <p className="text-xs text-muted-foreground">{STEPS[currentStep].description}</p>
            </div>
            {stepCompleted(currentStep) && (
              <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <CheckCircle className="w-3 h-3 mr-1" /> Concluído
              </Badge>
            )}
          </div>

          {/* Step-specific content */}
          {currentStep === 0 && <StepApiKey workspaceId={workspace?.id} status={status} />}
          {currentStep === 1 && <StepSource workspaceId={workspace?.id} status={status} />}
          {currentStep === 2 && <StepDomain workspaceId={workspace?.id} status={status} />}
          {currentStep === 3 && <StepSDK status={status} />}
          {currentStep === 4 && <StepDestination status={status} navigate={navigate} />}
          {currentStep === 5 && <StepTest workspaceId={workspace?.id} status={status} />}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setCurrentStep(currentStep + 1)}
            className="gap-2"
          >
            Próxima <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={() => navigate("/")} className="gap-2">
            <Zap className="w-4 h-4" /> Ir para Dashboard
          </Button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Step 1: API Key
// ═══════════════════════════════════════
function StepApiKey({ workspaceId, status }: { workspaceId?: string; status: any }) {
  const [name, setName] = useState("Minha Chave Principal");
  const queryClient = useQueryClient();

  const createKey = useMutation({
    mutationFn: async () => {
      const publicKey = generatePublicKey();
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(publicKey));
      const secretHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      const { error } = await supabase.from("api_keys").insert({
        workspace_id: workspaceId!,
        name,
        public_key: publicKey,
        secret_key_hash: secretHash,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setup-api-keys"] });
      status.refetchAll();
      toast.success("API Key criada com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="bg-muted/20 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed space-y-2">
        <p><strong className="text-foreground">O que é uma API Key?</strong></p>
        <p>A API Key (chave pública) é o identificador que permite ao SDK e às integrações server-side autenticarem os eventos enviados ao CapiTrack AI. Ela tem o formato <code className="bg-muted/50 px-1 rounded text-xs">pk_live_xxx</code>.</p>
        <p>Cada workspace pode ter múltiplas keys (para ambientes diferentes, por exemplo), mas só keys com status "active" funcionam. A key é <strong>pública</strong> — pode ser exposta no front-end sem risco de segurança.</p>
      </div>

      {status.apiKeys.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-emerald-400">✓ Você já tem {status.apiKeys.length} key(s) ativa(s):</p>
          {status.apiKeys.map((k: any) => (
            <div key={k.id} className="flex items-center gap-2 bg-muted/20 rounded-lg p-3">
              <code className="text-xs font-mono flex-1 truncate">{k.public_key}</code>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(k.public_key); toast.success("Copiada!"); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome da chave</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Produção, Staging..." className="mt-1" />
          </div>
          <Button onClick={() => createKey.mutate()} disabled={createKey.isPending || !workspaceId} className="gap-2">
            {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            Criar API Key
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// Step 2: Tracking Source
// ═══════════════════════════════════════
function StepSource({ workspaceId, status }: { workspaceId?: string; status: any }) {
  const [form, setForm] = useState({ name: "", type: "website", primary_domain: "" });
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const apiKeyId = status.apiKeys[0]?.id || null;
      const { error } = await supabase.from("tracking_sources").insert({
        workspace_id: workspaceId!,
        name: form.name,
        type: form.type,
        primary_domain: form.primary_domain || null,
        api_key_id: apiKeyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setup-sources"] });
      status.refetchAll();
      toast.success("Source criada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="bg-muted/20 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed space-y-2">
        <p><strong className="text-foreground">O que é uma Tracking Source?</strong></p>
        <p>É a <strong>origem</strong> dos seus eventos — seu site, checkout, landing page, ou até uma API backend. Cada source é vinculada a uma API Key e pode ter um domínio principal associado.</p>
        <p><strong>Tipos disponíveis:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Website</strong> — seu site principal, onde o SDK será instalado</li>
          <li><strong>Checkout</strong> — página de pagamento (ex: Hotmart, checkout próprio)</li>
          <li><strong>Landing Page</strong> — páginas de captura/campanha</li>
          <li><strong>API</strong> — integração server-to-server via chamadas HTTP</li>
          <li><strong>Webhook</strong> — recebe webhooks de plataformas externas</li>
        </ul>
      </div>

      {status.sources.length > 0 ? (
        <p className="text-sm font-medium text-emerald-400">✓ Você já tem {status.sources.length} source(s) configurada(s)</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input placeholder="Meu Site Principal" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="checkout">Checkout</SelectItem>
                  <SelectItem value="landing_page">Landing Page</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Domínio principal</Label>
            <Input placeholder="meusite.com.br" value={form.primary_domain} onChange={e => setForm(p => ({ ...p, primary_domain: e.target.value }))} className="mt-1" />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.name} className="gap-2">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            Criar Source
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// Step 3: Domain validation
// ═══════════════════════════════════════
function StepDomain({ workspaceId, status }: { workspaceId?: string; status: any }) {
  const hasDomain = status.sources.some((s: any) => s.primary_domain);

  return (
    <div className="space-y-4">
      <div className="bg-muted/20 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed space-y-2">
        <p><strong className="text-foreground">Por que validar domínios?</strong></p>
        <p>A validação de domínio impede que terceiros usem sua API Key para enviar eventos falsos. O endpoint <code className="bg-muted/50 px-1 rounded text-xs">/track</code> verifica o header <code className="bg-muted/50 px-1 rounded text-xs">Origin</code> ou <code className="bg-muted/50 px-1 rounded text-xs">Referer</code> contra a lista de domínios autorizados.</p>
        <p><strong>Como funciona:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Se nenhum domínio estiver configurado, todos são aceitos (para facilitar o início)</li>
          <li>Depois de adicionar o primeiro domínio, apenas eventos desses domínios são aceitos</li>
          <li>Suporta wildcard: <code className="bg-muted/50 px-1 rounded text-xs">*.meusite.com.br</code> aceita todos os subdomínios</li>
          <li>Chamadas server-to-server (sem Origin) são sempre aceitas</li>
        </ul>
        <p><strong>Onde configurar:</strong> o domínio pode ser definido na Tracking Source (etapa anterior) ou em <strong>Pixels → Domínios Permitidos</strong> no menu.</p>
      </div>

      {hasDomain ? (
        <p className="text-sm font-medium text-emerald-400">✓ Pelo menos uma source tem domínio configurado</p>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
          Nenhum domínio configurado ainda. Volte à etapa anterior e preencha o campo "Domínio principal", ou prossiga sem restrição por enquanto.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// Step 4: Install SDK
// ═══════════════════════════════════════
function StepSDK({ status }: { status: any }) {
  const publicKey = status.apiKeys[0]?.public_key || "pk_live_SUA_CHAVE_AQUI";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://seu-projeto.supabase.co";

  const snippet = `<!-- CapiTrack AI SDK v3 -->
<script>
  !function(){
    window.capitrack = window.capitrack || function(){
      (window.capitrack.q = window.capitrack.q || []).push(arguments);
    };
    var s = document.createElement("script");
    s.src = "https://SEU_DOMINIO/sdk.js";
    s.async = true;
    document.head.appendChild(s);
  }();

  capitrack("init", "${publicKey}", {
    endpoint: "${supabaseUrl}/functions/v1/track",
    debug: true,
    trackSPA: true
  });
</script>`;

  const copySnippet = () => {
    navigator.clipboard.writeText(snippet);
    toast.success("Snippet copiado!");
  };

  return (
    <div className="space-y-4">
      <div className="bg-muted/20 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed space-y-2">
        <p><strong className="text-foreground">Como instalar o SDK?</strong></p>
        <p>Copie o snippet abaixo e cole antes do <code className="bg-muted/50 px-1 rounded text-xs">&lt;/head&gt;</code> de todas as páginas do seu site. Ele funciona com HTML estático, WordPress, Shopify, e qualquer plataforma que permita inserir código customizado.</p>
        <p><strong>O que o SDK faz automaticamente:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Dispara <strong>PageView</strong> em cada carregamento de página</li>
          <li>Captura UTMs da URL (utm_source, utm_medium, utm_campaign, utm_content, utm_term)</li>
          <li>Captura click IDs (fbclid, gclid, ttclid)</li>
          <li>Gera e persiste cookies <strong>fbp</strong> e <strong>fbc</strong> (Meta)</li>
          <li>Cria <strong>anonymous_id</strong> e <strong>session_id</strong></li>
          <li>Persiste UTMs em cookie + localStorage + sessionStorage</li>
          <li>Com <code className="bg-muted/50 px-1 rounded text-xs">trackSPA: true</code>, rastreia mudanças de rota em SPAs</li>
          <li>Com <code className="bg-muted/50 px-1 rounded text-xs">debug: true</code>, mostra painel visual flutuante</li>
        </ul>
        <p className="text-amber-300">💡 <strong>Dica:</strong> comece com <code className="bg-muted/50 px-1 rounded text-xs">debug: true</code> para validar, depois mude para <code className="bg-muted/50 px-1 rounded text-xs">false</code> em produção.</p>
      </div>

      <div className="relative group">
        <pre className="bg-muted/30 border border-border/30 rounded-lg p-4 overflow-x-auto text-xs leading-relaxed">
          <code>{snippet}</code>
        </pre>
        <Button size="sm" variant="outline" className="absolute top-2 right-2 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={copySnippet}>
          <Copy className="w-3.5 h-3.5" /> Copiar
        </Button>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Eventos disponíveis no SDK:</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {["track", "page", "identify", "purchase", "lead", "addToCart", "initiateCheckout", "viewContent", "search", "completeRegistration", "debug", "reset"].map(cmd => (
            <code key={cmd} className="bg-muted/40 px-2 py-1 rounded text-center">capitrack("{cmd}")</code>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Step 5: Destinations
// ═══════════════════════════════════════
function StepDestination({ status, navigate }: { status: any; navigate: any }) {
  return (
    <div className="space-y-4">
      <div className="bg-muted/20 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed space-y-2">
        <p><strong className="text-foreground">O que são Destinations?</strong></p>
        <p>Destinations (destinos) são as plataformas para onde o CapiTrack AI envia os eventos coletados. Quando um evento chega pelo SDK ou API, o <strong>EventRouter</strong> automaticamente distribui para todos os destinos ativos do seu workspace.</p>
        <p><strong>Destinos disponíveis:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Meta Conversions API</strong> — envia Purchase, Lead, PageView etc. diretamente para a API do Facebook (requer Pixel ID + Access Token)</li>
          <li><strong>GA4 Measurement Protocol</strong> — envia eventos para o Google Analytics 4 (requer Measurement ID + API Secret)</li>
          <li><strong>Google Ads</strong> — registra conversões no Google Ads para otimização de campanhas (requer Conversion ID + Label)</li>
          <li><strong>TikTok Events API</strong> — envia eventos server-side para o TikTok (requer Pixel Code + Access Token)</li>
        </ul>
        <p><strong>Como configurar:</strong> vá em <strong>Integrações</strong> no menu lateral, selecione a plataforma desejada, preencha as credenciais e ative. A integração aparecerá automaticamente como Destination.</p>
      </div>

      {status.destinations.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-emerald-400">✓ {status.destinations.length} destino(s) ativo(s):</p>
          <div className="flex flex-wrap gap-2">
            {status.destinations.map((d: any) => (
              <Badge key={d.id} variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                {d.provider}
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
            Nenhum destino configurado. Configure pelo menos um para que os eventos sejam enviados às plataformas de marketing.
          </div>
          <Button variant="outline" onClick={() => navigate("/integrations")} className="gap-2">
            <ExternalLink className="w-4 h-4" /> Ir para Integrações
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// Step 6: Test & Validate
// ═══════════════════════════════════════
function StepTest({ workspaceId, status }: { workspaceId?: string; status: any }) {
  const { data: recentEvents = [], refetch } = useQuery({
    queryKey: ["setup-recent-events", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, event_name, source, created_at, processing_status")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="bg-muted/20 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed space-y-2">
        <p><strong className="text-foreground">Como testar?</strong></p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Abra o site onde instalou o SDK</li>
          <li>Se ativou <code className="bg-muted/50 px-1 rounded text-xs">debug: true</code>, veja o painel azul no canto inferior direito</li>
          <li>Navegue por algumas páginas — cada uma gera um evento <strong>PageView</strong></li>
          <li>Volte aqui e veja os eventos aparecerem na lista abaixo (atualiza a cada 3s)</li>
          <li>Confira em <strong>Integration Logs</strong> se os eventos foram entregues aos destinos</li>
          <li>Use <strong>System Health</strong> para um diagnóstico completo</li>
        </ol>
        <p className="text-amber-300">💡 <strong>Teste server-side:</strong> use o cURL abaixo para enviar um evento diretamente pela API:</p>
      </div>

      {status.apiKeys[0] && (
        <CurlSnippet publicKey={status.apiKeys[0].public_key} />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Eventos recentes (auto-refresh 3s)</p>
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="gap-1.5 h-7">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </Button>
        </div>
        {recentEvents.length === 0 ? (
          <div className="bg-muted/20 rounded-lg p-6 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Aguardando eventos... Instale o SDK no seu site e acesse uma página.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentEvents.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium">{e.event_name}</span>
                  <Badge variant="outline" className="text-[10px]">{e.source || "sdk"}</Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleTimeString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CurlSnippet({ publicKey }: { publicKey: string }) {
  const url = import.meta.env.VITE_SUPABASE_URL || "https://seu-projeto.supabase.co";
  const curl = `curl -X POST "${url}/functions/v1/track" \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${publicKey}" \\
  -d '{
    "event_name": "Purchase",
    "source": "test",
    "user_data": { "email": "teste@email.com" },
    "custom_data": { "value": 99.90, "currency": "BRL" }
  }'`;

  return (
    <div className="relative group">
      <pre className="bg-muted/30 border border-border/30 rounded-lg p-3 overflow-x-auto text-[11px] leading-relaxed">
        <code>{curl}</code>
      </pre>
      <Button
        size="sm" variant="ghost"
        className="absolute top-1.5 right-1.5 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => { navigator.clipboard.writeText(curl); toast.success("cURL copiado!"); }}
      >
        <Copy className="w-3 h-3" />
      </Button>
    </div>
  );
}
