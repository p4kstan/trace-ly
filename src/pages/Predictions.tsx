import { useState } from "react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Brain, RefreshCw, Target, DollarSign, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function Predictions() {
  const { data: workspace } = useWorkspace();
  const [predicting, setPredicting] = useState(false);

  const { data: predictions, isLoading, refetch } = useQuery({
    queryKey: ["all-predictions", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("prediction_results")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const handlePredict = async () => {
    if (!workspace?.id) return;
    setPredicting(true);
    try {
      const { data, error } = await supabase.functions.invoke("predictive-analytics", {
        body: { workspace_id: workspace.id },
      });
      if (error) throw error;
      toast.success(`${data.predictions} predições geradas!`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro na predição");
    }
    setPredicting(false);
  };

  const roasPreds = predictions?.filter(p => p.prediction_type?.startsWith("roas")) || [];
  const ltvPreds = predictions?.filter(p => p.prediction_type === "ltv") || [];
  const otherPreds = predictions?.filter(p => !p.prediction_type?.startsWith("roas") && p.prediction_type !== "ltv") || [];

  const avgConfidence = predictions?.length
    ? (predictions.reduce((s, p) => s + Number(p.confidence || 0), 0) / predictions.length * 100).toFixed(0)
    : "0";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Predictive Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">ROAS, LTV e receita previstos por canal</p>
        </div>
        <Button onClick={handlePredict} disabled={predicting} size="sm">
          <RefreshCw className={`w-4 h-4 mr-1 ${predicting ? "animate-spin" : ""}`} />
          {predicting ? "Gerando..." : "Gerar Predições"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Predições", value: String(predictions?.length || 0), icon: Brain, color: "text-primary" },
          { label: "ROAS Predictions", value: String(roasPreds.length), icon: TrendingUp, color: "text-success" },
          { label: "LTV Predictions", value: String(ltvPreds.length), icon: Users, color: "text-accent" },
          { label: "Confiança Média", value: `${avgConfidence}%`, icon: Target, color: "text-warning" },
        ].map(c => (
          <div key={c.label} className="surface-elevated p-4 text-center">
            <c.icon className={`w-5 h-5 mx-auto mb-2 ${c.color}`} />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
            <p className="text-lg font-bold text-foreground mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-[300px]" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ROAS */}
          <div className="surface-elevated p-5">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-4 h-4 text-success" />
              <h3 className="text-sm font-medium text-foreground">Predicted ROAS</h3>
            </div>
            {roasPreds.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {roasPreds.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-xs py-2 border-b border-border/30">
                    <div>
                      <span className="text-foreground font-medium">{p.channel || "—"}</span>
                      <span className="text-muted-foreground ml-2 capitalize">{p.prediction_type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-success font-mono font-bold">
                        R$ {Number(p.predicted_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-muted-foreground">{(Number(p.confidence) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">Sem predições ROAS</p>
            )}
          </div>

          {/* LTV */}
          <div className="surface-elevated p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">Predicted LTV</h3>
            </div>
            {ltvPreds.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {ltvPreds.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-xs py-2 border-b border-border/30">
                    <span className="text-foreground font-medium">{p.channel || "—"}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-primary font-mono font-bold">
                        R$ {Number(p.predicted_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-muted-foreground">{(Number(p.confidence) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">Sem predições LTV</p>
            )}
          </div>
        </div>
      )}

      {/* Other predictions */}
      {otherPreds.length > 0 && (
        <div className="surface-elevated p-5">
          <h3 className="text-sm font-medium text-foreground mb-3">Outras Predições</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {otherPreds.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-xs py-2 border-b border-border/30">
                <div>
                  <span className="text-foreground font-medium">{p.channel || "—"}</span>
                  <span className="text-muted-foreground ml-2 capitalize">{p.prediction_type}</span>
                </div>
                <span className="text-foreground font-mono">
                  {Number(p.predicted_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
