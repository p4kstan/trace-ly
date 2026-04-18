/**
 * Compact list of the latest 10 webhook log entries for a gateway integration.
 */
import { useWebhookLogs } from "@/hooks/api/use-integrations";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function statusIcon(s: string) {
  if (s === "processed") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (s === "failed" || s === "rejected") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

export function WebhookLogsList({ integrationId }: { integrationId: string }) {
  const { data: logs, isLoading } = useWebhookLogs(integrationId);

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Carregando logs...</p>;
  if (!logs?.length) return <p className="text-xs text-muted-foreground py-2">Nenhum log encontrado</p>;

  return (
    <div className="space-y-1.5 mt-2">
      {logs.map((log) => (
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
