import { useWorkspace } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Filter, ArrowDown, TrendingUp, Eye, ShoppingCart, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const FUNNEL_EVENTS = [
  { name: "PageView", icon: Eye, label: "Visualizações" },
  { name: "ViewContent", icon: Filter, label: "View Content" },
  { name: "AddToCart", icon: ShoppingCart, label: "Add to Cart" },
  { name: "InitiateCheckout", icon: CreditCard, label: "Checkout" },
  { name: "Purchase", icon: TrendingUp, label: "Compras" },
];

export default function Funnels() {
  const { data: workspace } = useWorkspace();

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
      return data || [];
    },
  });

  const maxCount = funnelData ? Math.max(...Object.values(funnelData), 1) : 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Funnel Analytics</h1>
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
        <h3 className="text-sm font-medium text-foreground mb-4">Eventos Descobertos Automaticamente</h3>
        {(discoveries?.length || 0) > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {discoveries!.map((d: any) => (
              <div key={d.id} className="bg-muted/20 rounded-lg p-3 border border-border/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{d.event_name || "—"}</span>
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
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-8">
            Nenhum evento novo descoberto. Execute o optimization engine para detectar.
          </p>
        )}
      </div>
    </div>
  );
}
