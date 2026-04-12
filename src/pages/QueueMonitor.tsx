import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, Play, Inbox, CheckCircle2, AlertTriangle, XCircle,
  Clock, Zap, RotateCcw, Skull, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  queued: { color: "bg-sky-500/20 text-sky-400 border-sky-500/30", icon: Clock, label: "Na Fila" },
  processing: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Loader2, label: "Processando" },
  delivered: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, label: "Entregue" },
  retry: { color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: RotateCcw, label: "Retry" },
  failed: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertTriangle, label: "Falhou" },
  dead_letter: { color: "bg-red-700/20 text-red-500 border-red-700/30", icon: Skull, label: "Dead Letter" },
};

export default function QueueMonitor() {
  const { data: workspace } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState("all");
  const [isProcessing, setIsProcessing] = useState(false);

  // Queue stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["queue_stats", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return null;
      const statuses = ["queued", "processing", "delivered", "retry", "dead_letter"];
      const counts: Record<string, number> = {};
      for (const s of statuses) {
        const { count } = await supabase
          .from("event_queue")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id)
          .eq("status", s);
        counts[s] = count || 0;
      }
      return counts;
    },
    enabled: !!workspace?.id,
    refetchInterval: 15000,
  });

  // Queue items
  const { data: items, isLoading, refetch: refetchItems } = useQuery({
    queryKey: ["queue_items", workspace?.id, statusFilter],
    queryFn: async () => {
      if (!workspace?.id) return [];
      let q = supabase
        .from("event_queue")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data } = await q;
      return data || [];
    },
    enabled: !!workspace?.id,
  });

  // Dead letter items
  const { data: deadLetters } = useQuery({
    queryKey: ["dead_letters", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data } = await supabase
        .from("dead_letter_events")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!workspace?.id,
  });

  const refetchAll = () => { refetchStats(); refetchItems(); };

  const triggerWorker = async () => {
    if (!workspace?.id) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-events", {
        body: { workspace_id: workspace.id },
      });
      if (error) throw error;
      toast.success(`Worker executado: ${data.delivered || 0} entregues, ${data.failed || 0} retry, ${data.dead_lettered || 0} dead letter`);
      refetchAll();
    } catch (err) {
      toast.error("Erro ao executar worker: " + String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const totalQueued = (stats?.queued || 0) + (stats?.retry || 0);
  const totalProcessed = stats?.delivered || 0;
  const totalDead = stats?.dead_letter || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fila de Processamento</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento da fila de envio Meta CAPI com retry e dead letter
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetchAll} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </Button>
          <Button size="sm" onClick={triggerWorker} disabled={isProcessing} className="gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Executar Worker
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-sky-400" />
              <p className="text-xs text-muted-foreground">Na Fila</p>
            </div>
            <p className="text-2xl font-bold text-sky-400 mt-1">{stats?.queued || 0}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-orange-400" />
              <p className="text-xs text-muted-foreground">Retry</p>
            </div>
            <p className="text-2xl font-bold text-orange-400 mt-1">{stats?.retry || 0}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <p className="text-xs text-muted-foreground">Processando</p>
            </div>
            <p className="text-2xl font-bold text-amber-400 mt-1">{stats?.processing || 0}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-xs text-muted-foreground">Entregues</p>
            </div>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{totalProcessed}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Skull className="w-4 h-4 text-red-400" />
              <p className="text-xs text-muted-foreground">Dead Letter</p>
            </div>
            <p className="text-2xl font-bold text-red-400 mt-1">{totalDead}</p>
          </CardContent>
        </Card>
      </div>

      {/* Queue throughput info */}
      {totalQueued > 0 && (
        <Card className="glass-card border-sky-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-sky-400" />
            <div>
              <p className="text-sm font-medium text-foreground">{totalQueued} evento(s) aguardando processamento</p>
              <p className="text-xs text-muted-foreground">Worker automático roda a cada 1 minuto via pg_cron • Backoff: 30s → 2m → 8m → 30m → 2h</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter + Table */}
      <div className="flex gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="queued">Na Fila</SelectItem>
            <SelectItem value="retry">Retry</SelectItem>
            <SelectItem value="processing">Processando</SelectItem>
            <SelectItem value="delivered">Entregues</SelectItem>
            <SelectItem value="dead_letter">Dead Letter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Itens da Fila</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Próximo Retry</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead>Criado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : (items || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Inbox className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Fila vazia</p>
                  </TableCell>
                </TableRow>
              ) : (items || []).map(item => {
                const sc = statusConfig[item.status] || statusConfig.queued;
                const Icon = sc.icon;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.provider}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">{item.destination || "—"}</TableCell>
                    <TableCell className="text-xs">{(item.payload_json as any)?.marketing_event || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`${sc.color} gap-1 text-xs`}>
                        <Icon className="w-3 h-3" />{sc.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-center">{item.attempt_count}/{item.max_attempts}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.status === "retry" && item.next_retry_at
                        ? new Date(item.next_retry_at).toLocaleString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-red-400 max-w-[200px] truncate">{item.last_error || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dead Letter Section */}
      {(deadLetters || []).length > 0 && (
        <Card className="glass-card border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
              <Skull className="w-4 h-4" /> Dead Letter Queue ({deadLetters?.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead>Criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(deadLetters || []).map(dl => (
                  <TableRow key={dl.id}>
                    <TableCell className="font-mono text-xs">{dl.provider || "—"}</TableCell>
                    <TableCell className="text-xs">{dl.source_type}</TableCell>
                    <TableCell className="text-xs text-center">{dl.retry_count}</TableCell>
                    <TableCell className="text-xs text-red-400 max-w-[300px] truncate">{dl.error_message || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(dl.created_at).toLocaleString("pt-BR")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
