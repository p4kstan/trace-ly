import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Copy, CheckCircle, XCircle, Trash2, Webhook, Settings2, RefreshCw, ExternalLink } from "lucide-react";
import { InlineHelp } from "@/components/InlineHelp";

const PROVIDERS = [
  { value: "stripe", label: "Stripe", emoji: "💳", country: "int" },
  { value: "mercadopago", label: "Mercado Pago", emoji: "🟡", country: "br" },
  { value: "pagarme", label: "Pagar.me", emoji: "🟢", country: "br" },
  { value: "asaas", label: "Asaas", emoji: "🔵", country: "br" },
  { value: "appmax", label: "Appmax", emoji: "📱", country: "br" },
  { value: "hotmart", label: "Hotmart", emoji: "🔥", country: "br" },
  { value: "monetizze", label: "Monetizze", emoji: "💰", country: "br" },
  { value: "eduzz", label: "Eduzz", emoji: "📚", country: "br" },
  { value: "cakto", label: "Cakto", emoji: "🎯", country: "br" },
  { value: "kirvano", label: "Kirvano", emoji: "🚀", country: "br" },
  { value: "pagseguro", label: "PagSeguro", emoji: "🟠", country: "br" },
  { value: "pushinpay", label: "PushinPay", emoji: "⚡", country: "br" },
  { value: "perfectpay", label: "Perfect Pay", emoji: "✅", country: "br" },
  { value: "greenn", label: "Greenn", emoji: "🌿", country: "br" },
  { value: "ticto", label: "Ticto", emoji: "🎪", country: "br" },
  { value: "yampi", label: "Yampi Payments", emoji: "🛒", country: "br" },
  { value: "vindi", label: "Vindi", emoji: "💜", country: "br" },
  { value: "iugu", label: "Iugu", emoji: "🧾", country: "br" },
  { value: "efi", label: "Gerencianet / Efí", emoji: "💎", country: "br" },
  { value: "abacatepay", label: "AbacatePay", emoji: "🥑", country: "br" },
  { value: "hubla", label: "Hubla", emoji: "🔗", country: "br" },
];

export default function Integrations() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ provider: "stripe", name: "", credentials: "", webhookSecret: "", environment: "production" });

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["gateway_integrations", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data } = await supabase.from("gateway_integrations").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!workspace?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!workspace?.id) throw new Error("No workspace");
      const { error } = await supabase.from("gateway_integrations").insert({
        workspace_id: workspace.id,
        provider: form.provider,
        name: form.name || PROVIDERS.find(p => p.value === form.provider)?.label || form.provider,
        credentials_encrypted: form.credentials,
        webhook_secret_encrypted: form.webhookSecret,
        environment: form.environment,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gateway_integrations"] });
      setDialogOpen(false);
      setForm({ provider: "stripe", name: "", credentials: "", webhookSecret: "", environment: "production" });
      toast.success("Integração criada com sucesso!");
    },
    onError: (e) => toast.error(String(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "active" ? "inactive" : "active";
      const { error } = await supabase.from("gateway_integrations").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gateway_integrations"] });
      toast.success("Status atualizado");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gateway_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gateway_integrations"] });
      toast.success("Integração removida");
    },
  });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const getWebhookUrl = (integrationId: string, provider: string) =>
    `${supabaseUrl}/functions/v1/gateway-webhook?workspace_id=${workspace?.id}&provider=${provider}&integration_id=${integrationId}`;

  const copyWebhookUrl = (integrationId: string, provider: string) => {
    navigator.clipboard.writeText(getWebhookUrl(integrationId, provider));
    toast.success("URL do webhook copiada!");
  };

  const brProviders = PROVIDERS.filter(p => p.country === "br");
  const intProviders = PROVIDERS.filter(p => p.country === "int");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
          <p className="text-muted-foreground text-sm mt-1">Conecte gateways de pagamento e plataformas de anúncio</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Adicionar Gateway</Button>
      </div>

      {/* Ad platforms */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Plataformas de Anúncio</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: "Meta Ads", emoji: "📘", desc: "Conversions API (CAPI)", status: "active" },
            { name: "Google Ads", emoji: "🔍", desc: "Offline Conversions (em breve)", status: "soon" },
            { name: "TikTok Ads", emoji: "🎵", desc: "Events API (em breve)", status: "soon" },
          ].map(p => (
            <Card key={p.name} className="glass-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{p.emoji}</span>
                  <div>
                    <p className="font-medium text-foreground text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                </div>
                <Badge variant="outline" className={p.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}>
                  {p.status === "active" ? "Ativo" : "Em breve"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Active integrations */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Gateways Conectados ({(integrations || []).length})</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (integrations || []).length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <Webhook className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-foreground font-medium">Nenhum gateway conectado</p>
              <p className="text-sm text-muted-foreground mt-1">Adicione um gateway para receber webhooks de pagamento</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(integrations || []).map(gi => {
              const prov = PROVIDERS.find(p => p.value === gi.provider);
              return (
                <Card key={gi.id} className="glass-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{prov?.emoji || "🔌"}</span>
                        <div>
                          <p className="font-medium text-foreground text-sm">{gi.name}</p>
                          <p className="text-xs text-muted-foreground">{prov?.label || gi.provider} · {gi.environment}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={gi.status === "active"}
                          onCheckedChange={() => toggleMutation.mutate({ id: gi.id, status: gi.status })}
                        />
                        <Button variant="ghost" size="sm" onClick={() => copyWebhookUrl(gi.id, gi.provider)} title="Copiar URL do Webhook">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(gi.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {/* Webhook URL */}
                    <div className="bg-muted/30 rounded-lg p-2.5 flex items-center gap-2">
                      <Webhook className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <code className="text-xs text-muted-foreground truncate flex-1">{getWebhookUrl(gi.id, gi.provider)}</code>
                      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyWebhookUrl(gi.id, gi.provider)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Adicionar Gateway de Pagamento</DialogTitle></DialogHeader>
          <Tabs defaultValue="br">
            <TabsList className="w-full">
              <TabsTrigger value="br" className="flex-1">🇧🇷 Brasil ({brProviders.length})</TabsTrigger>
              <TabsTrigger value="int" className="flex-1">🌎 Internacional ({intProviders.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="br">
              <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto">
                {brProviders.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setForm(f => ({ ...f, provider: p.value }))}
                    className={`p-2 rounded-lg border text-center text-xs transition-colors ${form.provider === p.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground/30"}`}
                  >
                    <span className="text-lg block">{p.emoji}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="int">
              <div className="grid grid-cols-3 gap-2 mt-2">
                {intProviders.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setForm(f => ({ ...f, provider: p.value }))}
                    className={`p-2 rounded-lg border text-center text-xs transition-colors ${form.provider === p.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground/30"}`}
                  >
                    <span className="text-lg block">{p.emoji}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Nome interno</Label>
              <Input placeholder={`Ex: ${PROVIDERS.find(p => p.value === form.provider)?.label} Produção`} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>API Key / Credenciais</Label>
              <Input type="password" placeholder="sk_live_..." value={form.credentials} onChange={e => setForm(f => ({ ...f, credentials: e.target.value }))} />
              {form.provider === "stripe" && (
                <InlineHelp
                  label="Onde encontrar a API Key do Stripe?"
                  steps={[
                    { text: "Acesse o Dashboard do Stripe" },
                    { text: "Vá em Developers → API Keys" },
                    { text: "Copie a Secret Key (sk_live_... ou sk_test_...)" },
                  ]}
                  note="Use sk_test_ para testes e sk_live_ para produção."
                  link={{ url: "https://dashboard.stripe.com/apikeys", label: "Abrir Stripe Dashboard" }}
                />
              )}
              {form.provider === "mercadopago" && (
                <InlineHelp
                  label="Onde encontrar o Access Token?"
                  steps={[
                    { text: "Acesse Mercado Pago Developers" },
                    { text: "Vá em Suas Integrações → Credenciais" },
                    { text: "Copie o Access Token de produção" },
                  ]}
                  link={{ url: "https://www.mercadopago.com.br/developers/panel/app", label: "Abrir Mercado Pago Developers" }}
                />
              )}
              {form.provider === "hotmart" && (
                <InlineHelp
                  label="Como configurar o Hotmart?"
                  steps={[
                    { text: "Acesse o painel da Hotmart" },
                    { text: "Vá em Ferramentas → Webhooks" },
                    { text: "Crie um novo webhook com o endpoint abaixo" },
                  ]}
                  snippet={`${supabaseUrl}/functions/v1/gateway-webhook`}
                  link={{ url: "https://app-vlc.hotmart.com/tools/webhook", label: "Abrir Hotmart Webhooks" }}
                />
              )}
            </div>
            <div>
              <Label>Webhook Secret (opcional)</Label>
              <Input type="password" placeholder="whsec_..." value={form.webhookSecret} onChange={e => setForm(f => ({ ...f, webhookSecret: e.target.value }))} />
              {form.provider === "stripe" && (
                <InlineHelp
                  label="Como obter o Webhook Secret?"
                  steps={[
                    { text: "No Stripe Dashboard, vá em Developers → Webhooks" },
                    { text: "Clique em Add Endpoint" },
                    { text: "Cole o endpoint do CapiTrack" },
                    { text: "Selecione: checkout.session.completed, payment_intent.succeeded" },
                    { text: "Copie o Signing Secret (whsec_...)" },
                  ]}
                  snippet={`${supabaseUrl}/functions/v1/gateway-webhook`}
                  link={{ url: "https://dashboard.stripe.com/webhooks", label: "Abrir Stripe Webhooks" }}
                />
              )}
            </div>
            <div>
              <Label>Ambiente</Label>
              <Select value={form.environment} onValueChange={v => setForm(f => ({ ...f, environment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Produção</SelectItem>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Integração"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
