import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, TrendingUp, Zap, AlertTriangle, Brain, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function RealTimeAnalytics() {
  const { data: workspace } = useWorkspace();
  const [liveMetrics, setLiveMetrics] = useState<Record<string, number>>({
    events_per_sec: 0,
    revenue_per_min: 0,
    conversion_rate: 0,
    active_sessions: 0,
    queue_size: 0,
    error_rate: 0,
  });
  const [history, setHistory] = useState<{ time: string; eps: number; rpm: number }[]>([]);

  // Subscribe to realtime metrics
  useEffect(() => {
    if (!workspace?.id) return;

    const channel = supabase
      .channel("realtime-metrics")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "realtime_metrics", filter: `workspace_id=eq.${workspace.id}` },
        (payload) => {
          const { metric_name, metric_value } = payload.new as any;
          setLiveMetrics((prev) => ({ ...prev, [metric_name]: metric_value }));
          if (metric_name === "events_per_sec") {
            setHistory((prev) => [
              ...prev.slice(-59),
              { time: new Date().toLocaleTimeString(), eps: metric_value, rpm: liveMetrics.revenue_per_min },
            ]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspace?.id]);

  // Fetch recent metrics as baseline
  const { data: recentMetrics } = useQuery({
    queryKey: ["realtime-baseline", workspace?.id],
    enabled: !!workspace?.id,
    refetchInterval: 10000,
    queryFn: async () => {
      const oneMinAgo = new Date(Date.now() - 60000).toISOString();
      const { data } = await supabase
        .from("realtime_metrics")
        .select("metric_name, metric_value")
        .eq("workspace_id", workspace!.id)
        .gte("recorded_at", oneMinAgo)
        .order("recorded_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Fetch predictions
  const { data: predictions, isLoading: predLoading, refetch: refetchPred } = useQuery({
    queryKey: ["predictions", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("prediction_results")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("predicted_value", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Fetch ML models
  const { data: mlModels } = useQuery({
    queryKey: ["ml-models", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("ml_attribution_models")
        .select("*")
        .eq("workspace_id", workspace!.id);
      return data || [];
    },
  });

  // Update live metrics from recent data
  useEffect(() => {
    if (recentMetrics?.length) {
      const latest: Record<string, number> = {};
      for (const m of recentMetrics) {
        if (!latest[m.metric_name]) latest[m.metric_name] = m.metric_value;
      }
      setLiveMetrics((prev) => ({ ...prev, ...latest }));
    }
  }, [recentMetrics]);

  const [training, setTraining] = useState(false);
  const handleTrainML = async (modelType: string) => {
    if (!workspace?.id) return;
    setTraining(true);
    try {
      const { data, error } = await supabase.functions.invoke("ml-attribution", {
        body: { workspace_id: workspace.id, model_type: modelType },
      });
      if (error) throw error;
      toast.success(`Modelo ${modelType} treinado! Accuracy: ${((data.accuracy || 0) * 100).toFixed(0)}%`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao treinar modelo");
    }
    setTraining(false);
  };

  const [predicting, setPredicting] = useState(false);
  const handlePredict = async () => {
    if (!workspace?.id) return;
    setPredicting(true);
    try {
      const { data, error } = await supabase.functions.invoke("predictive-analytics", {
        body: { workspace_id: workspace.id },
      });
      if (error) throw error;
      toast.success(`${data.predictions} predições geradas!`);
      refetchPred();
    } catch (e: any) {
      toast.error(e.message || "Erro na predição");
    }
    setPredicting(false);
  };

  const metricCards = [
    { label: "Events/sec", value: liveMetrics.events_per_sec?.toFixed(1) || "0", icon: Zap, color: "text-primary" },
    { label: "Revenue/min", value: `R$ ${(liveMetrics.revenue_per_min || 0).toFixed(2)}`, icon: TrendingUp, color: "text-success" },
    { label: "Conv. Rate", value: `${((liveMetrics.conversion_rate || 0) * 100).toFixed(1)}%`, icon: Activity, color: "text-accent" },
    { label: "Queue Size", value: String(liveMetrics.queue_size || 0), icon: BarChart3, color: "text-warning" },
    { label: "Error Rate", value: `${((liveMetrics.error_rate || 0) * 100).toFixed(1)}%`, icon: AlertTriangle, color: "text-destructive" },
    { label: "ML Models", value: String(mlModels?.length || 0), icon: Brain, color: "text-primary" },
  ];

  // Group predictions by type
  const roasPredictions = predictions?.filter(p => p.prediction_type.startsWith("roas")) || [];
  const ltvPredictions = predictions?.filter(p => p.prediction_type === "ltv") || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Real-Time Analytics & ML</h1>
          <p className="text-muted-foreground text-sm mt-1">Live metrics, ML attribution & predictive analytics</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleTrainML("markov")} disabled={training} variant="outline" size="sm">
            <Brain className="w-4 h-4 mr-1" /> {training ? "Treinando..." : "Markov"}
          </Button>
          <Button onClick={() => handleTrainML("shapley")} disabled={training} variant="outline" size="sm">
            <Brain className="w-4 h-4 mr-1" /> Shapley
          </Button>
          <Button onClick={handlePredict} disabled={predicting} size="sm">
            <TrendingUp className="w-4 h-4 mr-1" /> {predicting ? "Predizendo..." : "Predict ROAS/LTV"}
          </Button>
        </div>
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metricCards.map((m) => (
          <div key={m.label} className="surface-elevated p-4 text-center">
            <m.icon className={`w-5 h-5 mx-auto mb-2 ${m.color}`} />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
            <p className="text-lg font-bold text-foreground mt-1 tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {/* ML Models Status */}
      {mlModels && mlModels.length > 0 && (
        <div className="surface-elevated p-5">
          <h3 className="text-sm font-medium text-foreground mb-3">Modelos ML Treinados</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mlModels.map((model: any) => {
              const credits = model.model_data?.channel_credits || {};
              return (
                <div key={model.id} className="bg-muted/20 rounded-lg p-4 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground capitalize">{model.model_type}</span>
                    <span className="text-xs text-primary font-mono">{((model.accuracy || 0) * 100).toFixed(0)}% acc</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{model.training_samples} amostras • {new Date(model.trained_at).toLocaleDateString()}</p>
                  <div className="space-y-1">
                    {Object.entries(credits).slice(0, 5).map(([ch, cr]: [string, any]) => (
                      <div key={ch} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{ch}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(cr * 100)}%` }} />
                          </div>
                          <span className="text-foreground font-mono w-10 text-right">{(cr * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ROAS Predictions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface-elevated p-5">
          <h3 className="text-sm font-medium text-foreground mb-3">Predicted ROAS por Canal</h3>
          {predLoading ? (
            <Skeleton className="h-[200px]" />
          ) : roasPredictions.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {roasPredictions.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30">
                  <div>
                    <span className="text-foreground font-medium">{p.channel}</span>
                    <span className="text-muted-foreground ml-2">{p.prediction_type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-success font-mono">R$ {Number(p.predicted_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <span className="text-muted-foreground">{(Number(p.confidence) * 100).toFixed(0)}% conf</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Clique "Predict ROAS/LTV" para gerar predições</p>
          )}
        </div>

        <div className="surface-elevated p-5">
          <h3 className="text-sm font-medium text-foreground mb-3">Predicted LTV por Canal</h3>
          {predLoading ? (
            <Skeleton className="h-[200px]" />
          ) : ltvPredictions.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {ltvPredictions.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30">
                  <span className="text-foreground font-medium">{p.channel}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-primary font-mono">R$ {Number(p.predicted_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <span className="text-muted-foreground">{(Number(p.confidence) * 100).toFixed(0)}% conf</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Sem predições de LTV ainda</p>
          )}
        </div>
      </div>

      {/* Live Event Stream */}
      <div className="surface-elevated p-5">
        <h3 className="text-sm font-medium text-foreground mb-3">Event Stream (últimos 60s)</h3>
        {history.length > 0 ? (
          <div className="flex items-end gap-0.5 h-20">
            {history.map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/60 rounded-t hover:bg-primary transition-colors"
                style={{ height: `${Math.min(100, Math.max(5, h.eps * 20))}%` }}
                title={`${h.time}: ${h.eps} events/sec`}
              />
            ))}
          </div>
        ) : (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
            <Activity className="w-4 h-4 mr-2 animate-pulse" />
            Aguardando dados em tempo real...
          </div>
        )}
      </div>
    </div>
  );
}
