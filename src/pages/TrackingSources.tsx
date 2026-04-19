import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Globe, Webhook, ShoppingCart, Code, Radio, Trash2, Copy,
  ArrowRight, ArrowLeft, CheckCircle, Circle, Loader2, HelpCircle,
  BookOpen, Zap, Settings, Save,
} from "lucide-react";

const SOURCE_TYPES = [
  {
    value: "website",
    label: "Website",
    icon: Globe,
    desc: "Seu site principal. O SDK será instalado aqui para capturar PageView, cliques, compras e identificar usuários automaticamente.",
    example: "meusite.com.br, loja.meusite.com.br",
  },
  {
    value: "checkout",
    label: "Checkout",
    icon: ShoppingCart,
    desc: "Página de pagamento ou checkout. Ideal para capturar Purchase, InitiateCheckout e dados de transação com valor e moeda.",
    example: "checkout.meusite.com.br, pay.hotmart.com",
  },
  {
    value: "landing_page",
    label: "Landing Page",
    icon: Radio,
    desc: "Páginas de captura ou campanhas. Captura Lead, CompleteRegistration e UTMs de campanhas pagas.",
    example: "promo.meusite.com.br, lp.meusite.com.br",
  },
  {
    value: "api",
    label: "API",
    icon: Code,
    desc: "Integração server-to-server. Eventos são enviados diretamente do seu backend via HTTP POST para o endpoint /track com a API Key no header.",
    example: "Sem domínio — usa chamadas HTTP diretas",
  },
  {
    value: "webhook",
    label: "Webhook",
    icon: Webhook,
    desc: "Recebe webhooks de plataformas externas como gateways de pagamento (Stripe, Hotmart, Mercado Pago) que são convertidos em eventos internos.",
    example: "Configurado via Integrações > Gateways",
  },
];

// ════════════════════════════════════════
// Wizard Steps
// ════════════════════════════════════════
const WIZARD_STEPS = [
  { id: "intro", title: "O que é uma Source?" },
  { id: "type", title: "Escolha o tipo" },
  { id: "name", title: "Dê um nome" },
  { id: "domain", title: "Domínio" },
  { id: "review", title: "Revisar e criar" },
];

export default function TrackingSources() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState({ name: "", type: "website", primary_domain: "" });
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", primary_domain: "", status: "active", api_key_id: "" });

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["tracking-sources", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_sources")
        .select("*, api_keys(public_key)")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["api-keys-list", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("id, name, public_key, status")
        .eq("workspace_id", workspace!.id)
        .eq("status", "active");
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const keyId = apiKeys.length > 0 ? apiKeys[0].id : null;
      const { error } = await supabase.from("tracking_sources").insert({
        workspace_id: workspace!.id,
        name: form.name,
        type: form.type,
        primary_domain: form.primary_domain || null,
        api_key_id: keyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-sources"] });
      setOpen(false);
      setWizardStep(0);
      setForm({ name: "", type: "website", primary_domain: "" });
      toast.success("🎉 Tracking Source criada com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tracking_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-sources"] });
      toast.success("Source removida");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("tracking_sources")
        .update({
          name: editForm.name,
          primary_domain: editForm.primary_domain || null,
          status: editForm.status,
          api_key_id: editForm.api_key_id || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-sources"] });
      toast.success("Configurações salvas");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (source: any) => {
    setEditing(source);
    setEditForm({
      name: source.name || "",
      primary_domain: source.primary_domain || "",
      status: source.status || "active",
      api_key_id: source.api_key_id || "",
    });
  };

  const openWizard = () => {
    setWizardStep(0);
    setForm({ name: "", type: "website", primary_domain: "" });
    setOpen(true);
  };

  const getIcon = (type: string) => {
    const found = SOURCE_TYPES.find(s => s.value === type);
    return found ? found.icon : Globe;
  };

  const selectedType = SOURCE_TYPES.find(t => t.value === form.type)!;
  const canAdvance = () => {
    if (wizardStep === 2) return form.name.trim().length >= 2;
    if (wizardStep === 3) return true; // domain is optional
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">Fontes de Tracking</h1>
          <p className="text-sm text-muted-foreground">Gerencie as fontes de coleta de eventos do seu workspace</p>
        </div>
        <Button onClick={openWizard} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Source
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="glass-card animate-pulse h-40" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Radio className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma source configurada</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Uma Tracking Source representa a origem dos seus eventos — seu site, checkout, landing page ou API.
              Clique abaixo para criar sua primeira source com um assistente passo a passo.
            </p>
            <Button onClick={openWizard} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Criar primeira source
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source: any) => {
            const Icon = getIcon(source.type);
            const publicKey = source.api_keys?.public_key;
            return (
              <Card key={source.id} className="glass-card hover:border-primary/30 transition-colors">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{source.name}</CardTitle>
                      <p className="text-xs text-muted-foreground capitalize">{source.type.replace("_", " ")}</p>
                    </div>
                  </div>
                  <Badge variant={source.status === "active" ? "default" : "secondary"}>
                    {source.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {source.primary_domain && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Domínio:</span> {source.primary_domain}
                    </div>
                  )}
                  {publicKey && (
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded flex-1 truncate">{publicKey}</code>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { navigator.clipboard.writeText(publicKey); toast.success("Key copiada!"); }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => openEdit(source)}
                      title="Configurações"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remover a source "${source.name}"?`)) deleteMutation.mutate(source.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ═══════ WIZARD DIALOG ═══════ */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card max-w-xl p-0 gap-0 max-h-[90vh] overflow-hidden">
          {/* Progress bar */}
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-center gap-1 mb-3">
              {WIZARD_STEPS.map((step, i) => (
                <div key={step.id} className="flex items-center gap-1 flex-1">
                  <div className={`flex items-center gap-1.5 text-[10px] font-medium whitespace-nowrap ${
                    i < wizardStep ? "text-emerald-400" : i === wizardStep ? "text-primary" : "text-muted-foreground/40"
                  }`}>
                    {i < wizardStep ? (
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="hidden sm:inline">{step.title}</span>
                  </div>
                  {i < WIZARD_STEPS.length - 1 && (
                    <div className={`flex-1 h-px mx-1 ${i < wizardStep ? "bg-emerald-500/40" : "bg-border/30"}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="w-full h-1 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${((wizardStep + 1) / WIZARD_STEPS.length) * 100}%`,
                  background: "linear-gradient(90deg, hsl(var(--primary)), hsl(265 80% 60%))",
                }}
              />
            </div>
          </div>

          {/* Step content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {wizardStep === 0 && <WizardStepIntro />}
            {wizardStep === 1 && <WizardStepType form={form} setForm={setForm} />}
            {wizardStep === 2 && <WizardStepName form={form} setForm={setForm} selectedType={selectedType} />}
            {wizardStep === 3 && <WizardStepDomain form={form} setForm={setForm} selectedType={selectedType} />}
            {wizardStep === 4 && <WizardStepReview form={form} selectedType={selectedType} apiKey={apiKeys[0]?.public_key} />}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border/20 bg-muted/5">
            <Button
              variant="ghost"
              onClick={() => wizardStep === 0 ? setOpen(false) : setWizardStep(wizardStep - 1)}
              className="gap-2 text-xs"
            >
              {wizardStep === 0 ? "Cancelar" : <><ArrowLeft className="w-3.5 h-3.5" /> Voltar</>}
            </Button>

            {wizardStep < WIZARD_STEPS.length - 1 ? (
              <Button
                onClick={() => setWizardStep(wizardStep + 1)}
                disabled={!canAdvance()}
                className="gap-2 text-xs"
              >
                Próximo <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name}
                className="gap-2 text-xs"
              >
                {createMutation.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Criando...</>
                ) : (
                  <><CheckCircle className="w-3.5 h-3.5" /> Criar Source</>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════ EDIT DIALOG ═══════ */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="glass-card max-w-lg">
          {editing && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Configurações da Source</h3>
                  <p className="text-xs text-muted-foreground capitalize">
                    {editing.type?.replace("_", " ")} • criada em{" "}
                    {new Date(editing.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-border/40 bg-muted/20 p-2.5">
                  <p className="text-muted-foreground uppercase tracking-wide text-[10px]">ID</p>
                  <p className="font-mono text-foreground/80 truncate">{editing.id}</p>
                </div>
                <div className="rounded border border-border/40 bg-muted/20 p-2.5">
                  <p className="text-muted-foreground uppercase tracking-wide text-[10px]">Tipo</p>
                  <p className="text-foreground/80 capitalize">{editing.type?.replace("_", " ")}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Nome</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Domínio principal</Label>
                <Input
                  placeholder="ex: meusite.com.br"
                  value={editForm.primary_domain}
                  onChange={(e) => setEditForm((p) => ({ ...p, primary_domain: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground">
                  Usado para validar a origem dos eventos. Deixe em branco para aceitar qualquer origem.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="paused">Pausado</SelectItem>
                      <SelectItem value="disabled">Desativado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">API Key vinculada</Label>
                  <Select
                    value={editForm.api_key_id || "none"}
                    onValueChange={(v) => setEditForm((p) => ({ ...p, api_key_id: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {apiKeys.map((k: any) => (
                        <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending || !editForm.name.trim()}
                  className="gap-2"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════
// Wizard Step Components
// ════════════════════════════════════════

function WizardStepIntro() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">O que é uma Tracking Source?</h3>
          <p className="text-xs text-muted-foreground">Entenda antes de configurar</p>
        </div>
      </div>

      <div className="bg-muted/20 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed space-y-3">
        <p>
          Uma <strong className="text-foreground">Tracking Source</strong> representa a <strong className="text-foreground">origem</strong> dos seus eventos 
          dentro do CapiTrack AI. É o primeiro passo para começar a coletar dados.
        </p>
        <p>
          Pense assim: se você tem um e-commerce, provavelmente terá pelo menos duas sources — 
          uma para o <strong className="text-foreground">site principal</strong> (onde o visitante navega) e outra para o <strong className="text-foreground">checkout</strong> (onde ele paga).
        </p>

        <div className="border-l-2 border-primary/40 pl-3 py-1 space-y-1.5">
          <p className="text-xs"><strong className="text-foreground">Cada source pode ter:</strong></p>
          <ul className="text-xs space-y-1 list-disc pl-4">
            <li>Um <strong>tipo</strong> (Website, Checkout, Landing Page, API ou Webhook)</li>
            <li>Um <strong>domínio</strong> principal para validação de segurança</li>
            <li>Uma <strong>API Key</strong> vinculada automaticamente</li>
            <li>Status <strong>ativo/inativo</strong> para controle</li>
          </ul>
        </div>

        <p className="text-xs">
          Nas próximas etapas você vai escolher o tipo, dar um nome e configurar o domínio. Leva menos de 1 minuto!
        </p>
      </div>
    </div>
  );
}

function WizardStepType({ form, setForm }: { form: any; setForm: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Qual o tipo da sua source?</h3>
          <p className="text-xs text-muted-foreground">Selecione o que melhor descreve a origem dos eventos</p>
        </div>
      </div>

      <div className="space-y-2">
        {SOURCE_TYPES.map(type => {
          const Icon = type.icon;
          const selected = form.type === type.value;
          return (
            <button
              key={type.value}
              onClick={() => setForm((p: any) => ({ ...p, type: type.value }))}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                selected
                  ? "border-primary/40 bg-primary/5 shadow-[0_0_15px_hsl(var(--primary)/0.1)]"
                  : "border-border/20 bg-muted/10 hover:border-border/40 hover:bg-muted/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  selected ? "bg-primary/15" : "bg-muted/30"
                }`}>
                  <Icon className={`w-4.5 h-4.5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${selected ? "text-primary" : "text-foreground"}`}>
                      {type.label}
                    </span>
                    {selected && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{type.desc}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Ex: {type.example}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WizardStepName({ form, setForm, selectedType }: { form: any; setForm: any; selectedType: any }) {
  const Icon = selectedType.icon;
  const suggestions: Record<string, string[]> = {
    website: ["Meu Site Principal", "Loja Online", "Blog"],
    checkout: ["Checkout Produção", "Página de Pagamento"],
    landing_page: ["LP Campanha Facebook", "LP Google Ads", "Página de Captura"],
    api: ["Backend Produção", "API Webhooks", "CRM Integration"],
    webhook: ["Gateway Stripe", "Hotmart Webhook", "Mercado Pago"],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Dê um nome para a source</h3>
          <p className="text-xs text-muted-foreground">
            Tipo selecionado: <Badge variant="outline" className="ml-1 text-[10px]">{selectedType.label}</Badge>
          </p>
        </div>
      </div>

      <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
        Escolha um nome descritivo que ajude a identificar de onde os eventos vêm. 
        Se você tiver múltiplos sites ou páginas, use nomes que diferenciem cada um.
      </div>

      <div>
        <Label className="text-xs font-medium">Nome da source</Label>
        <Input
          placeholder="Ex: Meu Site Principal"
          value={form.name}
          onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))}
          className="mt-1.5"
          autoFocus
        />
        {form.name.trim().length > 0 && form.name.trim().length < 2 && (
          <p className="text-[10px] text-destructive mt-1">Mínimo 2 caracteres</p>
        )}
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground/60 mb-1.5 uppercase tracking-wider font-medium">Sugestões:</p>
        <div className="flex flex-wrap gap-1.5">
          {(suggestions[form.type] || suggestions.website).map(s => (
            <button
              key={s}
              onClick={() => setForm((p: any) => ({ ...p, name: s }))}
              className="text-[11px] px-2.5 py-1 rounded-full bg-muted/30 text-muted-foreground hover:bg-primary/10 hover:text-primary border border-border/20 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function WizardStepDomain({ form, setForm, selectedType }: { form: any; setForm: any; selectedType: any }) {
  const isServerType = form.type === "api" || form.type === "webhook";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Globe className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isServerType ? "Domínio (opcional)" : "Qual o domínio?"}
          </h3>
          <p className="text-xs text-muted-foreground">Configure a validação de origem dos eventos</p>
        </div>
      </div>

      <div className="bg-muted/20 rounded-lg p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
        {isServerType ? (
          <>
            <p>Para sources do tipo <strong className="text-foreground">{selectedType.label}</strong>, o domínio é <strong className="text-foreground">opcional</strong> 
              pois os eventos são enviados diretamente pelo servidor, sem header Origin/Referer.</p>
            <p>Você pode pular esta etapa se quiser.</p>
          </>
        ) : (
          <>
            <p><strong className="text-foreground">Por que informar o domínio?</strong></p>
            <p>O CapiTrack AI valida a origem de cada evento verificando o header <code className="bg-muted/50 px-1 rounded">Origin</code> contra os domínios permitidos. Isso impede que terceiros usem sua API Key para enviar eventos falsos.</p>
            <ul className="list-disc pl-4 space-y-1 mt-2">
              <li>Informe apenas o domínio, sem <code className="bg-muted/50 px-1 rounded">https://</code></li>
              <li>Suporta wildcard: <code className="bg-muted/50 px-1 rounded">*.meusite.com.br</code></li>
              <li>Se deixar vazio, todos os domínios serão aceitos (menos seguro)</li>
            </ul>
          </>
        )}
      </div>

      <div>
        <Label className="text-xs font-medium">Domínio principal {isServerType && "(opcional)"}</Label>
        <Input
          placeholder={isServerType ? "Opcional — deixe vazio se não se aplica" : "meusite.com.br"}
          value={form.primary_domain}
          onChange={e => setForm((p: any) => ({ ...p, primary_domain: e.target.value }))}
          className="mt-1.5"
        />
      </div>

      {!isServerType && (
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-3 flex items-start gap-2">
          <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-300/80 leading-relaxed">
            <strong>Dica:</strong> se o seu site usa subdomínios (blog.meusite.com, loja.meusite.com), 
            use <code className="bg-muted/40 px-1 rounded">*.meusite.com.br</code> para permitir todos de uma vez.
          </p>
        </div>
      )}
    </div>
  );
}

function WizardStepReview({ form, selectedType, apiKey }: { form: any; selectedType: any; apiKey?: string }) {
  const Icon = selectedType.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Tudo pronto!</h3>
          <p className="text-xs text-muted-foreground">Revise as informações antes de criar</p>
        </div>
      </div>

      <div className="bg-muted/20 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border/20">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">{form.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{selectedType.label}</p>
          </div>
        </div>

        <div className="grid gap-3">
          <ReviewRow label="Tipo" value={selectedType.label} />
          <ReviewRow label="Nome" value={form.name} />
          <ReviewRow label="Domínio" value={form.primary_domain || "Nenhum (todos permitidos)"} />
          <ReviewRow label="API Key" value={apiKey ? `${apiKey.substring(0, 12)}...` : "Será vinculada automaticamente"} />
          <ReviewRow label="Status" value="Ativo" badge />
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/15 rounded-lg p-4 text-xs text-muted-foreground leading-relaxed space-y-3">
        <strong className="text-foreground text-sm">Próximos passos após criar:</strong>
        <div className="space-y-2">
          <a href="/sdk-setup" className="flex items-center gap-3 p-2.5 rounded-lg bg-background/50 border border-border/30 hover:border-primary/40 hover:bg-primary/5 transition-all group cursor-pointer">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0 group-hover:bg-primary/20">1</div>
            <div className="flex-1">
              <p className="text-foreground font-medium text-xs">Copiar snippet do SDK</p>
              <p className="text-[10px] text-muted-foreground">Vá em SDK Setup e cole antes do &lt;/head&gt;</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
          </a>
          <a href="/integrations" className="flex items-center gap-3 p-2.5 rounded-lg bg-background/50 border border-border/30 hover:border-primary/40 hover:bg-primary/5 transition-all group cursor-pointer">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0 group-hover:bg-primary/20">2</div>
            <div className="flex-1">
              <p className="text-foreground font-medium text-xs">Configurar Destination</p>
              <p className="text-[10px] text-muted-foreground">Meta CAPI, GA4, TikTok, Google Ads</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
          </a>
          <a href="/event-logs" className="flex items-center gap-3 p-2.5 rounded-lg bg-background/50 border border-border/30 hover:border-primary/40 hover:bg-primary/5 transition-all group cursor-pointer">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] shrink-0 group-hover:bg-primary/20">3</div>
            <div className="flex-1">
              <p className="text-foreground font-medium text-xs">Verificar Event Logs</p>
              <p className="text-[10px] text-muted-foreground">Acesse seu site e veja os eventos chegarem</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
          </a>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      {badge ? (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">{value}</Badge>
      ) : (
        <span className="text-xs font-medium text-foreground">{value}</span>
      )}
    </div>
  );
}
