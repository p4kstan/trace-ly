/**
 * FacebookAdsCampaigns — visão consolidada multi-conta de todas as contas
 * Meta Ads (Facebook + Instagram) conectadas no workspace.
 * Mirrors GoogleAdsOverview architecture.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useMetaMultiAccountOverview, type MetaPeriod } from "@/hooks/api/use-meta-multi-account-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, RefreshCw, AlertCircle, TrendingUp, DollarSign, Target, MousePointerClick, ExternalLink, Loader2 } from "lucide-react";

const fmtMoney = (n: number, c = "BRL") => n.toLocaleString("pt-BR", { style: "currency", currency: c });
const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtFloat = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtPct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

const PERIODS: { value: MetaPeriod; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "14d", label: "Últimos 14 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
];

export default function FacebookAdsCampaigns() {
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const [period, setPeriod] = useState<MetaPeriod>("30d");
  const q = useMetaMultiAccountOverview(workspace?.id, period);

  const data = q.data;
  const totals = data?.totals;
  const accounts = data?.accounts || [];
  const top = data?.top_campaigns || [];
  const errored = accounts.filter((a) => a.status === "error");
  const totalSpend = totals?.spend || 0;
  const primaryCurrency = accounts.find((a) => a.status === "ok")?.currency || "BRL";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" /> Campanhas Facebook & Instagram Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Métricas agregadas de todas as contas Meta Ads conectadas neste workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as MetaPeriod)}>
            <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {q.error && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="p-3 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {(q.error as Error).message}
          </CardContent>
        </Card>
      )}

      {errored.length > 0 && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="p-3 space-y-1.5">
            <p className="text-xs font-semibold text-rose-300 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {errored.length} conta(s) com erro
            </p>
            {errored.map((a) => (
              <p key={a.account_id} className="text-[11px] text-muted-foreground">
                <span className="font-mono">act_{a.account_id}</span> — {a.name}: <span className="text-rose-400">{a.error}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {!q.isLoading && accounts.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-8 text-center space-y-3">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhuma conta Meta Ads conectada neste workspace.</p>
            <Button size="sm" onClick={() => navigate("/contas-conectadas")}>Conectar primeira conta Meta</Button>
          </CardContent>
        </Card>
      )}

      {totals && accounts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={DollarSign} label="Investimento" value={fmtMoney(totals.spend, primaryCurrency)} sub={`${accounts.length} conta(s)`} />
          <Kpi icon={Target} label="Conversões" value={fmtFloat(totals.conversions, 1)} sub={`Receita: ${fmtMoney(totals.conv_value, primaryCurrency)}`} />
          <Kpi icon={TrendingUp} label="ROAS" value={`${fmtFloat(totals.roas, 2)}x`} sub={`CPA: ${fmtMoney(totals.cpa, primaryCurrency)}`} />
          <Kpi icon={MousePointerClick} label="Cliques" value={fmtNum(totals.clicks)} sub={`CTR: ${fmtPct(totals.ctr)} · CPC: ${fmtMoney(totals.cpc, primaryCurrency)}`} />
        </div>
      )}

      {accounts.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="py-3"><CardTitle className="text-sm">Ranking de contas por investimento</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {accounts.slice().sort((a, b) => b.totals.spend - a.totals.spend).map((a) => {
                const share = totalSpend > 0 ? a.totals.spend / totalSpend : 0;
                return (
                  <div
                    key={a.account_id}
                    className="p-3 flex items-center gap-3 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/meta-ads/account/${a.account_id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <Badge variant="outline" className="text-[9px] font-mono">act_{a.account_id}</Badge>
                        {a.status === "error" && <Badge variant="destructive" className="text-[9px]">erro</Badge>}
                      </div>
                      <div className="mt-1.5 h-1.5 bg-muted/40 rounded overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${share * 100}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0 grid grid-cols-3 gap-4 text-[11px]">
                      <Stat label="Spend" value={fmtMoney(a.totals.spend, a.currency)} bold />
                      <Stat label="Conv." value={fmtFloat(a.totals.conversions, 1)} />
                      <Stat label="ROAS" value={`${fmtFloat(a.totals.roas, 2)}x`} />
                    </div>
                    <div className="text-right text-[10px] text-muted-foreground w-12 shrink-0">{fmtPct(share)}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {top.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="py-3"><CardTitle className="text-sm">Top 10 campanhas (todas as contas)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 font-medium">Campanha</th>
                    <th className="text-left p-2 font-medium">Conta</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-right p-2 font-medium">Spend</th>
                    <th className="text-right p-2 font-medium">Conv.</th>
                    <th className="text-right p-2 font-medium">CPA</th>
                    <th className="text-right p-2 font-medium">ROAS</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {top.map((c) => (
                    <tr key={`${c.account_id}-${c.campaign_id}`} className="hover:bg-muted/20">
                      <td className="p-2 max-w-[280px]"><p className="truncate font-medium">{c.name}</p></td>
                      <td className="p-2 text-muted-foreground truncate max-w-[160px]">{c.account_name}</td>
                      <td className="p-2"><StatusBadge status={c.status} /></td>
                      <td className="p-2 text-right font-medium">{fmtMoney(c.spend, primaryCurrency)}</td>
                      <td className="p-2 text-right">{fmtFloat(c.conversions, 1)}</td>
                      <td className="p-2 text-right">{fmtMoney(c.cpa, primaryCurrency)}</td>
                      <td className="p-2 text-right">{fmtFloat(c.roas, 2)}x</td>
                      <td className="p-2">
                        <Button
                          size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => navigate(`/meta-ads/campaign/${c.account_id}/${c.campaign_id}`)}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {q.isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      )}
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
function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
      <p className={bold ? "font-semibold text-foreground" : "text-foreground"}>{value}</p>
    </div>
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
