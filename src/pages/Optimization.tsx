import { useState } from "react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, TrendingUp, TrendingDown, Pause, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const actionIcons: Record<string, any> = {
  increase_budget: TrendingUp,
  decrease_budget: TrendingDown,
  pause_channel: Pause,
};
const actionColors: Record<string, string> = {
  increase_budget: "text-success",
  decrease_budget: "text-warning",
  pause_channel: "text-destructive",
};

export default function Optimization() {
  const { data: workspace } = useWorkspace();
  const [running, setRunning] = useState(false);

  const { data: recommendations, isLoading, refetch } = useQuery({
    queryKey: ["optimization-recs", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("optimization_recommendations")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: hybridAttr } = useQuery({
    queryKey: ["hybrid-attribution", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("attribution_hybrid")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("hybrid_credit", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const handleOptimize = async () => {
    if (!workspace?.id) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("optimization-engine", {
        body: { workspace_id: workspace.id },
      });
      if (error) throw error;
      toast.success(`${data.recommendations} recomendações • ${data.hybrid_attribution} atribuições híbridas`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro na otimização");
    }
    setRunning(false);
  };

  const pending = recommendations?.filter(r => r.status === "pending") || [];
  const high = pending.filter(r => r.priority === "high");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Budget Optimization</h1>
          <p className="text-muted-foreground text-sm mt-1">Recomendações de otimização e atribuição híbrida</p>
        </div>
        <Button onClick={handleOptimize} disabled={running} size="sm">
          <RefreshCw className={`w-4 h-4 mr-1 ${running ? "animate-spin" : ""}`} />
          {running ? "Analisando..." : "Otimizar Agora"}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Recomendações", value: String(pending.length), icon: Lightbulb, color: "text-primary" },
          { label: "Alta Prioridade", value: String(high.length), icon: Zap, color: "text-destructive" },
          { label: "Hybrid Channels", value: String(hybridAttr?.length || 0), icon: TrendingUp, color: "text-success" },
          { label: "Budget Actions", value: String(recommendations?.length || 0), icon: Lightbulb, color: "text-warning" },
        ].map(c => (
          <div key={c.label} className="surface-elevated p-4 text-center">
            <c.icon className={`w-5 h-5 mx-auto mb-2 ${c.color}`} />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
            <p className="text-lg font-bold text-foreground mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? <Skeleton className="h-[300px]" /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recommendations */}
          <div className="surface-elevated p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Recomendações de Budget</h3>
            {pending.length > 0 ? (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {pending.map((r: any) => {
                  const Icon = actionIcons[r.action] || Lightbulb;
                  const color = actionColors[r.action] || "text-muted-foreground";
                  return (
                    <div key={r.id} className="bg-muted/20 rounded-lg p-3 border border-border/30">
                      <div className="flex items-start gap-3">
                        <Icon className={`w-4 h-4 mt-0.5 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground">{r.channel}</span>
                            <Badge variant={r.priority === "high" ? "destructive" : "secondary"} className="text-[10px]">
                              {r.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{r.reason}</p>
                          {r.estimated_impact && (
                            <p className="text-xs text-success mt-1">
                              Impacto estimado: R$ {Number(r.estimated_impact).toLocaleString("pt-BR")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">Sem recomendações pendentes</p>
            )}
          </div>

          {/* Hybrid Attribution */}
          <div className="surface-elevated p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Hybrid Attribution</h3>
            {(hybridAttr?.length || 0) > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {hybridAttr!.map((h: any) => (
                  <div key={h.id} className="bg-muted/20 rounded-lg p-3 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{h.source || "Direct"}</span>
                      <span className="text-xs text-primary font-mono">{((h.hybrid_credit || 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                      <span>Markov: {((h.markov_credit || 0) * 100).toFixed(0)}%</span>
                      <span>Shapley: {((h.shapley_credit || 0) * 100).toFixed(0)}%</span>
                      <span>T.Decay: {((h.time_decay_credit || 0) * 100).toFixed(0)}%</span>
                      <span>Linear: {((h.linear_credit || 0) * 100).toFixed(0)}%</span>
                    </div>
                    {h.hybrid_value && (
                      <p className="text-xs text-success mt-1 font-mono">
                        R$ {Number(h.hybrid_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">Execute o otimizador para gerar</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
