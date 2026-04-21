import { useState } from "react";
import { useParams } from "react-router-dom";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useCampaignMetrics } from "@/hooks/api/use-campaign-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CampaignStatusBadge as StatusBadge } from "@/components/dashboard/CampaignStatusBadge";
import { CampaignDataTable as SimpleTable } from "@/components/dashboard/CampaignDataTable";
import { CampaignHeader } from "@/components/google-ads/CampaignHeader";
import { MetricsOverview } from "@/components/google-ads/MetricsOverview";
import { ConversionDistribution } from "@/components/google-ads/ConversionDistribution";
import { CampaignSettings } from "@/components/google-ads/CampaignSettings";
import { AutomationCommandCenter } from "@/components/automation/AutomationCommandCenter";
import { useCampaignEdits } from "@/hooks/api/use-campaign-edits";
import { StatusToggle, BidEditor, QuickNegativeButton } from "@/components/google-ads/RowActions";
import { AddNegativeKeywordForm } from "@/components/google-ads/AddNegativeKeywordForm";

const fmtNumber = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const fmtFloat = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

export default function GoogleAdsCampaignDetail() {
  const { customerId = "", campaignId = "" } = useParams();
  const { data: workspace } = useWorkspace();
  const [tab, setTab] = useState("overview");
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newBudget, setNewBudget] = useState("");

  const m = useCampaignMetrics({ workspaceId: workspace?.id, customerId, campaignId });
  const edits = useCampaignEdits({ workspaceId: workspace?.id, customerId, campaignId });
  const { reports } = m;
  const budget = (reports.camp.data?.rows?.[0]?.budget as number) || 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <CampaignHeader
        campaign={m.campaign}
        campaignId={campaignId}
        customerId={customerId}
        isLoadingHeader={m.isLoadingHeader}
        period={m.period}
        onPeriodChange={m.setPeriod}
        onTogglePause={() => m.toggleStatus.mutate("PAUSED")}
        onToggleResume={() => m.toggleStatus.mutate("ENABLED")}
        toggleStatusPending={m.toggleStatus.isPending}
        onOpenBudget={() => { setNewBudget(budget.toString()); setBudgetOpen(true); }}
      />

      {m.errMsg && (
        <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="break-all">{m.errMsg}</p>
        </div>
      )}

      <AutomationCommandCenter workspaceId={workspace?.id} targetId={campaignId} limit={6} />

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
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="conversions">Conversões</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <MetricsOverview
            totals={m.totals}
            budget={budget}
            biddingStrategy={m.campaign?.bidding_strategy_type || ""}
            chartData={m.chartData}
            chartLoading={reports.series.isLoading}
          />

          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Grupos de anúncios</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable loading={reports.adGroups.isLoading} rows={reports.adGroups.data?.rows} columns={["name", "status", "impressions", "clicks", "ctr", "cost", "conversions", "cpa"]} />
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="glass-card">
              <CardHeader className="py-3"><CardTitle className="text-sm">Por dispositivo</CardTitle></CardHeader>
              <CardContent className="p-0">
                <SimpleTable loading={reports.deviceData.isLoading} rows={reports.deviceData.data?.rows} columns={["name", "impressions", "clicks", "ctr", "cost", "conversions"]} />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="py-3"><CardTitle className="text-sm">Por idade</CardTitle></CardHeader>
              <CardContent className="p-0">
                <SimpleTable loading={reports.ageData.isLoading} rows={reports.ageData.data?.rows} columns={["name", "impressions", "clicks", "ctr", "cost", "conversions"]} />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="py-3"><CardTitle className="text-sm">Por gênero</CardTitle></CardHeader>
              <CardContent className="p-0">
                <SimpleTable loading={reports.genderData.isLoading} rows={reports.genderData.data?.rows} columns={["name", "impressions", "clicks", "ctr", "cost", "conversions"]} />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="py-3"><CardTitle className="text-sm">Por localização</CardTitle></CardHeader>
              <CardContent className="p-0">
                <SimpleTable loading={reports.geoData.isLoading} rows={reports.geoData.data?.rows} columns={["name", "impressions", "clicks", "ctr", "cost", "conversions"]} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="keywords" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Palavras-chave</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={reports.keywords.isLoading}
                rows={reports.keywords.data?.rows}
                columns={["name", "match_type", "status", "quality_score", "impressions", "clicks", "ctr", "cost", "conversions", "cpa"]}
                labels={{ name: "Palavra-chave", match_type: "Tipo", quality_score: "QS" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="negatives" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Palavras-chave negativas — nível Campanha</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Termos que <strong>bloqueiam</strong> seus anúncios em toda a campanha (ex: "grátis", "barato").</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={reports.negKeywordsCamp.isLoading}
                rows={reports.negKeywordsCamp.data?.rows}
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
                loading={reports.negKeywordsAg.isLoading}
                rows={reports.negKeywordsAg.data?.rows}
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
                loading={reports.negKeywordsShared.isLoading}
                rows={reports.negKeywordsShared.data?.rows}
                columns={["name", "match_type", "shared_set_name"]}
                labels={{ name: "Palavra negativa", match_type: "Tipo", shared_set_name: "Lista" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audiences" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Audiências segmentadas</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable loading={reports.audienceData.isLoading} rows={reports.audienceData.data?.rows} columns={["name", "type", "impressions", "clicks", "ctr", "cost", "conversions"]} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extensions" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Extensões / Assets</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={reports.extensions.isLoading}
                rows={reports.extensions.data?.rows}
                columns={["name", "type", "impressions", "clicks", "ctr", "cost", "conversions"]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search_terms" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3"><CardTitle className="text-sm">Termos pesquisados (o que usuários digitaram)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={reports.searchTerms.isLoading}
                rows={reports.searchTerms.data?.rows}
                columns={["name", "matched_keyword", "match_type", "impressions", "clicks", "ctr", "cost", "conversions"]}
                labels={{ name: "Termo pesquisado", matched_keyword: "Keyword", match_type: "Tipo" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ads" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Anúncios criativos</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">Performance de cada anúncio (headlines, descrições e métricas).</p>
            </CardHeader>
            <CardContent className="p-0">
              {reports.ads.isLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : !reports.ads.data?.rows?.length ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Sem anúncios no período</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {reports.ads.data.rows.map((ad: any) => (
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

        <TabsContent value="landing" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Páginas de destino</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">URLs que receberam tráfego e sua performance.</p>
            </CardHeader>
            <CardContent className="p-0">
              <SimpleTable
                loading={reports.landingPages.isLoading}
                rows={reports.landingPages.data?.rows}
                columns={["name", "impressions", "clicks", "ctr", "cost", "conversions", "cpa"]}
                labels={{ name: "URL" }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <CampaignSettings
            bidModifiers={reports.bidModifiers}
            adSchedule={reports.adSchedule}
            locationsTargeted={reports.locationsTargeted}
            history={reports.history}
          />
        </TabsContent>

        <TabsContent value="conversions" className="mt-4">
          <ConversionDistribution
            conversionActions={reports.conversionActions}
            qualityShare={reports.qualityShare}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar orçamento diário</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Valor atual: <strong>{fmtMoney(budget)}</strong></p>
            <Input type="number" step="0.01" min="0" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} placeholder="Novo valor (R$)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetOpen(false)}>Cancelar</Button>
            <Button onClick={() => m.updateBudget.mutate(parseFloat(newBudget))} disabled={m.updateBudget.isPending || !newBudget}>
              {m.updateBudget.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
