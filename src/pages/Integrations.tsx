import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Copy, Trash2, Webhook, Play, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, AlertTriangle, Activity } from "lucide-react";
import { IntegrationDialog } from "@/components/integrations/IntegrationDialog";
import { PROVIDER_CONFIGS } from "@/lib/integration-help-config";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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

function HealthIndicator({ integrationId, workspaceId }: { integrationId: string; workspaceId: string }) {
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
        lastStatus: recentRes.data?.processing_status || null,
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
          Último evento: {formatDistanceToNow(new Date(data.lastEvent), { addSuffix: true, locale: ptBR })}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Nenhum evento recebido
        </span>
      )}
      {data.errorsLast24h > 0 && (
        <span className="flex items-center gap-1 text-destructive">
          <XCircle className="w-3 h-3" />
          {data.errorsLast24h} erro(s) 24h
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
        .select("id, received_at, event_type, processing_status, error_message, external_event_id")
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
    if (s === "duplicate") return <Clock className="w-3.5 h-3.5 text-amber-400" />;
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
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {log.processing_status}
          </Badge>
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
        workspace_id: workspace.id,
        provider: form.provider,
        name: form.name,
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
      const webhookUrl = getWebhookUrl(integrationId, provider);
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Teste enviado com sucesso!", { description: `Evento: ${data.internal_event || "ok"}` });
        queryClient.invalidateQueries({ queryKey: ["webhook_logs", integrationId] });
        queryClient.invalidateQueries({ queryKey: ["integration_health", integrationId] });
      } else {
        toast.error("Erro no teste", { description: data.error || "Falha ao enviar evento de teste" });
      }
    } catch (err) {
      toast.error("Erro de rede", { description: "Não foi possível conectar ao webhook" });
    } finally {
      setTestingId(null);
    }
  };

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
              const prov = PROVIDER_CONFIGS[gi.provider];
              const isExpanded = expandedLogs === gi.id;
              return (
                <Card key={gi.id} className="glass-card">
                  <CardContent className="p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{prov?.emoji || "🔌"}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground text-sm">{gi.name}</p>
                            <StatusBadge status={gi.status} />
                          </div>
                          <p className="text-xs text-muted-foreground">{prov?.label || gi.provider} · {gi.environment}</p>
                          <HealthIndicator integrationId={gi.id} workspaceId={workspace?.id || ""} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => testWebhook(gi.id, gi.provider)}
                          disabled={testingId === gi.id}
                        >
                          <Play className="w-3.5 h-3.5" />
                          {testingId === gi.id ? "Testando..." : "Testar"}
                        </Button>
                        <Switch checked={gi.status === "active"} onCheckedChange={() => toggleMutation.mutate({ id: gi.id, status: gi.status })} />
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

                    {/* Logs collapsible */}
                    <Collapsible open={isExpanded} onOpenChange={() => setExpandedLogs(isExpanded ? null : gi.id)}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground gap-1.5 justify-center">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {isExpanded ? "Ocultar logs" : "Ver logs recentes"}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <WebhookLogs integrationId={gi.id} />
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      <IntegrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
        supabaseUrl={supabaseUrl}
        workspaceId={workspace?.id || ""}
      />
    </div>
  );
}

// Build a realistic test payload per provider
function buildTestPayload(provider: string): Record<string, unknown> {
  const base = {
    event: "test_event",
    id: `test_${Date.now()}`,
    status: "approved",
    customer: { name: "Teste Usuario", email: "teste@exemplo.com", phone: "11999999999" },
    amount: 9990,
    currency: "BRL",
  };

  switch (provider) {
    case "stripe":
      return { type: "payment_intent.succeeded", id: `evt_test_${Date.now()}`, data: { object: { id: `pi_test`, amount: 9990, currency: "usd", status: "succeeded", customer_details: { email: "test@example.com", name: "Test User" } } } };
    case "mercadopago":
      return { action: "payment.approved", type: "payment", id: Date.now(), data: { id: `mp_test_${Date.now()}`, transaction_amount: 99.9, currency_id: "BRL", payer: { email: "teste@exemplo.com", first_name: "Teste" } } };
    case "hotmart":
      return { event: "PURCHASE_COMPLETE", hottok: "test", data: { buyer: { email: "teste@exemplo.com", name: "Teste" }, purchase: { transaction: `ht_test_${Date.now()}`, status: "COMPLETE", price: { value: 99.9, currency_value: "BRL" }, payment: { type: "CREDIT_CARD" } }, product: { name: "Produto Teste", id: "12345" } } };
    case "pagarme":
      return { type: "order.paid", data: { id: `pm_test_${Date.now()}`, status: "paid", amount: 9990, currency: "BRL", customer: { email: "teste@exemplo.com", name: "Teste" }, charges: [{ id: "ch_test", payment_method: "credit_card" }] } };
    default:
      return { ...base, event: "order_paid" };
  }
}
