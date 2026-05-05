/**
 * MetaAdsCampaignDetail — detalhe de UMA campaign Meta Ads.
 * Mostra header, KPIs agregados, lista de adsets e ads.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useMetaAdsReports } from "@/hooks/api/use-meta-ads-reports";
import type { MetaPeriod } from "@/hooks/api/use-meta-multi-account-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, DollarSign, Loader2, MousePointerClick, RefreshCw, Target, TrendingUp } from "lucide-react";

const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtFloat = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function MetaAdsCampaignDetail() {
  const { account_id = "", campaign_id = "" } = useParams();
  const { data: workspace } = useWorkspace();
  const [period, setPeriod] = useState<MetaPeriod>("30d");

  // Find campaign in account-level report
  const campaignsQ = useMetaAdsReports({ workspaceId: workspace?.id, accountId: account_id, period, level: "campaign" });
  const adsetsQ = useMetaAdsReports({ workspaceId: workspace?.id, accountId: account_id, period, level: "adset", parentId: campaign_id });
  const adsetIds = useMemo(() => (adsetsQ.data?.rows || []).map((a) => a.id), [adsetsQ.data]);
  const adsQ = useMetaAdsReports({
    workspaceId: workspace?.id,
    accountId: account_id,
    period,
    level: "ad",
    enabled: !!adsetIds.length,
  });

  const campaign = (campaignsQ.data?.rows || []).find((c) => c.id === campaign_id);
  const ads = (adsQ.data?.rows || []).filter((a) => adsetIds.includes(a.adset_id || ""));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/meta-ads/account/${account_id}`}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar pra conta</Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">{campaign?.name || `Campanha ${campaign_id}`}</h1>
          <div className="flex items-center gap-2 mt-1">
            {campaign?.status && <StatusBadge status={campaign.status} />}
            {campaign?.objective && <Badge variant="outline" className="text-[10px]">{campaign.objective}</Badge>}
            <span className="text-[10px] font-mono text-muted-foreground">act_{account_id} · {campaign_id}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as MetaPeriod)}>
            <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="14d">Últimos 14 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { campaignsQ.refetch(); adsetsQ.refetch(); adsQ.refetch(); }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {campaign && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={DollarSign} label="Spend" value={fmtMoney(campaign.spend)} />
          <Kpi icon={Target} label="Conversões" value={fmtFloat(campaign.conversions, 1)} sub={fmtMoney(campaign.conv_value)} />
          <Kpi icon={TrendingUp} label="ROAS" value={`${fmtFloat(campaign.roas, 2)}x`} sub={`CPA ${fmtMoney(campaign.cpa)}`} />
          <Kpi icon={MousePointerClick} label="Cliques" value={fmtNum(campaign.clicks)} sub={`CTR ${(campaign.ctr * 100).toFixed(2)}%`} />
        </div>
      )}

      <Tabs defaultValue="adsets">
        <TabsList>
          <TabsTrigger value="adsets">Adsets ({adsetsQ.data?.count || 0})</TabsTrigger>
          <TabsTrigger value="ads">Ads ({ads.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="adsets">
          <Card className="glass-card">
            <CardContent className="p-0">
              {adsetsQ.isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : (adsetsQ.data?.rows || []).length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">Nenhum adset.</p>
              ) : (
                <RowsTable rows={adsetsQ.data!.rows} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ads">
          <Card className="glass-card">
            <CardContent className="p-0">
              {adsQ.isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : ads.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">Nenhum ad.</p>
              ) : (
                <RowsTable rows={ads} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RowsTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            <th className="text-left p-2 font-medium">Nome</th>
            <th className="text-left p-2 font-medium">Status</th>
            <th className="text-right p-2 font-medium">Spend</th>
            <th className="text-right p-2 font-medium">Cliques</th>
            <th className="text-right p-2 font-medium">Conv.</th>
            <th className="text-right p-2 font-medium">CPA</th>
            <th className="text-right p-2 font-medium">ROAS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-muted/20">
              <td className="p-2 max-w-[320px]"><p className="truncate font-medium">{r.name}</p></td>
              <td className="p-2"><StatusBadge status={r.status} /></td>
              <td className="p-2 text-right font-medium">{fmtMoney(r.spend)}</td>
              <td className="p-2 text-right">{fmtNum(r.clicks)}</td>
              <td className="p-2 text-right">{fmtFloat(r.conversions, 1)}</td>
              <td className="p-2 text-right">{fmtMoney(r.cpa)}</td>
              <td className="p-2 text-right">{fmtFloat(r.roas, 2)}x</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-xl font-bold text-gradient-primary">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-green-500/20 text-green-400 border-green-500/30",
    PAUSED: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    DELETED: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    ARCHIVED: "bg-muted text-muted-foreground border-border",
  };
  const cls = map[status] || "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={`text-[9px] ${cls}`}>{status}</Badge>;
}
