import { useState, useMemo } from "react";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { RefreshCw, Sparkles, Activity, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  useGoogleAdsRecommendations,
  useApplyRecommendation,
  type RecPeriod,
  type Recommendation,
} from "@/hooks/api/use-google-ads-recommendations";
import {
  useMetaAdsRecommendations,
  useApplyMetaRecommendation,
  type MetaRecommendation,
} from "@/hooks/api/use-meta-ads-recommendations";
import { RecommendationCard, type RecPlatform } from "@/components/optimization/RecommendationCard";
import { AICopilotChat } from "@/components/optimization/AICopilotChat";

type TabKey = "both" | "google" | "meta";
type CombinedRec =
  | { platform: "google_ads"; rec: Recommendation }
  | { platform: "meta_ads"; rec: MetaRecommendation };

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function Optimization() {
  const { data: workspace } = useWorkspace();
  const [period, setPeriod] = useState<RecPeriod>("30d");
  const [platformTab, setPlatformTab] = useState<TabKey>("both");
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const google = useGoogleAdsRecommendations(workspace?.id, period);
  const meta = useMetaAdsRecommendations(workspace?.id, period);
  const applyGoogle = useApplyRecommendation();
  const applyMeta = useApplyMetaRecommendation();

  const isLoading = google.isLoading || meta.isLoading;
  const isFetching = google.isFetching || meta.isFetching;
  const refetchAll = () => { google.refetch(); meta.refetch(); };

  const combined: CombinedRec[] = useMemo(() => {
    const g: CombinedRec[] = (google.data?.recommendations || []).map((r) => ({ platform: "google_ads", rec: r }));
    const m: CombinedRec[] = (meta.data?.recommendations || []).map((r) => ({ platform: "meta_ads", rec: r }));
    const all = [...g, ...m].filter((c) => !rejected.has(c.rec.id));
    all.sort((a, b) => (SEVERITY_RANK[a.rec.severity] ?? 9) - (SEVERITY_RANK[b.rec.severity] ?? 9));
    return all;
  }, [google.data, meta.data, rejected]);

  const visible = useMemo(() => {
    if (platformTab === "google") return combined.filter((c) => c.platform === "google_ads");
    if (platformTab === "meta") return combined.filter((c) => c.platform === "meta_ads");
    return combined;
  }, [combined, platformTab]);

  const score = useMemo(() => {
    const gs = google.data?.health_score;
    const ms = meta.data?.health_score;
    if (platformTab === "google") return gs ?? 0;
    if (platformTab === "meta") return ms ?? 0;
    const arr = [gs, ms].filter((x): x is number => typeof x === "number");
    if (!arr.length) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }, [google.data, meta.data, platformTab]);

  const summary = useMemo(() => {
    if (platformTab === "google") return google.data?.summary || "";
    if (platformTab === "meta") return meta.data?.summary || "";
    return [google.data?.summary, meta.data?.summary].filter(Boolean).join("\n\n");
  }, [google.data, meta.data, platformTab]);

  const scoreColor = score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-destructive";

  const errorMsg = (() => {
    const errs: string[] = [];
    if (platformTab !== "meta" && google.error) errs.push(`Google: ${(google.error as Error).message}`);
    if (platformTab !== "google" && meta.error) errs.push(`Meta: ${(meta.error as Error).message}`);
    return errs.length ? errs.join(" · ") : null;
  })();

  const handleApply = async (item: CombinedRec) => {
    if (!workspace?.id) return;
    try {
      if (item.platform === "google_ads") {
        await applyGoogle.mutateAsync({ rec: item.rec, workspaceId: workspace.id });
      } else {
        await applyMeta.mutateAsync({ rec: item.rec, workspaceId: workspace.id });
      }
      toast.success("Ação aplicada com sucesso", {
        action: { label: "Ver histórico", onClick: () => (window.location.href = "/ai-actions-log") },
      });
      setRejected((s) => new Set(s).add(item.rec.id));
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
            Otimização AI · Google + Meta Ads
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
          <Button onClick={refetchAll} disabled={isFetching} size="sm">
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Analisando…" : "Analisar agora"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/ai-actions-log">Histórico</Link>
          </Button>
        </div>
      </div>

      <Tabs value={platformTab} onValueChange={(v) => setPlatformTab(v as TabKey)}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="both">Ambas</TabsTrigger>
          <TabsTrigger value="google">Google Ads</TabsTrigger>
          <TabsTrigger value="meta">Meta Ads</TabsTrigger>
        </TabsList>

        <TabsContent value={platformTab} className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {isLoading ? (
                <>
                  <Skeleton className="h-32 rounded-xl" />
                  <Skeleton className="h-40 rounded-xl" />
                  <Skeleton className="h-40 rounded-xl" />
                </>
              ) : (
                <>
                  <div className="surface-elevated p-5">
                    <div className="flex items-center gap-4 mb-3">
                      <Activity className={`w-5 h-5 ${scoreColor}`} />
                      <div className="flex-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Health score</p>
                        <p className={`text-3xl font-bold tabular-nums ${scoreColor}`}>{score}<span className="text-sm text-muted-foreground">/100</span></p>
                      </div>
                    </div>
                    {summary && <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{summary}</p>}
                    {errorMsg && (
                      <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}
                  </div>

                  {visible.length === 0 ? (
                    <div className="surface-elevated p-8 text-center">
                      <Sparkles className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {(google.data || meta.data)
                          ? "Nenhuma recomendação no momento — suas campanhas parecem saudáveis."
                          : "Clique em \"Analisar agora\" para gerar recomendações."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visible.map((item) => (
                        <RecommendationCard
                          key={item.rec.id}
                          rec={item.rec}
                          platform={item.platform as RecPlatform}
                          onApply={() => handleApply(item)}
                          onReject={() => setRejected((s) => new Set(s).add(item.rec.id))}
                          isApplying={applyGoogle.isPending || applyMeta.isPending}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="lg:col-span-1">
              {workspace?.id && <AICopilotChat workspaceId={workspace.id} period={period} />}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
