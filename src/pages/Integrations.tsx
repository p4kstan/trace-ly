import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Copy, Trash2, Webhook, Play, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, AlertTriangle, Activity,
  Send, Zap, BarChart3, TrendingUp,
} from "lucide-react";
import { IntegrationDialog } from "@/components/integrations/IntegrationDialog";
import { PROVIDER_CONFIGS } from "@/lib/integration-help-config";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Provider display config ──
const AD_PROVIDERS: Record<string, { label: string; emoji: string; desc: string; fields: { key: string; label: string; placeholder: string; secret?: boolean; help?: string; helpLink?: { url: string; label: string } }[] }> = {
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
      { key: "destination_id", label: "Conversion Action ID", placeholder: "123456789", help: "Google Ads → Metas → Ações de conversão → Clique na conversão → O ID numérico aparece na URL", helpLink: { url: "https://ads.google.com/aw/conversions", label: "Abrir Google Ads Conversões" } },
      { key: "access_token", label: "OAuth Access Token", placeholder: "ya29.xxxxxxx...", secret: true, help: "Gere um token OAuth 2.0 com escopo Google Ads via OAuth Playground", helpLink: { url: "https://developers.google.com/oauthplayground/", label: "Abrir OAuth Playground" } },
      { key: "customer_id", label: "Customer ID", placeholder: "123-456-7890", help: "Google Ads → Canto superior direito → O ID do cliente aparece no formato XXX-XXX-XXXX", helpLink: { url: "https://ads.google.com", label: "Abrir Google Ads" } },
      { key: "developer_token", label: "Developer Token", placeholder: "xxxxxxxxxxxxxxxx", secret: true, help: "Google Ads → Ferramentas → Centro de API → Token de desenvolvedor (requer conta MCC)", helpLink: { url: "https://ads.google.com/aw/apicenter", label: "Abrir Centro de API" } },
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
};

// ── Shared Components ──

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string; icon: typeof CheckCircle2 }> = {
    active: { label: "Ativo", class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
    inactive: { label: "Inativo", class: "bg-muted text-muted-foreground border-border", icon: Clock },
    error: { label: "Erro", class: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
    pending: { label: "Pendente", class: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  };
  const s = map[status] || map.pending;
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={`${s.class} gap-1`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </Badge>
  );
}

function HealthIndicator({ integrationId }: { integrationId: string }) {
  const { data } = useQuery({
    queryKey: ["integration_health", integrationId],
    queryFn: async () => {
      const [recentRes, errorRes] = await Promise.all([
        supabase.from("gateway_webhook_logs")
          .select("received_at, processing_status")
          .eq("gateway_integration_id", integrationId)
          .order("received_at", { ascending: false })
          .limit(1)
          .single(),
        supabase.from("gateway_webhook_logs")
          .select("id", { count: "exact", head: true })
          .eq("gateway_integration_id", integrationId)
          .in("processing_status", ["failed", "rejected"])
          .gte("received_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);
      return {
        lastEvent: recentRes.data?.received_at || null,
        errorsLast24h: errorRes.count || 0,
      };
    },
    enabled: !!integrationId,
    refetchInterval: 60000,
  });

  if (!data) return null;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
      {data.lastEvent ? (
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          Último: {formatDistanceToNow(new Date(data.lastEvent), { addSuffix: true, locale: ptBR })}
        </span>
      ) : (
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Sem eventos</span>
      )}
      {data.errorsLast24h > 0 && (
        <span className="flex items-center gap-1 text-destructive">
          <XCircle className="w-3 h-3" /> {data.errorsLast24h} erro(s) 24h
        </span>
      )}
    </div>
  );
}

function WebhookLogs({ integrationId }: { integrationId: string }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["webhook_logs", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("gateway_webhook_logs")
        .select("id, received_at, event_type, processing_status, error_message")
        .eq("gateway_integration_id", integrationId)
        .order("received_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!integrationId,
  });

  const statusIcon = (s: string) => {
    if (s === "processed") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (s === "failed" || s === "rejected") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Carregando logs...</p>;
  if (!logs?.length) return <p className="text-xs text-muted-foreground py-2">Nenhum log encontrado</p>;

  return (
    <div className="space-y-1.5 mt-2">
      {logs.map(log => (
        <div key={log.id} className="flex items-center gap-2 bg-muted/20 rounded px-2.5 py-1.5 text-xs">
          {statusIcon(log.processing_status)}
          <span className="font-mono text-muted-foreground">{log.event_type || "—"}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{log.processing_status}</Badge>
          {log.error_message && (
            <span className="text-destructive truncate max-w-[200px]" title={log.error_message}>
              {log.error_message.slice(0, 50)}
            </span>
          )}
          <span className="ml-auto text-muted-foreground/60 whitespace-nowrap">
            {formatDistanceToNow(new Date(log.received_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Ad Destinations Section (Google Ads, TikTok, GA4)
// ══════════════════════════════════════════════════════

function DestinationDialog({ open, onOpenChange, workspaceId }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState("google_ads");
  const [displayName, setDisplayName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const config = AD_PROVIDERS[provider];

  const mutation = useMutation({
    mutationFn: async () => {
      const destinationId = fields.destination_id;
      if (!destinationId) throw new Error("ID do destino é obrigatório");

      const configJson: Record<string, string> = {};
      if (fields.customer_id) configJson.customer_id = fields.customer_id.replace(/-/g, "");
      if (fields.developer_token) configJson.developer_token = fields.developer_token;
      if (fields.debug_mode) configJson.debug_mode = fields.debug_mode;

      const { error } = await supabase.from("integration_destinations").insert({
        workspace_id: workspaceId,
        provider,
        destination_id: destinationId,
        display_name: displayName || `${config.label} - ${destinationId}`,
        access_token_encrypted: fields.access_token || null,
        config_json: configJson,
        test_event_code: fields.test_event_code || null,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration_destinations"] });
      onOpenChange(false);
      setFields({});
      setDisplayName("");
      toast.success(`${config.label} adicionado com sucesso!`);
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-border/50 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Adicionar Destino de Conversão</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Plataforma</Label>
            <Select value={provider} onValueChange={(v) => { setProvider(v); setFields({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(AD_PROVIDERS).filter(([k]) => k !== "meta").map(([key, p]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">{p.emoji} {p.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Nome de exibição</Label>
            <Input
              placeholder={`Ex: ${config.label} Principal`}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {config.fields.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                type={f.secret ? "password" : "text"}
                placeholder={f.placeholder}
                value={fields[f.key] || ""}
                onChange={(e) => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
              />
              {f.help && (
                <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">📍</span>
                  {f.help}
                </p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
            <Plus className="w-4 h-4" />
            {mutation.isPending ? "Salvando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DestinationsSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: destinations, isLoading } = useQuery({
    queryKey: ["integration_destinations", workspaceId],
    queryFn: async () => {
      const { data } = await supabase.from("integration_destinations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!workspaceId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("integration_destinations")
        .update({ is_active: !isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration_destinations"] });
      toast.success("Status atualizado");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("integration_destinations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration_destinations"] });
      toast.success("Destino removido");
    },
  });

  // Delivery stats per destination
  const { data: deliveryStats } = useQuery({
    queryKey: ["destination_delivery_stats", workspaceId],
    queryFn: async () => {
      const { data } = await supabase.from("event_deliveries")
        .select("provider, destination, status")
        .eq("workspace_id", workspaceId)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const stats = new Map<string, { delivered: number; failed: number }>();
      for (const d of data || []) {
        const key = `${d.provider}::${d.destination}`;
        const s = stats.get(key) || { delivered: 0, failed: 0 };
        if (d.status === "delivered") s.delivered++;
        else s.failed++;
        stats.set(key, s);
      }
      return stats;
    },
    enabled: !!workspaceId,
    refetchInterval: 60000,
  });

  // Meta pixels count
  const { data: metaPixels } = useQuery({
    queryKey: ["meta_pixels_count", workspaceId],
    queryFn: async () => {
      const { data } = await supabase.from("meta_pixels")
        .select("id, pixel_id, is_active")
        .eq("workspace_id", workspaceId);
      return data || [];
    },
    enabled: !!workspaceId,
  });

  const activeMetaPixels = metaPixels?.filter(p => p.is_active) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Destinos de Conversão</h2>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Eventos são enviados automaticamente para todos os destinos ativos</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Adicionar Destino
        </Button>
      </div>

      {/* Meta CAPI (from meta_pixels — existing) */}
      {activeMetaPixels.length > 0 && (
        <Card className="glass-card border-primary/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📘</span>
                <div>
                  <p className="font-medium text-foreground text-sm">Meta Ads — CAPI</p>
                  <p className="text-xs text-muted-foreground">{activeMetaPixels.length} pixel(s) ativo(s)</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {deliveryStats && (() => {
                  let delivered = 0, failed = 0;
                  for (const p of activeMetaPixels) {
                    const s = deliveryStats.get(`meta::${p.pixel_id}`);
                    if (s) { delivered += s.delivered; failed += s.failed; }
                  }
                  return (
                    <div className="flex items-center gap-2 text-xs">
                      {delivered > 0 && <span className="text-emerald-400 flex items-center gap-1"><Send className="w-3 h-3" />{delivered} enviados</span>}
                      {failed > 0 && <span className="text-destructive flex items-center gap-1"><XCircle className="w-3 h-3" />{failed} falhas</span>}
                    </div>
                  );
                })()}
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Ativo</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other providers from integration_destinations */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <Card key={i} className="glass-card"><CardContent className="p-4"><div className="h-12 animate-pulse bg-muted/20 rounded" /></CardContent></Card>
          ))}
        </div>
      ) : (destinations || []).length === 0 && activeMetaPixels.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Send className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">Nenhum destino configurado</p>
            <p className="text-sm text-muted-foreground mt-1">Adicione destinos para enviar conversões automaticamente</p>
            <Button onClick={() => setDialogOpen(true)} className="mt-4 gap-2"><Plus className="w-4 h-4" /> Adicionar Destino</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(destinations || []).map(dest => {
            const prov = AD_PROVIDERS[dest.provider];
            const statsKey = `${dest.provider}::${dest.destination_id}`;
            const stats = deliveryStats?.get(statsKey);

            return (
              <Card key={dest.id} className="glass-card hover-lift transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{prov?.emoji || "📡"}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground text-sm">{dest.display_name || prov?.label}</p>
                          <Badge variant="outline" className={dest.is_active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1" : "gap-1"}>
                            {dest.is_active ? <><Zap className="w-3 h-3" /> Ativo</> : "Inativo"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{prov?.label} · <code className="font-mono">{dest.destination_id}</code></p>
                        {dest.events_sent_count > 0 && (
                          <p className="text-xs text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            {dest.events_sent_count.toLocaleString("pt-BR")} eventos enviados
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stats && (
                        <div className="flex items-center gap-2 text-xs mr-2">
                          {stats.delivered > 0 && <span className="text-emerald-400">{stats.delivered} <span className="text-muted-foreground/60">24h</span></span>}
                          {stats.failed > 0 && <span className="text-destructive">{stats.failed} falhas</span>}
                        </div>
                      )}
                      <Switch
                        checked={dest.is_active}
                        onCheckedChange={() => toggleMutation.mutate({ id: dest.id, isActive: dest.is_active })}
                      />
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(dest.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DestinationDialog open={dialogOpen} onOpenChange={setDialogOpen} workspaceId={workspaceId} />
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════

export default function Integrations() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

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
    mutationFn: async (form: { provider: string; name: string; credentials: string; webhookSecret: string; environment: string }) => {
      if (!workspace?.id) throw new Error("No workspace");
      const { error } = await supabase.from("gateway_integrations").insert({
        workspace_id: workspace.id, provider: form.provider, name: form.name,
        credentials_encrypted: form.credentials, webhook_secret_encrypted: form.webhookSecret,
        environment: form.environment, status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gateway_integrations"] });
      setDialogOpen(false);
      toast.success("Integração criada com sucesso!");
    },
    onError: (e) => toast.error(String(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("gateway_integrations").update({ status: status === "active" ? "inactive" : "active" }).eq("id", id);
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

  const testWebhook = async (integrationId: string, provider: string) => {
    setTestingId(integrationId);
    try {
      const testPayload = buildTestPayload(provider);
      const res = await fetch(getWebhookUrl(integrationId, provider), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Teste enviado!", { description: `Evento: ${data.internal_event || "ok"}` });
        queryClient.invalidateQueries({ queryKey: ["webhook_logs", integrationId] });
        queryClient.invalidateQueries({ queryKey: ["integration_health", integrationId] });
      } else {
        toast.error("Erro no teste", { description: data.error || "Falha" });
      }
    } catch {
      toast.error("Erro de rede");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground text-sm mt-1">Gateways de pagamento e plataformas de conversão</p>
      </div>

      <Tabs defaultValue="destinations" className="w-full">
        <TabsList className="glass-card">
          <TabsTrigger value="destinations" className="gap-2"><TrendingUp className="w-4 h-4" /> Destinos de Conversão</TabsTrigger>
          <TabsTrigger value="gateways" className="gap-2"><Webhook className="w-4 h-4" /> Gateways de Pagamento</TabsTrigger>
        </TabsList>

        {/* ── Tab: Conversion Destinations ── */}
        <TabsContent value="destinations" className="mt-4">
          {workspace?.id && <DestinationsSection workspaceId={workspace.id} />}
        </TabsContent>

        {/* ── Tab: Payment Gateways ── */}
        <TabsContent value="gateways" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Gateways Conectados ({(integrations || []).length})</h2>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2"><Plus className="w-3.5 h-3.5" /> Adicionar Gateway</Button>
          </div>

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
                const prov = PROVIDER_CONFIGS[gi.provider];
                const isExpanded = expandedLogs === gi.id;
                return (
                  <Card key={gi.id} className="glass-card">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{prov?.emoji || "🔌"}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground text-sm">{gi.name}</p>
                              <StatusBadge status={gi.status} />
                            </div>
                            <p className="text-xs text-muted-foreground">{prov?.label || gi.provider} · {gi.environment}</p>
                            <HealthIndicator integrationId={gi.id} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                            onClick={() => testWebhook(gi.id, gi.provider)} disabled={testingId === gi.id}>
                            <Play className="w-3.5 h-3.5" />
                            {testingId === gi.id ? "Testando..." : "Testar"}
                          </Button>
                          <Switch checked={gi.status === "active"} onCheckedChange={() => toggleMutation.mutate({ id: gi.id, status: gi.status })} />
                          <Button variant="ghost" size="sm" onClick={() => copyWebhookUrl(gi.id, gi.provider)}><Copy className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(gi.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </div>

                      <div className="bg-muted/30 rounded-lg p-2.5 flex items-center gap-2">
                        <Webhook className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <code className="text-xs text-muted-foreground truncate flex-1">{getWebhookUrl(gi.id, gi.provider)}</code>
                        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyWebhookUrl(gi.id, gi.provider)}><Copy className="w-3 h-3" /></Button>
                      </div>

                      <Collapsible open={isExpanded} onOpenChange={() => setExpandedLogs(isExpanded ? null : gi.id)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground gap-1.5 justify-center">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {isExpanded ? "Ocultar logs" : "Ver logs recentes"}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent><WebhookLogs integrationId={gi.id} /></CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <IntegrationDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
        supabaseUrl={supabaseUrl} workspaceId={workspace?.id || ""}
      />
    </div>
  );
}

function buildTestPayload(provider: string): Record<string, unknown> {
  const base = { event: "test_event", id: `test_${Date.now()}`, status: "approved", customer: { name: "Teste Usuario", email: "teste@exemplo.com", phone: "11999999999" }, amount: 9990, currency: "BRL" };
  switch (provider) {
    case "stripe": return { type: "payment_intent.succeeded", id: `evt_test_${Date.now()}`, data: { object: { id: `pi_test`, amount: 9990, currency: "usd", status: "succeeded", customer_details: { email: "test@example.com", name: "Test User" } } } };
    case "hotmart": return { event: "PURCHASE_COMPLETE", hottok: "test", data: { buyer: { email: "teste@exemplo.com", name: "Teste" }, purchase: { transaction: `ht_test_${Date.now()}`, status: "COMPLETE", price: { value: 99.9, currency_value: "BRL" }, payment: { type: "CREDIT_CARD" } }, product: { name: "Produto Teste", id: "12345" } } };
    default: return { ...base, event: "order_paid" };
  }
}
