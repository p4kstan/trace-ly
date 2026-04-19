import { useState } from "react";
import { CheckCircle, XCircle, Clock, ArrowRight, Inbox } from "lucide-react";
import { useWorkspace, useEventDeliveries } from "@/hooks/use-tracking-data";
import { Skeleton } from "@/components/ui/skeleton";
import { LoopDetectionPanel } from "@/components/debugger/LoopDetectionPanel";
import type { Json } from "@/integrations/supabase/types";

export default function Debugger() {
  const { data: workspace } = useWorkspace();
  const { data: deliveries, isLoading } = useEventDeliveries(workspace?.id, 20);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = deliveries?.find(d => d.id === selectedId) || deliveries?.[0];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Depurador de Eventos</h1>
          <p className="text-muted-foreground text-sm mt-1">Inspecione payloads de eventos e respostas da API</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Depurador de Eventos</h1>
        <p className="text-muted-foreground text-sm mt-1">Inspecione payloads de eventos e respostas da API</p>
      </div>

      <LoopDetectionPanel />

      {!deliveries?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Inbox className="w-16 h-16 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma entrega registrada</h3>
          <p className="text-sm text-center max-w-sm">
            Configure um pixel e envie eventos para ver os payloads e respostas aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] items-start">
          <div className="space-y-2 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1 min-w-0">
            {deliveries.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={`w-full text-left glass-card p-4 transition-all ${
                  selected?.id === d.id ? "ring-1 ring-primary glow-primary" : "hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground text-sm break-words">{d.provider}</span>
                  {d.status === "delivered" ? (
                    <CheckCircle className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  )}
                </div>
                <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  <p className="break-all">{d.destination || "—"}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{new Date(d.created_at).toLocaleTimeString()}</span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>tentativa {d.attempt_count}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="space-y-4 min-w-0">
              <div className="glass-card p-4 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Requisição</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-primary break-all">{selected.provider} — {selected.destination}</span>
                </div>
                <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono text-foreground overflow-auto max-h-[28rem] whitespace-pre-wrap break-words">
                  {JSON.stringify(selected.request_json as Json, null, 2)}
                </pre>
              </div>

              <div className="glass-card p-4 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Resposta</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    selected.status === "delivered" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                  }`}>
                    {selected.status}
                  </span>
                </div>
                <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono text-foreground overflow-auto max-h-[28rem] whitespace-pre-wrap break-words">
                  {JSON.stringify(selected.response_json as Json, null, 2)}
                </pre>
                {selected.error_message && (
                  <p className="mt-2 text-xs text-destructive break-words">{selected.error_message}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
