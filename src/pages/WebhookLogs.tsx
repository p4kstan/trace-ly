import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Webhook } from "lucide-react";
import { useState } from "react";

export default function WebhookLogs() {
  const { data: workspace } = useWorkspace();

  const { data: logs, isLoading } = useQuery({
    queryKey: ["webhook_logs", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data } = await supabase
        .from("webhook_logs")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("received_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!workspace?.id,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Webhook Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Payloads recebidos dos gateways de pagamento</p>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gateway</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Assinatura</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recebido</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : (logs || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Webhook className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Nenhum webhook recebido ainda</p>
                  </TableCell>
                </TableRow>
              ) : (logs || []).map(log => (
                <LogRow key={log.id} log={log} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LogRow({ log }: { log: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const status = String(log.processing_status || "received");

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(!open)}>
        <TableCell className="font-mono text-xs">{String(log.gateway)}</TableCell>
        <TableCell className="text-xs">{String(log.event_type || "—")}</TableCell>
        <TableCell>
          <Badge variant="outline" className={log.signature_valid ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
            {log.signature_valid ? "Válida" : "Inválida"}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={status === "processed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}>
            {status}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{new Date(String(log.received_at)).toLocaleString("pt-BR")}</TableCell>
        <TableCell><ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} /></TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20 p-4">
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-auto max-h-48">
              {JSON.stringify(log.payload_json, null, 2)}
            </pre>
            {log.error_message && <p className="text-xs text-red-400 mt-2">Erro: {String(log.error_message)}</p>}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
