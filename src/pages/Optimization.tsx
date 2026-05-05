import { useState } from "react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { RefreshCw, Sparkles, Activity, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  useGoogleAdsRecommendations,
  useApplyRecommendation,
  type RecPeriod,
  type Recommendation,
} from "@/hooks/api/use-google-ads-recommendations";
import { RecommendationCard } from "@/components/optimization/RecommendationCard";
import { AICopilotChat } from "@/components/optimization/AICopilotChat";

export default function Optimization() {
  const { data: workspace } = useWorkspace();
  const [period, setPeriod] = useState<RecPeriod>("30d");
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, refetch, error } = useGoogleAdsRecommendations(workspace?.id, period);
  const apply = useApplyRecommendation();

  const visibleRecs: Recommendation[] = (data?.recommendations || []).filter((r) => !rejected.has(r.id));
  const score = data?.health_score ?? 0;
  const scoreColor = score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-destructive";

  const handleApply = async (rec: Recommendation) => {
    if (!workspace?.id) return;
    try {
      await apply.mutateAsync({ rec, workspaceId: workspace.id });
      toast.success("Ação aplicada com sucesso", {
        action: { label: "Ver histórico", onClick: () => (window.location.href = "/ai-actions-log") },
      });
      setRejected((s) => new Set(s).add(rec.id));
    } catch (e: any) {
      toast.error(e.message || "Falha ao aplicar");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Otimização AI · Google Ads
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Recomendações estruturadas geradas por IA com aprovação antes de aplicar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as RecPeriod)}>
            <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7d</SelectItem>
              <SelectItem value="14d">Últimos 14d</SelectItem>
              <SelectItem value="30d">Últimos 30d</SelectItem>
              <SelectItem value="90d">Últimos 90d</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => refetch()} disabled={isFetching} size="sm">
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Analisando…" : "Analisar agora"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/ai-actions-log">Histórico</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </>
          ) : error ? (
            <div className="surface-elevated p-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
              <p className="text-sm text-foreground">{(error as Error).message}</p>
              <Button onClick={() => refetch()} size="sm" variant="outline">Tentar novamente</Button>
            </div>
          ) : data ? (
            <>
              <div className="surface-elevated p-5">
                <div className="flex items-center gap-4 mb-3">
                  <Activity className={`w-5 h-5 ${scoreColor}`} />
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Health score</p>
                    <p className={`text-3xl font-bold tabular-nums ${scoreColor}`}>{score}<span className="text-sm text-muted-foreground">/100</span></p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
              </div>

              {visibleRecs.length === 0 ? (
                <div className="surface-elevated p-8 text-center">
                  <Sparkles className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {data.recommendations.length === 0
                      ? "Nenhuma recomendação no momento — suas campanhas parecem saudáveis."
                      : "Todas recomendações foram tratadas."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleRecs.map((rec) => (
                    <RecommendationCard
                      key={rec.id}
                      rec={rec}
                      onApply={() => handleApply(rec)}
                      onReject={() => setRejected((s) => new Set(s).add(rec.id))}
                      isApplying={apply.isPending}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="surface-elevated p-8 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Clique em "Analisar agora" para gerar recomendações IA das suas contas Google Ads.</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          {workspace?.id && <AICopilotChat workspaceId={workspace.id} period={period} />}
        </div>
      </div>
    </div>
  );
}
