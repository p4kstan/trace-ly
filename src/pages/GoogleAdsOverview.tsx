/**
 * GoogleAdsOverview — visão consolidada multi-conta de todas as contas
 * Google Ads conectadas no workspace.
 *
 * Mostra:
 *   - KPIs globais (cost, conversions, ROAS, CPA)
 *   - Ranking de contas por custo (com share %)
 *   - Top 10 campanhas globais (cross-account, link direto p/ detalhe)
 *   - Erros por conta (token expirado, sem permissão, etc.)
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useMultiAccountOverview, type MultiAccountPeriod } from "@/hooks/api/use-multi-account-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, RefreshCw, AlertCircle, TrendingUp, DollarSign, Target, MousePointerClick, ExternalLink, Loader2 } from "lucide-react";

const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtFloat = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtPct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

const PERIODS: { value: MultiAccountPeriod; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "14d", label: "Últimos 14 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
];

export default function GoogleAdsOverview() {
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const [period, setPeriod] = useState<MultiAccountPeriod>("30d");
  const q = useMultiAccountOverview(workspace?.id, period);

  const data = q.data;
  const totals = data?.totals;
  const accounts = data?.accounts || [];
  const top = data?.top_campaigns || [];
  const errored = accounts.filter((a) => a.status === "error");
  const totalCost = totals?.cost || 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" /> Visão Consolidada Multi-Conta
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Métricas agregadas de todas as contas Google Ads conectadas neste workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as MultiAccountPeriod)}>
            <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Errors */}
      {errored.length > 0 && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="p-3 space-y-1.5">
            <p className="text-xs font-semibold text-rose-300 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {errored.length} conta(s) com erro
            </p>
            {errored.map((a) => (
              <p key={a.customer_id} className="text-[11px] text-muted-foreground">
                <span className="font-mono">{a.customer_id}</span> — {a.name}: <span className="text-rose-400">{a.error}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {!q.isLoading && accounts.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-8 text-center space-y-3">
            <Layers className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhuma conta Google Ads conectada neste workspace.</p>
            <Button size="sm" onClick={() => navigate("/connected-accounts")}>Conectar conta</Button>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={DollarSign} label="Custo total" value={fmtMoney(totals.cost)} sub={`${accounts.length} conta(s)`} />
          <Kpi icon={Target} label="Conversões" value={fmtFloat(totals.conversions, 1)} sub={`Valor: ${fmtMoney(totals.conv_value)}`} />
          <Kpi icon={TrendingUp} label="ROAS" value={`${fmtFloat(totals.roas, 2)}x`} sub={`CPA: ${fmtMoney(totals.cpa)}`} />
          <Kpi icon={MousePointerClick} label="Cliques" value={fmtNum(totals.clicks)} sub={`CTR: ${fmtPct(totals.ctr)} · CPC: ${fmtMoney(totals.cpc)}`} />
        </div>
      )}

      {/* Accounts ranking */}
      {accounts.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Ranking de contas por custo</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {accounts.sort((a, b) => b.totals.cost - a.totals.cost).map((a) => {
                const share = totalCost > 0 ? a.totals.cost / totalCost : 0;
                return (
                  <div key={a.customer_id} className="p-3 flex items-center gap-3 hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <Badge variant="outline" className="text-[9px] font-mono">{a.customer_id}</Badge>
                        {a.status === "error" && <Badge variant="destructive" className="text-[9px]">erro</Badge>}
                      </div>
                      {/* Bar */}
                      <div className="mt-1.5 h-1.5 bg-muted/40 rounded overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${share * 100}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0 grid grid-cols-3 gap-4 text-[11px]">
                      <Stat label="Custo" value={fmtMoney(a.totals.cost)} bold />
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

      {/* Top campaigns */}
      {top.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Top 10 campanhas (todas as contas)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 font-medium">Campanha</th>
                    <th className="text-left p-2 font-medium">Conta</th>
                    <th className="text-right p-2 font-medium">Custo</th>
                    <th className="text-right p-2 font-medium">Conv.</th>
                    <th className="text-right p-2 font-medium">CPA</th>
                    <th className="text-right p-2 font-medium">ROAS</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {top.map((c) => (
                    <tr key={`${c.customer_id}-${c.campaign_id}`} className="hover:bg-muted/20">
                      <td className="p-2 max-w-[280px]"><p className="truncate font-medium">{c.campaign_name}</p></td>
                      <td className="p-2 text-muted-foreground truncate max-w-[160px]">{c.account_name}</td>
                      <td className="p-2 text-right font-medium">{fmtMoney(c.cost)}</td>
                      <td className="p-2 text-right">{fmtFloat(c.conversions, 1)}</td>
                      <td className="p-2 text-right">{fmtMoney(c.cpa)}</td>
                      <td className="p-2 text-right">{fmtFloat(c.roas, 2)}x</td>
                      <td className="p-2">
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => navigate(`/google-ads-campaigns/${c.customer_id}/${c.campaign_id}`)}>
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
