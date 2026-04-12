import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Flag, AlertTriangle, RotateCcw, Plus, CheckCircle2, XCircle,
  Clock, Bell, BellOff, Play, Shield, TrendingUp, TrendingDown,
  AlertCircle, Loader2,
} from "lucide-react";

// ═══════════════════════════════════════════
// Feature Flags Tab
// ═══════════════════════════════════════════

function FeatureFlagsTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFlag, setNewFlag] = useState({ flag_key: "", label: "", description: "" });

  const { data: flags, isLoading } = useQuery({
    queryKey: ["feature_flags", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("feature_flags")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!workspaceId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("feature_flags")
        .update({ enabled: !enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature_flags"] });
      toast.success("Flag atualizada");
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newFlag.flag_key) throw new Error("Key é obrigatória");
      const { error } = await supabase.from("feature_flags").insert({
        workspace_id: workspaceId,
        flag_key: newFlag.flag_key,
        label: newFlag.label || newFlag.flag_key,
        description: newFlag.description,
        enabled: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature_flags"] });
      setDialogOpen(false);
      setNewFlag({ flag_key: "", label: "", description: "" });
      toast.success("Feature flag criada");
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feature_flags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature_flags"] });
      toast.success("Flag removida");
    },
  });

  const defaultFlags = [
    { key: "enable_meta_capi", label: "Meta CAPI", desc: "Enviar eventos para Meta Conversions API" },
    { key: "enable_google_ads", label: "Google Ads", desc: "Enviar conversões para Google Ads" },
    { key: "enable_tiktok", label: "TikTok Events", desc: "Enviar eventos para TikTok" },
    { key: "enable_ga4", label: "GA4 Measurement Protocol", desc: "Enviar eventos para Google Analytics 4" },
    { key: "enable_attribution", label: "Attribution Engine", desc: "Computar atribuição multi-touch" },
    { key: "enable_anomaly_detection", label: "Anomaly Detection", desc: "Detecção automática de anomalias" },
    { key: "enable_event_replay", label: "Event Replay", desc: "Permitir replay de eventos da dead letter" },
    { key: "enable_data_warehouse", label: "Data Warehouse Sync", desc: "Sincronizar eventos com BigQuery/Snowflake" },
  ];

  const existingKeys = new Set((flags || []).map(f => f.flag_key));
  const missingDefaults = defaultFlags.filter(d => !existingKeys.has(d.key));

  const seedMutation = useMutation({
    mutationFn: async () => {
      const inserts = missingDefaults.map(d => ({
        workspace_id: workspaceId,
        flag_key: d.key,
        label: d.label,
        description: d.desc,
        enabled: true,
      }));
      const { error } = await supabase.from("feature_flags").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature_flags"] });
      toast.success("Flags padrão criadas");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Feature Flags</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Controle funcionalidades por workspace</p>
        </div>
        <div className="flex gap-2">
          {missingDefaults.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Shield className="w-3.5 h-3.5 mr-1.5" />
              Criar padrões ({missingDefaults.length})
            </Button>
          )}
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova Flag
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/20 rounded-lg animate-pulse" />)}</div>
      ) : !flags?.length ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Flag className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">Nenhuma feature flag</p>
            <p className="text-sm text-muted-foreground mt-1">Crie flags para controlar funcionalidades</p>
            <Button className="mt-4" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Shield className="w-4 h-4 mr-2" /> Criar flags padrão
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {flags.map(flag => (
            <Card key={flag.id} className="glass-card border-border/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Flag className={`w-4 h-4 ${flag.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{flag.label || flag.flag_key}</p>
                      <Badge variant="outline" className="text-[10px] font-mono">{flag.flag_key}</Badge>
                    </div>
                    {flag.description && <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={() => toggleMutation.mutate({ id: flag.id, enabled: flag.enabled })}
                  />
                  <Button variant="ghost" size="sm" className="text-destructive h-8 w-8 p-0"
                    onClick={() => deleteMutation.mutate(flag.id)}>
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Feature Flag</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Key (identificador)</Label><Input placeholder="ex: enable_new_pipeline" value={newFlag.flag_key} onChange={e => setNewFlag(p => ({ ...p, flag_key: e.target.value }))} className="mt-1" /></div>
            <div><Label>Label</Label><Input placeholder="Nome amigável" value={newFlag.label} onChange={e => setNewFlag(p => ({ ...p, label: e.target.value }))} className="mt-1" /></div>
            <div><Label>Descrição</Label><Input placeholder="O que esta flag controla" value={newFlag.description} onChange={e => setNewFlag(p => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════
// Anomaly Alerts Tab
// ═══════════════════════════════════════════

function AnomalyAlertsTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["anomaly_alerts", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("anomaly_alerts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("detected_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!workspaceId,
    refetchInterval: 30000,
  });

  const ackMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("anomaly_alerts")
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anomaly_alerts"] });
      toast.success("Alerta reconhecido");
    },
  });

  const runDetection = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("anomaly-detection", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anomaly_alerts"] });
      toast.success("Detecção executada");
    },
    onError: (e) => toast.error(String(e)),
  });

  const severityConfig: Record<string, { icon: typeof AlertTriangle; class: string }> = {
    critical: { icon: AlertCircle, class: "text-destructive" },
    warning: { icon: AlertTriangle, class: "text-amber-400" },
    info: { icon: Bell, class: "text-primary" },
  };

  const metricIcon = (name: string) => {
    if (name.includes("spike")) return <TrendingUp className="w-4 h-4 text-destructive" />;
    if (name.includes("drop")) return <TrendingDown className="w-4 h-4 text-amber-400" />;
    return <AlertTriangle className="w-4 h-4 text-muted-foreground" />;
  };

  const unacknowledged = alerts?.filter(a => !a.acknowledged) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            Anomaly Detection
            {unacknowledged.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">{unacknowledged.length} novos</Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Detecção automática de spikes, drops e falhas</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => runDetection.mutate()} disabled={runDetection.isPending}>
          {runDetection.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          Executar Agora
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-muted/20 rounded-lg animate-pulse" />)}</div>
      ) : !alerts?.length ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">Nenhuma anomalia detectada</p>
            <p className="text-sm text-muted-foreground mt-1">O sistema está monitorando continuamente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map(alert => {
            const sev = severityConfig[alert.severity] || severityConfig.warning;
            const SevIcon = sev.icon;
            return (
              <Card key={alert.id} className={`glass-card ${!alert.acknowledged ? "border-l-2 border-l-amber-500" : "border-border/30 opacity-60"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {metricIcon(alert.metric_name)}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{alert.message}</p>
                          <Badge variant="outline" className={`text-[10px] ${sev.class}`}>
                            <SevIcon className="w-2.5 h-2.5 mr-0.5" />
                            {alert.severity}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Esperado: ~{alert.expected_value}</span>
                          <span>Atual: {alert.actual_value}</span>
                          <span>Desvio: {alert.deviation_percent}%</span>
                          <span>{formatDistanceToNow(new Date(alert.detected_at), { addSuffix: true, locale: ptBR })}</span>
                        </div>
                      </div>
                    </div>
                    {!alert.acknowledged && (
                      <Button variant="ghost" size="sm" onClick={() => ackMutation.mutate(alert.id)} className="shrink-0">
                        <BellOff className="w-3.5 h-3.5 mr-1" /> Ack
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Event Replay Tab
// ═══════════════════════════════════════════

function EventReplayTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [filterProvider, setFilterProvider] = useState("all");

  const { data: deadLetterCount } = useQuery({
    queryKey: ["dead_letter_count", workspaceId],
    queryFn: async () => {
      const { count } = await supabase
        .from("dead_letter_events")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      return count || 0;
    },
    enabled: !!workspaceId,
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["event_replay_jobs", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_replay_jobs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!workspaceId,
    refetchInterval: 5000,
  });

  const replayMutation = useMutation({
    mutationFn: async () => {
      const filterJson: Record<string, string> = {};
      if (filterProvider !== "all") filterJson.provider = filterProvider;

      // Create job
      const { data: job, error: jobErr } = await supabase
        .from("event_replay_jobs")
        .insert({
          workspace_id: workspaceId,
          filter_json: filterJson,
          status: "pending",
        })
        .select()
        .single();

      if (jobErr || !job) throw new Error("Falha ao criar job de replay");

      // Trigger edge function
      const { error } = await supabase.functions.invoke("event-replay", {
        body: { job_id: job.id, workspace_id: workspaceId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event_replay_jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dead_letter_count"] });
      toast.success("Replay iniciado");
    },
    onError: (e) => toast.error(String(e)),
  });

  const statusConfig: Record<string, { label: string; class: string; icon: typeof Clock }> = {
    pending: { label: "Pendente", class: "text-muted-foreground", icon: Clock },
    running: { label: "Executando", class: "text-primary", icon: Loader2 },
    completed: { label: "Concluído", class: "text-emerald-400", icon: CheckCircle2 },
    failed: { label: "Falhou", class: "text-destructive", icon: XCircle },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Event Replay</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Re-processar eventos da dead letter queue</p>
        </div>
        <Badge variant="outline" className="text-xs">
          <RotateCcw className="w-3 h-3 mr-1" />
          {deadLetterCount} eventos na DLQ
        </Badge>
      </div>

      {/* Replay Controls */}
      <Card className="glass-card border-primary/10">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-xs">Filtrar por provider</Label>
              <Select value={filterProvider} onValueChange={setFilterProvider}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="meta">Meta CAPI</SelectItem>
                  <SelectItem value="google_ads">Google Ads</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="ga4">GA4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => replayMutation.mutate()}
              disabled={replayMutation.isPending || !deadLetterCount}
              className="mt-5"
            >
              {replayMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Iniciar Replay
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Jobs History */}
      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-muted/20 rounded-lg animate-pulse" />)}</div>
      ) : !jobs?.length ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum replay executado ainda</p>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => {
            const sc = statusConfig[job.status] || statusConfig.pending;
            const StatusIcon = sc.icon;
            return (
              <Card key={job.id} className="glass-card border-border/30">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIcon className={`w-4 h-4 ${sc.class} ${job.status === "running" ? "animate-spin" : ""}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${sc.class}`}>{sc.label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>Total: {job.total_events}</span>
                        <span className="text-emerald-400">Replay: {job.replayed_events}</span>
                        {(job.failed_events || 0) > 0 && <span className="text-destructive">Falhas: {job.failed_events}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════

export default function EnterprisePage() {
  const { data: workspace } = useWorkspace();

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Enterprise</h1>
        <p className="text-sm text-muted-foreground">Feature flags, anomaly detection e event replay</p>
      </div>

      <Tabs defaultValue="flags">
        <TabsList>
          <TabsTrigger value="flags" className="gap-1.5"><Flag className="w-3.5 h-3.5" /> Feature Flags</TabsTrigger>
          <TabsTrigger value="anomalies" className="gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Anomalias</TabsTrigger>
          <TabsTrigger value="replay" className="gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Event Replay</TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="mt-4">
          <FeatureFlagsTab workspaceId={workspace.id} />
        </TabsContent>
        <TabsContent value="anomalies" className="mt-4">
          <AnomalyAlertsTab workspaceId={workspace.id} />
        </TabsContent>
        <TabsContent value="replay" className="mt-4">
          <EventReplayTab workspaceId={workspace.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
