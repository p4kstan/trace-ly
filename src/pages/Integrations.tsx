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
import { toast } from "@/hooks/use-toast";
import { Plus, Copy, CheckCircle, XCircle, Trash2, ExternalLink, Webhook } from "lucide-react";

const PROVIDERS = [
  { value: "stripe", label: "Stripe", emoji: "💳" },
  { value: "mercadopago", label: "Mercado Pago", emoji: "🟡" },
  { value: "pagarme", label: "Pagar.me", emoji: "🟢" },
  { value: "asaas", label: "Asaas", emoji: "🔵" },
  { value: "hotmart", label: "Hotmart", emoji: "🔥" },
  { value: "monetizze", label: "Monetizze", emoji: "💰" },
  { value: "eduzz", label: "Eduzz", emoji: "📚" },
  { value: "appmax", label: "Appmax", emoji: "📱" },
  { value: "cakto", label: "Cakto", emoji: "🎯" },
  { value: "kirvano", label: "Kirvano", emoji: "🚀" },
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
        name: form.name || form.provider,
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
      toast({ title: "Integração criada" });
    },
    onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gateway_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gateway_integrations"] });
      toast({ title: "Integração removida" });
    },
  });

  const webhookUrl = workspace?.id
    ? `${window.location.origin.replace("id-preview--", "").replace(".lovable.app", ".supabase.co")}/functions/v1/gateway-webhook?workspace_id=${workspace.id}&provider=`
    : "";

  const copyWebhookUrl = (provider: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = `${supabaseUrl}/functions/v1/gateway-webhook?workspace_id=${workspace?.id}&provider=${provider}`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL copiada!" });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gateway Integrations</h1>
          <p className="text-muted-foreground text-sm mt-1">Conecte gateways de pagamento para rastrear conversões</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Adicionar Gateway</Button>
      </div>

      {/* Ad platforms section */}
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

      {/* Payment gateways */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Gateways de Pagamento</h2>
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
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{prov?.emoji || "🔌"}</span>
                      <div>
                        <p className="font-medium text-foreground text-sm">{gi.name}</p>
                        <p className="text-xs text-muted-foreground">{gi.provider} · {gi.environment}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={gi.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}>
                        {gi.status === "active" ? <><CheckCircle className="w-3 h-3 mr-1" />Ativo</> : <><XCircle className="w-3 h-3 mr-1" />Inativo</>}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => copyWebhookUrl(gi.provider)} title="Copiar URL do Webhook">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(gi.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
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
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Gateway</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Provedor</Label>
              <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.emoji} {p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome interno</Label>
              <Input placeholder="Ex: Stripe Produção" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>API Key / Credenciais</Label>
              <Input type="password" placeholder="sk_live_..." value={form.credentials} onChange={e => setForm(f => ({ ...f, credentials: e.target.value }))} />
            </div>
            <div>
              <Label>Webhook Secret</Label>
              <Input type="password" placeholder="whsec_..." value={form.webhookSecret} onChange={e => setForm(f => ({ ...f, webhookSecret: e.target.value }))} />
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
