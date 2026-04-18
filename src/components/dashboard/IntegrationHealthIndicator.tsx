/**
 * Inline health indicator showing last event timestamp + 24h error count
 * for a gateway integration.
 */
import { useIntegrationHealth } from "@/hooks/api/use-integrations";
import { Activity, Clock, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function IntegrationHealthIndicator({ integrationId }: { integrationId: string }) {
  const { data } = useIntegrationHealth(integrationId);
  if (!data) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
      {data.lastEvent ? (
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          Último: {formatDistanceToNow(new Date(data.lastEvent), { addSuffix: true, locale: ptBR })}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> Sem eventos
        </span>
      )}
      {data.errorsLast24h > 0 && (
        <span className="flex items-center gap-1 text-destructive">
          <XCircle className="w-3 h-3" /> {data.errorsLast24h} erro(s) 24h
        </span>
      )}
    </div>
  );
}
