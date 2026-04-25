import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Wand2, Copy, Search, Wrench, CheckCircle2, ShoppingBag, GraduationCap,
  Cloud, Users, UtensilsCrossed, Store, Briefcase, Sparkles, Info, HelpCircle, Bot, ShoppingCart, Globe,
} from "lucide-react";
import { NativeCheckoutBuilder } from "@/components/setup/NativeCheckoutBuilder";
import { ExternalCheckoutBuilder } from "@/components/setup/ExternalCheckoutBuilder";
import {
  BUSINESS_PROFILES, generateAuditPrompt, generateFixPrompt, generateValidationPrompt,
  type BusinessType, type Gateway, type Platform, type ProjectConfig, type TargetAI,
} from "@/lib/prompt-templates";

const BUSINESS_ICONS: Record<BusinessType, React.ComponentType<{ className?: string }>> = {
  ecommerce: ShoppingBag, infoproduct: GraduationCap, saas: Cloud,
  leadgen: Users, delivery: UtensilsCrossed, marketplace: Store, agency: Briefcase,
};

const GATEWAYS: { value: Gateway; label: string }[] = [
  { value: "unknown", label: "🤔 Não sei / Detectar automaticamente" },
  { value: "stripe", label: "Stripe" }, { value: "hotmart", label: "Hotmart" },
  { value: "kiwify", label: "Kiwify" }, { value: "monetizze", label: "Monetizze" },
  { value: "eduzz", label: "Eduzz" }, { value: "pagseguro", label: "PagSeguro" },
  { value: "mercadopago", label: "Mercado Pago" }, { value: "asaas", label: "Asaas" },
  { value: "pagarme", label: "Pagar.me" }, { value: "yampi", label: "Yampi" },
  { value: "appmax", label: "Appmax" }, { value: "quantumpay", label: "Quantum Pay" },
  { value: "shopify", label: "Shopify" }, { value: "woocommerce", label: "WooCommerce" },
  { value: "custom", label: "Custom/Próprio" }, { value: "none", label: "Nenhum" },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "unknown", label: "🤔 Não sei / Detectar automaticamente" },
  { value: "react", label: "React / Vite" }, { value: "next", label: "Next.js" },
  { value: "vue", label: "Vue / Nuxt" }, { value: "wordpress", label: "WordPress" },
  { value: "shopify", label: "Shopify" }, { value: "webflow", label: "Webflow" },
  { value: "html", label: "HTML estático" }, { value: "custom", label: "Custom" },
];

const TARGET_AIS: { value: TargetAI; label: string; hint: string }[] = [
  { value: "lovable", label: "Lovable", hint: "Agente de código com acesso a arquivos" },
  { value: "cursor", label: "Cursor", hint: "IDE com @file e Cmd+K" },
  { value: "claude", label: "Claude / Claude Code", hint: "Anthropic — chat ou Code" },
  { value: "chatgpt", label: "ChatGPT / Codex", hint: "OpenAI — pode pedir arquivos" },
  { value: "manus", label: "Manus", hint: "Agente autônomo de repo" },
  { value: "bolt", label: "Bolt.new", hint: "WebContainer da StackBlitz" },
  { value: "v0", label: "v0 (Vercel)", hint: "Foco em Next.js/React" },
  { value: "windsurf", label: "Windsurf (Codeium)", hint: "Cascade no workspace" },
  { value: "other", label: "Outra IA", hint: "Genérico — pede arquivos se preciso" },
];

function CopyableBlock({ code, label }: { code: string; label: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    toast.success(`${label} copiado!`);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted/30 border border-border/30 rounded-lg p-4 overflow-auto text-xs leading-relaxed max-h-[600px] whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
      <Button
        size="sm" variant="default"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
      </Button>
    </div>
  );
}

export default function PromptGenerator() {
  const { data: workspace } = useWorkspace();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://xpgsipmyrwyjerjvbhmb.supabase.co";

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["pg-keys", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("public_key")
        .eq("workspace_id", workspace!.id)
        .eq("status", "active")
        .limit(1);
      return data || [];
    },
  });

  const [businessType, setBusinessType] = useState<BusinessType>("ecommerce");
  const [gateway, setGateway] = useState<Gateway>("unknown");
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [targetAI, setTargetAI] = useState<TargetAI>("lovable");
  const [hasMetaAds, setHasMetaAds] = useState(true);
  const [hasGoogleAds, setHasGoogleAds] = useState(true);
  const [hasGA4, setHasGA4] = useState(true);
  const [hasTikTokAds, setHasTikTokAds] = useState(false);

  const config = useMemo<ProjectConfig>(() => ({
    businessType, gateway, platform, targetAI,
    publicKey: apiKeys[0]?.public_key || "",
    workspaceId: workspace?.id || "",
    endpoint: `${supabaseUrl}/functions/v1/track`,
    hasMetaAds, hasGoogleAds, hasGA4, hasTikTokAds,
  }), [businessType, gateway, platform, targetAI, apiKeys, workspace, supabaseUrl, hasMetaAds, hasGoogleAds, hasGA4, hasTikTokAds]);

  const auditPrompt = useMemo(() => generateAuditPrompt(config), [config]);
  const fixPrompt = useMemo(() => generateFixPrompt(config), [config]);
  const validationPrompt = useMemo(() => generateValidationPrompt(config), [config]);

  const profile = BUSINESS_PROFILES[businessType];
  const Icon = BUSINESS_ICONS[businessType];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2">
            <Wand2 className="w-6 h-6" />
            Gerador de Prompts de Implementação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure o tipo do projeto-alvo e gere prompts prontos para colar na IA-agente do projeto-alvo (Lovable, Cursor, Claude Code, ChatGPT/Codex, Manus, Bolt.new, v0, Windsurf ou outra).
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Sparkles className="w-3 h-3" /> Workspace: {workspace?.name || "—"}
        </Badge>
      </div>

      <Alert className="border-primary/20 bg-primary/5">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-xs">
          <strong>Como usar:</strong> 1) Configure abaixo o perfil do projeto que vai receber o tracking · 2) Copie o <strong>Prompt 1 (Auditoria)</strong> e cole no chat da IA do projeto-alvo · 3) Traga o relatório de volta · 4) Copie o <strong>Prompt 2 (Correção)</strong> · 5) Use o <strong>Prompt 3 (Validação)</strong> para confirmar.
        </AlertDescription>
      </Alert>

      {/* CONFIG */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">1️⃣ Configuração do projeto-alvo</CardTitle>
          <CardDescription>Quanto mais preciso, melhor o prompt gerado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">Tipo de negócio</Label>
              <Select value={businessType} onValueChange={(v) => setBusinessType(v as BusinessType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(BUSINESS_PROFILES).map((p) => {
                    const I = BUSINESS_ICONS[p.id];
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <I className="w-3.5 h-3.5" /> {p.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Gateway de pagamento</Label>
              <Select value={gateway} onValueChange={(v) => setGateway(v as Gateway)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {GATEWAYS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Plataforma / Stack</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1">
                <Bot className="w-3 h-3" /> IA do projeto-alvo
              </Label>
              <Select value={targetAI} onValueChange={(v) => setTargetAI(v as TargetAI)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {TARGET_AIS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {TARGET_AIS.find((a) => a.value === targetAI)?.hint}
              </p>
            </div>
          </div>

          {(platform === "unknown" || gateway === "unknown") && (
            <Alert className="border-primary/30 bg-primary/5">
              <HelpCircle className="w-4 h-4 text-primary" />
              <AlertDescription className="text-xs">
                <strong>Modo detecção ativado.</strong> O prompt vai pedir para a IA-alvo inspecionar o projeto e descobrir sozinha {platform === "unknown" && "a stack"}{platform === "unknown" && gateway === "unknown" && " e "}{gateway === "unknown" && "o gateway"} antes de aplicar qualquer correção.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label className="text-xs mb-2 block">Destinos ativos</Label>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                <span className="text-sm">Meta Ads</span>
                <Switch checked={hasMetaAds} onCheckedChange={setHasMetaAds} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                <span className="text-sm">Google Ads</span>
                <Switch checked={hasGoogleAds} onCheckedChange={setHasGoogleAds} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                <span className="text-sm">GA4</span>
                <Switch checked={hasGA4} onCheckedChange={setHasGA4} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                <span className="text-sm">TikTok Ads</span>
                <Switch checked={hasTikTokAds} onCheckedChange={setHasTikTokAds} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PROFILE PREVIEW */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary" />
            Funil ideal para {profile.label}
          </CardTitle>
          <CardDescription>{profile.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {profile.funnel.map((e, i) => (
              <div key={e} className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-xs font-mono">{i + 1}. {e}</Badge>
                {i < profile.funnel.length - 1 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            <strong>Objetivos de otimização:</strong> {profile.goals.join(" · ")}
          </div>
        </CardContent>
      </Card>

      {/* PROMPTS */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">2️⃣ Prompts gerados</CardTitle>
          <CardDescription>Copie e cole no chat da IA do projeto-alvo, na ordem.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="audit">
            <TabsList className="bg-muted/30 flex-wrap h-auto">
              <TabsTrigger value="audit">
                <Search className="w-3.5 h-3.5 mr-1" /> 1. Auditoria
              </TabsTrigger>
              <TabsTrigger value="fix">
                <Wrench className="w-3.5 h-3.5 mr-1" /> 2. Correção
              </TabsTrigger>
              <TabsTrigger value="validate">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 3. Validação
              </TabsTrigger>
              <TabsTrigger value="native">
                <ShoppingCart className="w-3.5 h-3.5 mr-1" /> 4. Checkout Nativo
              </TabsTrigger>
              <TabsTrigger value="external">
                <Globe className="w-3.5 h-3.5 mr-1" /> 5. Checkout Externo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="audit" className="mt-4 space-y-3">
              <Alert>
                <Info className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Cole este no projeto-alvo PRIMEIRO. A IA vai responder com um relatório completo, sem alterar nada.
                </AlertDescription>
              </Alert>
              <CopyableBlock code={auditPrompt} label="Prompt de auditoria" />
            </TabsContent>

            <TabsContent value="fix" className="mt-4 space-y-3">
              <Alert>
                <Info className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Use depois de receber o relatório. Aplica as correções de forma <strong>aditiva</strong> (não quebra o que existe).
                </AlertDescription>
              </Alert>
              <CopyableBlock code={fixPrompt} label="Prompt de correção" />
            </TabsContent>

            <TabsContent value="validate" className="mt-4 space-y-3">
              <Alert>
                <Info className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Roteiro passo-a-passo de testes. Use depois que a correção for aplicada para garantir que tudo funciona.
                </AlertDescription>
              </Alert>
              <CopyableBlock code={validationPrompt} label="Prompt de validação" />
            </TabsContent>

            <TabsContent value="native" className="mt-4 space-y-3">
              <Alert className="border-primary/20 bg-primary/5">
                <ShoppingCart className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Use quando o checkout é <strong>próprio</strong> — meu site cria o pedido (PIX, cartão, boleto, assinatura).
                  Inclui webhook + check-status + reconcile-pix com idempotência atômica.
                </AlertDescription>
              </Alert>
              <NativeCheckoutBuilder
                publicKey={config.publicKey}
                endpoint={config.endpoint}
                supabaseUrl={supabaseUrl}
              />
            </TabsContent>

            <TabsContent value="external" className="mt-4 space-y-3">
              <Alert className="border-primary/20 bg-primary/5">
                <Globe className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Use quando o cliente <strong>sai do seu site</strong> para pagar (Yampi, Shopify, WooCommerce,
                  Hotmart, Kiwify, Eduzz, Monetizze etc.). Foco em webhook/postback + UTMs + dedup.
                </AlertDescription>
              </Alert>
              <ExternalCheckoutBuilder
                publicKey={config.publicKey}
                endpoint={config.endpoint}
                supabaseUrl={supabaseUrl}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
