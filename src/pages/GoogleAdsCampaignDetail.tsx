import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useGoogleAdsReport, type GoogleAdsPeriod } from "@/hooks/api/use-google-ads-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Pause, Play, DollarSign, MousePointerClick, BarChart3, Target, TrendingUp, AlertCircle, Edit3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend,
} from "recharts";
import { CampaignStatusBadge as StatusBadge } from "@/components/dashboard/CampaignStatusBadge";
import { CampaignMetricCard as MetricCard } from "@/components/dashboard/CampaignMetricCard";
import { CampaignDataTable as SimpleTable } from "@/components/dashboard/CampaignDataTable";

type Period = GoogleAdsPeriod;

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Últimos 7 dias", "14d": "Últimos 14 dias", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias",
};

const fmtNumber = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const fmtFloat = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

const useReport = (
  workspaceId: string | undefined,
  customerId: string,
  level: string,
  period: Period,
  campaignId?: string,
  parentId?: string
) => useGoogleAdsReport({ workspaceId, customerId, level, period, campaignId, parentId });

export default function GoogleAdsCampaignDetail() {
  const { customerId = "", campaignId = "" } = useParams();
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("7d");
  const [tab, setTab] = useState("overview");
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newBudget, setNewBudget] = useState("");

  // Campaign metadata
  const detail = useReport(workspace?.id, customerId, "campaign_detail", period, campaignId);
  const campaign = detail.data?.rows?.[0];

  // Time series for chart
  const series = useReport(workspace?.id, customerId, "time_series", period, campaignId);

  // Aggregated KPIs (campaign-level for selected period)
  const camp = useReport(workspace?.id, customerId, "campaigns", period, campaignId);
  const totals = camp.data?.totals;

  // Per-tab data (lazy via tab change)
  const adGroups = useReport(workspace?.id, customerId, "ad_groups", period, campaignId, campaignId);
  const keywords = useReport(workspace?.id, customerId, "keywords", period, campaignId);
  const negKeywordsCamp = useReport(workspace?.id, customerId, "negative_keywords", period, campaignId);
  const negKeywordsShared = useReport(workspace?.id, customerId, "negative_keywords_shared", period, campaignId);
  const negKeywordsAg = useReport(workspace?.id, customerId, "negative_keywords_ad_group", period, campaignId);
  const searchTerms = useReport(workspace?.id, customerId, "search_terms", period, campaignId);
  const ageData = useReport(workspace?.id, customerId, "age", period, campaignId);
  const genderData = useReport(workspace?.id, customerId, "gender", period, campaignId);
  const deviceData = useReport(workspace?.id, customerId, "device", period, campaignId);
  const geoData = useReport(workspace?.id, customerId, "geo", period, campaignId);
  const audienceData = useReport(workspace?.id, customerId, "audience", period, campaignId);
  const extensions = useReport(workspace?.id, customerId, "extensions", period, campaignId);
  const ads = useReport(workspace?.id, customerId, "ads", period, campaignId);
  const bidModifiers = useReport(workspace?.id, customerId, "bid_modifiers", period, campaignId);
  const adSchedule = useReport(workspace?.id, customerId, "ad_schedule", period, campaignId);
  const locationsTargeted = useReport(workspace?.id, customerId, "locations_targeted", period, campaignId);
  const landingPages = useReport(workspace?.id, customerId, "landing_pages", period, campaignId);
  const conversionActions = useReport(workspace?.id, customerId, "conversion_actions", period, campaignId);
  const qualityShare = useReport(workspace?.id, customerId, "campaign_quality", period, campaignId);
  const history = useReport(workspace?.id, customerId, "change_history", period, campaignId);

  // Mutations
  const toggleStatus = useMutation({
    mutationFn: async (newStatus: "ENABLED" | "PAUSED") => {
      const { data, error } = await supabase.functions.invoke("google-ads-mutate", {
        body: { workspace_id: workspace!.id, customer_id: customerId, action: "update_campaign_status", campaign_id: campaignId, status: newStatus },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["gads-detail"] }); },
    onError: (e: any) => toast.error(`Falha: ${e.message}`),
  });

  const updateBudget = useMutation({
    mutationFn: async (amount: number) => {
      // Get budget resource first
      const { data: budgetData, error: e1 } = await supabase.functions.invoke("google-ads-mutate", {
        body: { workspace_id: workspace!.id, customer_id: customerId, action: "get_campaign_budget", campaign_id: campaignId },
      });
      if (e1) throw e1;
      if (!budgetData?.budget_resource) throw new Error("Budget resource not found");
      const { data, error } = await supabase.functions.invoke("google-ads-mutate", {
        body: { workspace_id: workspace!.id, customer_id: customerId, action: "update_budget", budget_resource: budgetData.budget_resource, budget_micros: Math.round(amount * 1_000_000) },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Orçamento atualizado"); setBudgetOpen(false); qc.invalidateQueries({ queryKey: ["gads-detail"] }); },
    onError: (e: any) => toast.error(`Falha: ${e.message}`),
  });

  const chartData = useMemo(() => {
    if (!series.data?.rows) return [];
    return series.data.rows.map((r: any) => ({
      date: r.date,
      cost: Number(r.cost || 0),
      clicks: Number(r.clicks || 0),
      conversions: Number(r.conversions || 0),
      roas: Number(r.roas || 0),
    }));
  }, [series.data]);

  const isLoadingHeader = detail.isLoading || camp.isLoading;
  const errMsg = (detail.error as any)?.message || (camp.error as any)?.message;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/google-ads-campaigns")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {campaign?.name || (isLoadingHeader ? "Carregando…" : "Campanha")}
              {campaign && <StatusBadge status={campaign.status} />}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              ID {campaignId} · {customerId} · {campaign?.channel_type || ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {campaign?.status === "ENABLED" ? (
            <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate("PAUSED")} disabled={toggleStatus.isPending}>
              {toggleStatus.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Pause className="w-3.5 h-3.5 mr-1.5" />} Pausar
            </Button>
          ) : campaign?.status === "PAUSED" ? (
            <Button size="sm" variant="outline" onClick={() => toggleStatus.mutate("ENABLED")} disabled={toggleStatus.isPending}>
              {toggleStatus.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />} Ativar
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => { setNewBudget(((camp.data?.rows?.[0]?.budget) || 0).toString()); setBudgetOpen(true); }}>
            <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Orçamento
          </Button>
        </div>
      </div>

      {errMsg && (
        <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="break-all">{errMsg}</p>
        </div>
      )}

      {/* KPI cards */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard icon={DollarSign} label="Custo" value={fmtMoney(totals.cost)} />
          <MetricCard icon={MousePointerClick} label="Cliques" value={fmtNumber(totals.clicks)} hint={`CTR ${fmtPct(totals.ctr)}`} />
          <MetricCard icon={BarChart3} label="Impressões" value={fmtNumber(totals.impressions)} hint={`CPC ${fmtMoney(totals.cpc)}`} />
          <MetricCard icon={Target} label="Conversões" value={fmtFloat(totals.conversions)} hint={`CPA ${fmtMoney(totals.cpa)}`} />
          <MetricCard icon={TrendingUp} label="ROAS" value={fmtFloat(totals.roas)} hint={`Valor ${fmtMoney(totals.conversions_value)}`} />
          <MetricCard icon={DollarSign} label="Orçamento diário" value={fmtMoney(camp.data?.rows?.[0]?.budget || 0)} hint={campaign?.bidding_strategy_type || ""} />
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="ads">Anúncios</TabsTrigger>
          <TabsTrigger value="keywords">Palavras-chave</TabsTrigger>
          <TabsTrigger value="negatives">Negativas</TabsTrigger>
          <TabsTrigger value="audiences">Públicos</TabsTrigger>
          <TabsTrigger value="extensions">Extensões</TabsTrigger>
          <TabsTrigger value="search_terms">Termos</TabsTrigger>
          <TabsTrigger value="landing">Landing Pages</TabsTrigger>
          <TabsTrigger value="targeting">Segmentação</TabsTrigger>
          <TabsTrigger value="conversions">Conversões</TabsTrigger>
          <TabsTrigger value="impression_share">Imp. Share</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Performance diária</CardTitle></CardHeader>
            <CardContent className="h-[320px]">
              {series.isLoading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="left" type="monotone" dataKey="cost" stroke="hsl(var(--primary))" name="Custo" dot={false} strokeWidth={2} />
                    <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="hsl(200 100% 60%)" name="Cliques" dot={false} strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="hsl(140 70% 50%)" name="Conv." dot={false} strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="roas" stroke="hsl(40 100% 60%)" name="ROAS" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Grupos de anúncios</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable loading={adGroups.isLoading} rows={adGroups.data?.rows} columns={["name", "status", "impressions", "clicks", "ctr", "cost", "conversions", "cpa"]} />
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="glass-card">
              <CardHeader className="py-3"><CardTitle className="text-sm">Por dispositivo</CardTitle></CardHeader>
              <CardContent className="p-0">
                <SimpleTable loading={deviceData.isLoading} rows={deviceData.data?.rows} columns={["name", "impressions", "clicks", "ctr", "cost", "conversions"]} />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="py-3"><CardTitle className="text-sm">Por idade</CardTitle></CardHeader>
              <CardContent className="p-0">
                <SimpleTable loading={ageData.isLoading} rows={ageData.data?.rows} columns={["name", "impressions", "clicks", "ctr", "cost", "conversions"]} />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="py-3"><CardTitle className="text-sm">Por gênero</CardTitle></CardHeader>
              <CardContent className="p-0">
                <SimpleTable loading={genderData.isLoading} rows={genderData.data?.rows} columns={["name", "impressions", "clicks", "ctr", "cost", "conversions"]} />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="py-3"><CardTitle className="text-sm">Por localização</CardTitle></CardHeader>
              <CardContent className="p-0">
                <SimpleTable loading={geoData.isLoading} rows={geoData.data?.rows} columns={["name", "impressions", "clicks", "ctr", "cost", "conversions"]} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Keywords */}
        <TabsContent value="keywords" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Palavras-chave</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={keywords.isLoading}
                rows={keywords.data?.rows}
                columns={["name", "match_type", "status", "quality_score", "impressions", "clicks", "ctr", "cost", "conversions", "cpa"]}
                labels={{ name: "Palavra-chave", match_type: "Tipo", quality_score: "QS" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Negative Keywords */}
        <TabsContent value="negatives" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Palavras-chave negativas — nível Campanha</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Termos que <strong>bloqueiam</strong> seus anúncios em toda a campanha (ex: "grátis", "barato").</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={negKeywordsCamp.isLoading}
                rows={negKeywordsCamp.data?.rows}
                columns={["name", "match_type", "level"]}
                labels={{ name: "Palavra negativa", match_type: "Tipo", level: "Escopo" }}
              />
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Palavras-chave negativas — nível Grupo de anúncios</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Negativas aplicadas apenas a grupos específicos desta campanha.</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={negKeywordsAg.isLoading}
                rows={negKeywordsAg.data?.rows}
                columns={["name", "match_type", "ad_group_name"]}
                labels={{ name: "Palavra negativa", match_type: "Tipo", ad_group_name: "Grupo" }}
              />
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Listas de negativas compartilhadas</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Negativas em listas reutilizáveis que podem estar aplicadas a esta campanha.</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={negKeywordsShared.isLoading}
                rows={negKeywordsShared.data?.rows}
                columns={["name", "match_type", "shared_set_name"]}
                labels={{ name: "Palavra negativa", match_type: "Tipo", shared_set_name: "Lista" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audiences (mix age/gender/audience) */}
        <TabsContent value="audiences" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Audiências segmentadas</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable loading={audienceData.isLoading} rows={audienceData.data?.rows} columns={["name", "type", "impressions", "clicks", "ctr", "cost", "conversions"]} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Extensions */}
        <TabsContent value="extensions" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Extensões / Assets</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={extensions.isLoading}
                rows={extensions.data?.rows}
                columns={["name", "type", "impressions", "clicks", "ctr", "cost", "conversions"]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Terms */}
        <TabsContent value="search_terms" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Termos pesquisados (o que usuários digitaram)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={searchTerms.isLoading}
                rows={searchTerms.data?.rows}
                columns={["name", "matched_keyword", "match_type", "impressions", "clicks", "ctr", "cost", "conversions"]}
                labels={{ name: "Termo pesquisado", matched_keyword: "Keyword", match_type: "Tipo" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ads */}
        <TabsContent value="ads" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Anúncios criativos</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Performance de cada anúncio (headlines, descrições e métricas).</p>
            </CardHeader>
            <CardContent className="p-0">
              {ads.isLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : !ads.data?.rows?.length ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Sem anúncios no período</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {ads.data.rows.map((ad: any) => (
                    <div key={ad.id} className="p-4 hover:bg-muted/20">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">{ad.type}</Badge>
                            <StatusBadge status={ad.status} />
                            <span className="text-[10px] text-muted-foreground font-mono">ID {ad.id}</span>
                          </div>
                          {ad.headlines?.length > 0 && (
                            <div className="text-xs space-y-0.5">
                              <p className="text-muted-foreground/70 text-[10px] uppercase">Títulos</p>
                              {ad.headlines.slice(0, 5).map((h: string, i: number) => (
                                <p key={i} className="text-foreground">• {h}</p>
                              ))}
                            </div>
                          )}
                          {ad.descriptions?.length > 0 && (
                            <div className="text-xs space-y-0.5 mt-2">
                              <p className="text-muted-foreground/70 text-[10px] uppercase">Descrições</p>
                              {ad.descriptions.slice(0, 3).map((d: string, i: number) => (
                                <p key={i} className="text-muted-foreground">• {d}</p>
                              ))}
                            </div>
                          )}
                          {ad.final_urls?.length > 0 && (
                            <p className="text-[10px] text-primary/80 mt-2 truncate">{ad.final_urls[0]}</p>
                          )}
                        </div>
                        <div className="text-right text-xs space-y-0.5 shrink-0">
                          <p><span className="text-muted-foreground">Impr:</span> <span className="font-bold tabular-nums">{fmtNumber(ad.impressions)}</span></p>
                          <p><span className="text-muted-foreground">Cliques:</span> <span className="font-bold tabular-nums">{fmtNumber(ad.clicks)}</span></p>
                          <p><span className="text-muted-foreground">CTR:</span> <span className="tabular-nums">{fmtPct(ad.ctr)}</span></p>
                          <p><span className="text-muted-foreground">Custo:</span> <span className="font-bold tabular-nums">{fmtMoney(ad.cost)}</span></p>
                          <p><span className="text-muted-foreground">Conv:</span> <span className="tabular-nums">{fmtFloat(ad.conversions)}</span></p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Landing Pages */}
        <TabsContent value="landing" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Páginas de destino</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">URLs que receberam tráfego e sua performance.</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={landingPages.isLoading}
                rows={landingPages.data?.rows}
                columns={["name", "impressions", "clicks", "ctr", "cost", "conversions", "cpa"]}
                labels={{ name: "URL" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Targeting (bid modifiers + ad schedule + locations) */}
        <TabsContent value="targeting" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Ajustes de lance (Bid Modifiers)</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Modificadores aplicados a dispositivo, interação, etc. Ex: 1.20 = +20%.</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={bidModifiers.isLoading}
                rows={bidModifiers.data?.rows}
                columns={["name", "bid_modifier"]}
                labels={{ name: "Tipo", bid_modifier: "Modificador" }}
              />
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Programação de anúncios</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Dias e horários em que a campanha está ativa.</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={adSchedule.isLoading}
                rows={adSchedule.data?.rows}
                columns={["name", "bid_modifier"]}
                labels={{ name: "Janela", bid_modifier: "Ajuste de lance" }}
              />
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Localizações segmentadas</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Regiões alvo da campanha (positivas e negativas).</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={locationsTargeted.isLoading}
                rows={locationsTargeted.data?.rows}
                columns={["name", "negative", "bid_modifier"]}
                labels={{ name: "Local", negative: "Excluída", bid_modifier: "Ajuste" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversion Actions */}
        <TabsContent value="conversions" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Ações de conversão configuradas</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Quais conversões a conta está rastreando.</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={conversionActions.isLoading}
                rows={conversionActions.data?.rows}
                columns={["name", "category", "type", "status", "primary", "default_value", "currency"]}
                labels={{ name: "Ação", category: "Categoria", type: "Tipo", primary: "Principal", default_value: "Valor padrão", currency: "Moeda" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Impression Share */}
        <TabsContent value="impression_share" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Parcela de impressões (Search Impression Share)</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Quanto da sua audiência potencial você está alcançando — e por que está perdendo.</p>
            </CardHeader>
            <CardContent className="p-4">
              {qualityShare.isLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : !qualityShare.data?.rows?.length ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Sem dados</div>
              ) : (() => {
                const q = qualityShare.data.rows[0];
                const items = [
                  { label: "Imp. Share", value: q.search_impression_share, hint: "Total de impressões obtidas" },
                  { label: "Top Imp. Share", value: q.search_top_impression_share, hint: "Aparecendo acima dos resultados" },
                  { label: "Abs. Top Imp. Share", value: q.search_absolute_top_impression_share, hint: "Aparecendo na 1ª posição" },
                  { label: "Perdida (orçamento)", value: q.search_budget_lost_impression_share, hint: "Faltou orçamento", warn: true },
                  { label: "Perdida (rank)", value: q.search_rank_lost_impression_share, hint: "Lance/QS baixo", warn: true },
                  { label: "Top perdida (orçamento)", value: q.search_budget_lost_top_impression_share, hint: "—", warn: true },
                  { label: "Top perdida (rank)", value: q.search_rank_lost_top_impression_share, hint: "—", warn: true },
                ];
                return (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {items.map((it) => (
                      <div key={it.label} className="rounded-md border border-border/40 p-3 bg-muted/10">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{it.label}</p>
                        <p className={cn("text-lg font-bold tabular-nums mt-1", it.warn && it.value && it.value > 0.1 ? "text-rose-400" : "text-foreground")}>
                          {it.value != null ? fmtPct(it.value) : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{it.hint}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Histórico de mudanças (últimos 30 dias)</CardTitle></CardHeader>
            <CardContent className="p-0">
              {history.isLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : !history.data?.rows?.length ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma mudança registrada</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground border-b border-border/50 bg-muted/20">
                      <tr>
                        <th className="text-left py-2.5 px-3 font-semibold">Data</th>
                        <th className="text-left py-2.5 px-2 font-semibold">Usuário</th>
                        <th className="text-left py-2.5 px-2 font-semibold">Operação</th>
                        <th className="text-left py-2.5 px-2 font-semibold">Recurso</th>
                        <th className="text-left py-2.5 px-2 font-semibold">Cliente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.data.rows.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-2 px-3 font-mono text-[10px]">{r.change_date_time}</td>
                          <td className="py-2 px-2">{r.user_email || "—"}</td>
                          <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{r.operation}</Badge></td>
                          <td className="py-2 px-2 font-mono text-[10px]">{r.resource_type}</td>
                          <td className="py-2 px-2 text-[10px]">{r.client_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Budget edit dialog */}
      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar orçamento diário</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Valor atual: <strong>{fmtMoney(camp.data?.rows?.[0]?.budget || 0)}</strong></p>
            <Input type="number" step="0.01" min="0" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} placeholder="Novo valor (R$)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetOpen(false)}>Cancelar</Button>
            <Button onClick={() => updateBudget.mutate(parseFloat(newBudget))} disabled={updateBudget.isPending || !newBudget}>
              {updateBudget.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

