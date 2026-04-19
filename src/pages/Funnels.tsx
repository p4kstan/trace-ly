import { useState } from "react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Filter, ArrowDown, TrendingUp, Eye, ShoppingCart, CreditCard, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const FUNNEL_EVENTS = [
  { name: "PageView", icon: Eye, label: "Visualizações" },
  { name: "ViewContent", icon: Filter, label: "Conteúdo Visto" },
  { name: "AddToCart", icon: ShoppingCart, label: "Add ao Carrinho" },
  { name: "InitiateCheckout", icon: CreditCard, label: "Checkout" },
  { name: "Purchase", icon: TrendingUp, label: "Compras" },
];

interface Discovery {
  id: string;
  event_name: string | null;
  status: string;
  discovery_type: string;
  occurrence_count: number;
  created_at: string;
  parameters_json: any;
}

export default function Funnels() {
  const { data: workspace } = useWorkspace();
  const [selected, setSelected] = useState<Discovery | null>(null);

  const { data: funnelData, isLoading } = useQuery({
    queryKey: ["funnel-data", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const counts: Record<string, number> = {};

      for (const evt of FUNNEL_EVENTS) {
        const { count } = await supabase
          .from("events")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", workspace!.id)
          .eq("event_name", evt.name)
          .gte("event_time", sevenDaysAgo);
        counts[evt.name] = count || 0;
      }
      return counts;
    },
  });

  const { data: discoveries } = useQuery({
    queryKey: ["event-discoveries", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("event_discovery")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as Discovery[];
    },
  });

  // Sample real occurrences for the selected discovery
  const { data: occurrences, isLoading: loadingOccurrences } = useQuery({
    queryKey: ["event-occurrences", workspace?.id, selected?.event_name],
    enabled: !!workspace?.id && !!selected?.event_name,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, event_name, event_time, page_path, event_source_url, source, action_source, custom_data_json")
        .eq("workspace_id", workspace!.id)
        .eq("event_name", selected!.event_name!)
        .order("event_time", { ascending: false })
        .limit(25);
      return data || [];
    },
  });

  const maxCount = funnelData ? Math.max(...Object.values(funnelData), 1) : 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Análise de Funil</h1>
        <p className="text-muted-foreground text-sm mt-1">Funil de conversão e descoberta de eventos</p>
      </div>

      {/* Funnel Visualization */}
      <div className="surface-elevated p-6">
        <h3 className="text-sm font-medium text-foreground mb-6">Funil de Conversão (7 dias)</h3>
        {isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : (
          <div className="space-y-1 max-w-xl mx-auto">
            {FUNNEL_EVENTS.map((evt, i) => {
              const count = funnelData?.[evt.name] || 0;
              const prevCount = i > 0 ? (funnelData?.[FUNNEL_EVENTS[i - 1].name] || 1) : count;
              const dropRate = i > 0 && prevCount > 0 ? ((1 - count / prevCount) * 100).toFixed(1) : null;
              const widthPct = Math.max(20, (count / maxCount) * 100);

              return (
                <div key={evt.name}>
                  {i > 0 && (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <ArrowDown className="w-3 h-3 text-muted-foreground" />
                      {dropRate && (
                        <span className="text-[10px] text-destructive font-mono">-{dropRate}% drop</span>
                      )}
                    </div>
                  )}
                  <div
                    className="mx-auto rounded-lg p-3 flex items-center justify-between transition-all"
                    style={{
                      width: `${widthPct}%`,
                      background: `hsl(199 89% ${48 + i * 8}% / 0.15)`,
                      border: `1px solid hsl(199 89% ${48 + i * 8}% / 0.3)`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <evt.icon className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium text-foreground">{evt.label}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {count.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Auto-discovered events */}
      <div className="surface-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">Eventos Descobertos Automaticamente</h3>
          <span className="text-[10px] text-muted-foreground">Clique num card para ver as ocorrências</span>
        </div>
        {(discoveries?.length || 0) > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {discoveries!.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelected(d)}
                className="text-left bg-muted/20 hover:bg-muted/40 rounded-lg p-3 border border-border/30 hover:border-primary/40 transition-all focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground truncate">{d.event_name || "—"}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${d.status === "new" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {d.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {d.occurrence_count} ocorrências • {d.discovery_type}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(d.created_at).toLocaleDateString("pt-BR")}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-8">
            Nenhum evento novo descoberto. Execute o optimization engine para detectar.
          </p>
        )}
      </div>

      {/* Occurrences dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.event_name || "—"}
              <Badge variant="outline" className="text-[10px]">{selected?.status}</Badge>
            </DialogTitle>
            <DialogDescription>
              {selected?.occurrence_count} ocorrências registradas • tipo: {selected?.discovery_type}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4">
            {selected?.parameters_json && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Parâmetros descobertos</h4>
                <pre className="bg-muted/40 rounded-lg p-3 text-xs font-mono text-foreground overflow-auto max-h-40">
                  {JSON.stringify(selected.parameters_json, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                Últimas ocorrências (até 25)
              </h4>
              {loadingOccurrences ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                </div>
              ) : (occurrences?.length || 0) > 0 ? (
                <div className="space-y-2">
                  {occurrences!.map((o: any) => (
                    <div key={o.id} className="bg-muted/20 rounded-lg p-3 border border-border/30">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground truncate">
                          {o.page_path || o.event_source_url || "—"}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(o.event_time).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {o.source && <Badge variant="secondary" className="text-[10px]">source: {o.source}</Badge>}
                        {o.action_source && <Badge variant="secondary" className="text-[10px]">{o.action_source}</Badge>}
                      </div>
                      {o.custom_data_json && Object.keys(o.custom_data_json).length > 0 && (
                        <pre className="mt-2 bg-background/40 rounded p-2 text-[10px] font-mono text-muted-foreground overflow-auto max-h-24">
                          {JSON.stringify(o.custom_data_json, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Inbox className="w-10 h-10 mb-2" />
                  <p className="text-sm">Nenhuma ocorrência individual encontrada na tabela de eventos.</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
