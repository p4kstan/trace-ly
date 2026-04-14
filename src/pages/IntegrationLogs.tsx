import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, CheckCircle, XCircle, Eye } from "lucide-react";

const PAGE_SIZE = 50;

export default function IntegrationLogs() {
  const { data: workspace } = useWorkspace();
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["integration-logs", workspace?.id, providerFilter, statusFilter],
    enabled: !!workspace?.id,
    refetchInterval: 10000,
    queryFn: async () => {
      let query = supabase
        .from("integration_logs")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (providerFilter !== "all") query = query.eq("provider", providerFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, count, error } = await query;
      if (error) throw error;
      return { logs: data || [], count: count || 0 };
    },
  });

  const logs = data?.logs || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">Integration Logs</h1>
          <p className="text-sm text-muted-foreground">
            Logs de entrega de eventos para cada destino • {data?.count || 0} registros
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos providers</SelectItem>
            <SelectItem value="meta">Meta</SelectItem>
            <SelectItem value="ga4">GA4</SelectItem>
            <SelectItem value="google_ads">Google Ads</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="delivered">Entregue</SelectItem>
            <SelectItem value="failed">Falha</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Provider</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-20">HTTP</TableHead>
                <TableHead className="w-20">Latência</TableHead>
                <TableHead className="w-40">Data</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-muted/30 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Nenhum log encontrado
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log: any) => (
                  <TableRow key={log.id} className="hover:bg-muted/10">
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{log.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.event_name || "-"}</TableCell>
                    <TableCell>
                      {log.status === "delivered" ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                          <CheckCircle className="w-3 h-3 mr-1" /> OK
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          <XCircle className="w-3 h-3 mr-1" /> Falha
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{log.status_code || "-"}</TableCell>
                    <TableCell className="text-xs tabular-nums">{log.latency_ms ? `${log.latency_ms}ms` : "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedLog(log)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="glass-card max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Log</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Provider:</span> {selectedLog.provider}</div>
                <div><span className="text-muted-foreground">Status:</span> {selectedLog.status}</div>
                <div><span className="text-muted-foreground">HTTP:</span> {selectedLog.status_code}</div>
                <div><span className="text-muted-foreground">Latência:</span> {selectedLog.latency_ms}ms</div>
              </div>
              {selectedLog.error_message && (
                <div>
                  <p className="text-sm font-medium text-destructive mb-1">Erro</p>
                  <pre className="bg-destructive/10 text-xs p-3 rounded-lg overflow-x-auto">{selectedLog.error_message}</pre>
                </div>
              )}
              {selectedLog.request_json && (
                <div>
                  <p className="text-sm font-medium mb-1">Request</p>
                  <pre className="bg-muted/30 text-xs p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(selectedLog.request_json, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.response_json && (
                <div>
                  <p className="text-sm font-medium mb-1">Response</p>
                  <pre className="bg-muted/30 text-xs p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(selectedLog.response_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
