/**
 * MetaAdsAccountDetail — detalhe de UMA conta Meta Ads.
 * Lista todas as campaigns com filtros + KPIs.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useMetaAdsReports } from "@/hooks/api/use-meta-ads-reports";
import type { MetaPeriod } from "@/hooks/api/use-meta-multi-account-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowUpDown, DollarSign, ExternalLink, Loader2, MousePointerClick, RefreshCw, Target, TrendingUp } from "lucide-react";

const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtFloat = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

type SortKey = "spend" | "conversions" | "roas" | "cpa";

export default function MetaAdsAccountDetail() {
  const { account_id = "" } = useParams();
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const [period, setPeriod] = useState<MetaPeriod>("30d");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [name, setName] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("spend");

  const q = useMetaAdsReports({ workspaceId: workspace?.id, accountId: account_id, period, level: "campaign" });

  const rows = useMemo(() => {
    const list = q.data?.rows || [];
    return list
      .filter((r) => statusFilter === "ALL" || r.status === statusFilter)
      .filter((r) => !name || r.name.toLowerCase().includes(name.toLowerCase()))
      .sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  }, [q.data, statusFilter, name, sortKey]);

  const totals = q.data?.totals;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/facebook-ads-campaigns"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar pra Meta Ads</Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">Conta act_{account_id}</h1>
          <p className="text-sm text-muted-foreground mt-1">Campanhas, métricas e detalhes da conta selecionada.</p>
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
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={DollarSign} label="Spend" value={fmtMoney(totals.spend)} />
          <Kpi icon={Target} label="Conversões" value={fmtFloat(totals.conversions, 1)} sub={fmtMoney(totals.conv_value)} />
          <Kpi icon={TrendingUp} label="ROAS" value={`${fmtFloat(totals.roas, 2)}x`} sub={`CPA ${fmtMoney(totals.cpa)}`} />
          <Kpi icon={MousePointerClick} label="Cliques" value={fmtNum(totals.clicks)} sub={`CTR ${(totals.ctr * 100).toFixed(2)}%`} />
        </div>
      )}

      <Card className="glass-card">
        <CardHeader className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">Campanhas ({q.data?.count || 0})</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Filtrar nome…" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs w-40" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  <SelectItem value="ACTIVE">Ativas</SelectItem>
                  <SelectItem value="PAUSED">Pausadas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><ArrowUpDown className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spend">Spend</SelectItem>
                  <SelectItem value="conversions">Conv.</SelectItem>
                  <SelectItem value="roas">ROAS</SelectItem>
                  <SelectItem value="cpa">CPA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Sem campanhas pra esses filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 font-medium">Campanha</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-right p-2 font-medium">Spend</th>
                    <th className="text-right p-2 font-medium">Cliques</th>
                    <th className="text-right p-2 font-medium">Conv.</th>
                    <th className="text-right p-2 font-medium">CPA</th>
                    <th className="text-right p-2 font-medium">ROAS</th>
                    <th className="p-2"></th>
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
                      <td className="p-2">
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => navigate(`/meta-ads/campaign/${account_id}/${r.id}`)}>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
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
