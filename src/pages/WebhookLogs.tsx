import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, Webhook, Search, RefreshCw } from "lucide-react";

const statusColors: Record<string, string> = {
  processed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  processing: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  duplicate: "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

export default function WebhookLogs() {
  const { data: workspace } = useWorkspace();
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["gateway_webhook_logs", workspace?.id, providerFilter, statusFilter],
    queryFn: async () => {
      if (!workspace?.id) return [];
      let q = supabase
        .from("gateway_webhook_logs")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("received_at", { ascending: false })
        .limit(200);
      if (providerFilter !== "all") q = q.eq("provider", providerFilter);
      if (statusFilter !== "all") q = q.eq("processing_status", statusFilter);
      const { data } = await q;
      return data || [];
    },
    enabled: !!workspace?.id,
  });

  const filtered = (logs || []).filter(l =>
    !search ||
    l.event_type?.toLowerCase().includes(search.toLowerCase()) ||
    l.external_event_id?.toLowerCase().includes(search.toLowerCase()) ||
    l.provider?.toLowerCase().includes(search.toLowerCase())
  );

  const providers = [...new Set((logs || []).map(l => l.provider))];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Webhook Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">Payloads recebidos dos gateways de pagamento</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold text-foreground">{(logs || []).length}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Processados</p>
          <p className="text-xl font-bold text-emerald-400">{(logs || []).filter(l => l.processing_status === "processed").length}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Duplicados</p>
          <p className="text-xl font-bold text-sky-400">{(logs || []).filter(l => l.processing_status === "duplicate").length}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Falhas</p>
          <p className="text-xl font-bold text-red-400">{(logs || []).filter(l => l.processing_status === "failed").length}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por evento, ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Gateway" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos gateways</SelectItem>
            {providers.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="processed">Processado</SelectItem>
            <SelectItem value="processing">Processando</SelectItem>
            <SelectItem value="failed">Falha</SelectItem>
            <SelectItem value="duplicate">Duplicado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gateway</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>External ID</TableHead>
                <TableHead>Assinatura</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Recebido</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Webhook className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Nenhum webhook recebido</p>
                  </TableCell>
                </TableRow>
              ) : filtered.map(log => (
                <LogRow key={log.id} log={log} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LogRow({ log }: { log: any }) {
  const [open, setOpen] = useState(false);
  const status = String(log.processing_status || "pending");

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/10" onClick={() => setOpen(!open)}>
        <TableCell className="font-mono text-xs font-medium">{log.provider}</TableCell>
        <TableCell className="text-xs">{log.event_type || "—"}</TableCell>
        <TableCell className="text-xs font-mono max-w-[100px] truncate">{log.external_event_id || "—"}</TableCell>
        <TableCell>
          <Badge variant="outline" className={log.signature_valid ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
            {log.signature_valid ? "✓" : "✗"}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={statusColors[status] || ""}>{status}</Badge>
        </TableCell>
        <TableCell className="text-xs text-center">{log.processing_attempts}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{new Date(log.received_at).toLocaleString("pt-BR")}</TableCell>
        <TableCell><ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} /></TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/20 p-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Payload:</p>
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-auto max-h-48 bg-muted/30 rounded p-2">
                {JSON.stringify(log.payload_json, null, 2)}
              </pre>
              {log.error_message && (
                <p className="text-xs text-red-400">Erro: {log.error_message}</p>
              )}
              {log.processed_at && (
                <p className="text-xs text-muted-foreground">Processado em: {new Date(log.processed_at).toLocaleString("pt-BR")}</p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
