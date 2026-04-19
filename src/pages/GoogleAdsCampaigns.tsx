import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronRight, ChevronLeft, RefreshCw, Loader2, BarChart3, MousePointerClick, DollarSign, Target, TrendingUp, Calendar as CalendarIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

type Level = "campaigns" | "ad_groups" | "ads";
type Period = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d" | "custom";

interface ReportRow {
  id: string;
  name: string;
  status?: string | null;
  channel_type?: string | null;
  type?: string | null;
  campaign_id?: string;
  campaign_name?: string;
  ad_group_id?: string;
  ad_group_name?: string;
  headlines?: string[];
  descriptions?: string[];
  final_urls?: string[];
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  cpc: number;
  conversions: number;
  conversions_value: number;
  cpa: number;
  roas: number;
  conv_rate: number;
  search_impression_share?: number | null;
}

interface Totals {
  impressions: number;
  clicks: number;
  cost: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversions_value: number;
  cpa: number;
  roas: number;
  conv_rate: number;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "Últimos 7 dias",
  "14d": "Últimos 14 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  custom: "Personalizado",
};

const fmtNumber = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const fmtFloat = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const cls = status === "ENABLED"
    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
    : status === "PAUSED"
    ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
    : "border-rose-500/30 text-rose-400 bg-rose-500/10";
  const label = status === "ENABLED" ? "Ativada" : status === "PAUSED" ? "Pausada" : "Removida";
  return <Badge variant="outline" className={cn("text-[10px]", cls)}>{label}</Badge>;
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{label}</p>
          <Icon className="w-3.5 h-3.5 text-primary/70" />
        </div>
        <p className="text-xl font-bold tabular-nums text-foreground mt-2">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function GoogleAdsCampaigns() {
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const [customerId, setCustomerId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("7d");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [breadcrumb, setBreadcrumb] = useState<Array<{ level: Level; id?: string; name?: string }>>([
    { level: "campaigns" },
  ]);

  const current = breadcrumb[breadcrumb.length - 1];
  const level = current.level;
  const parentId = current.id;

  // Load accounts
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["gads-accounts", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_ads_credentials")
        .select("customer_id, account_label, status, is_default")
        .eq("workspace_id", workspace!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ customer_id: string; account_label: string | null; status: string; is_default: boolean | null }>;
    },
  });

  // Auto-select first/default account, and reset if current selection no longer exists
  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    const exists = customerId && accounts.some((a) => a.customer_id === customerId);
    if (!exists) {
      const def = accounts.find((a) => a.is_default) || accounts[0];
      setCustomerId(def.customer_id);
    }
  }, [accounts, customerId]);

  const periodKey = period === "custom"
    ? `custom-${customFrom?.toISOString().slice(0,10) || ""}-${customTo?.toISOString().slice(0,10) || ""}`
    : period;

  const { data: report, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["gads-report", workspace?.id, customerId, level, periodKey, parentId],
    enabled: !!workspace?.id && !!customerId && (period !== "custom" || (!!customFrom && !!customTo)),
    queryFn: async () => {
      const body: any = { workspace_id: workspace!.id, customer_id: customerId, level, period };
      if (period === "custom" && customFrom && customTo) {
        body.from = customFrom.toISOString().slice(0, 10);
        body.to = customTo.toISOString().slice(0, 10);
      }
      if (parentId) body.parent_id = parentId;
      const { data, error } = await supabase.functions.invoke("google-ads-reports", { body });
      if (error) {
        let info: any = null;
        try { info = await (error as any)?.context?.json?.(); } catch { /* ignore */ }
        throw new Error(info?.error || error.message);
      }
      return data as { ok: true; rows: ReportRow[]; totals: Totals; count: number };
    },
    staleTime: 60_000,
  });

  // Cross with CapiTrack revenue (orders) for the same period
  const { data: capiRevenue } = useQuery({
    queryKey: ["capi-revenue", workspace?.id, periodKey],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const now = new Date();
      let from: Date;
      let to: Date = now;
      if (period === "today") { from = new Date(); from.setHours(0,0,0,0); }
      else if (period === "yesterday") { from = new Date(); from.setDate(from.getDate()-1); from.setHours(0,0,0,0); to = new Date(); to.setHours(0,0,0,0); }
      else if (period === "7d") { from = new Date(); from.setDate(from.getDate()-7); }
      else if (period === "14d") { from = new Date(); from.setDate(from.getDate()-14); }
      else if (period === "30d") { from = new Date(); from.setDate(from.getDate()-30); }
      else if (period === "90d") { from = new Date(); from.setDate(from.getDate()-90); }
      else if (period === "custom" && customFrom && customTo) { from = customFrom; to = customTo; }
      else { from = new Date(); from.setDate(from.getDate()-7); }

      const { data } = await supabase
        .from("conversions")
        .select("value")
        .eq("workspace_id", workspace!.id)
        .gte("happened_at", from.toISOString())
        .lte("happened_at", to.toISOString())
        .eq("attributed_source", "google");

      const total = (data || []).reduce((a, r) => a + Number(r.value || 0), 0);
      return total;
    },
  });

  const drillDown = (row: ReportRow) => {
    if (level === "campaigns") {
      // Open dedicated detail page with all tabs (keywords, audiences, extensions, history, etc.)
      navigate(`/google-ads-campaigns/${customerId}/${row.id}`);
    } else if (level === "ad_groups") {
      setBreadcrumb([...breadcrumb, { level: "ads", id: row.id, name: row.name }]);
    }
  };

  const drillUp = (idx: number) => {
    setBreadcrumb(breadcrumb.slice(0, idx + 1));
  };

  const sync = async () => {
    if (!workspace?.id || !customerId) return;
    toast.loading("Sincronizando…", { id: "sync" });
    try {
      const { error } = await supabase.functions.invoke("google-ads-sync", {
        body: { workspace_id: workspace.id, customer_id: customerId, days: 30 },
      });
      if (error) throw error;
      toast.success("Sincronizado", { id: "sync" });
      refetch();
    } catch (e: any) {
      toast.error(`Falha: ${e.message}`, { id: "sync" });
    }
  };

  const errMsg = error instanceof Error ? error.message : "";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Campanhas Google Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualize campanhas, grupos de anúncios e anúncios em tempo real direto do Google Ads
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">Conta</p>
            {loadingAccounts ? (
              <div className="h-9 rounded border border-border bg-muted/20 flex items-center px-3 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 mr-2 animate-spin" /> Carregando…
              </div>
            ) : !accounts || accounts.length === 0 ? (
              <div className="h-9 rounded border border-amber-500/30 bg-amber-500/10 flex items-center px-3 text-xs text-amber-400">
                Nenhuma conta. Conecte em /setup-google
              </div>
            ) : (
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.customer_id} value={a.customer_id}>
                      {a.account_label || `Conta ${a.customer_id}`} {a.is_default && "★"}
                      <span className="text-muted-foreground ml-2 font-mono text-[10px]">{a.customer_id}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">Período</p>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                  <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {period === "custom" && (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">De</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[140px] justify-start font-normal">
                      <CalendarIcon className="w-3.5 h-3.5 mr-2" />
                      {customFrom ? format(customFrom, "dd/MM/yyyy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">Até</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[140px] justify-start font-normal">
                      <CalendarIcon className="w-3.5 h-3.5 mr-2" />
                      {customTo ? format(customTo, "dd/MM/yyyy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* KPI cards */}
      {report?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard icon={DollarSign} label="Custo" value={fmtMoney(report.totals.cost)} />
          <MetricCard icon={MousePointerClick} label="Cliques" value={fmtNumber(report.totals.clicks)} hint={`CTR ${fmtPct(report.totals.ctr)}`} />
          <MetricCard icon={BarChart3} label="Impressões" value={fmtNumber(report.totals.impressions)} hint={`CPC ${fmtMoney(report.totals.cpc)}`} />
          <MetricCard icon={Target} label="Conversões" value={fmtFloat(report.totals.conversions)} hint={`CPA ${fmtMoney(report.totals.cpa)}`} />
          <MetricCard icon={TrendingUp} label="ROAS (Google)" value={fmtFloat(report.totals.roas)} hint={`Valor ${fmtMoney(report.totals.conversions_value)}`} />
          <MetricCard icon={TrendingUp} label="ROAS (CapiTrack)" value={fmtFloat(report.totals.cost > 0 ? (capiRevenue || 0) / report.totals.cost : 0)} hint={`Receita ${fmtMoney(capiRevenue || 0)}`} />
        </div>
      )}

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        {breadcrumb.map((b, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
            <button
              onClick={() => drillUp(i)}
              className={cn(
                "px-2 py-1 rounded text-xs transition-colors",
                i === breadcrumb.length - 1
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              {i === 0 ? "Campanhas" : b.name || b.id}
            </button>
          </div>
        ))}
        {breadcrumb.length > 1 && (
          <Button variant="ghost" size="sm" onClick={() => drillUp(breadcrumb.length - 2)} className="ml-2 h-7 text-xs">
            <ChevronLeft className="w-3 h-3 mr-1" /> Voltar
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="glass-card">
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            {level === "campaigns" && "Campanhas"}
            {level === "ad_groups" && `Grupos de anúncios — ${current.name}`}
            {level === "ads" && `Anúncios — ${current.name}`}
          </CardTitle>
          {report?.count != null && (
            <span className="text-xs text-muted-foreground">{report.count} {report.count === 1 ? "item" : "itens"}</span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando dados do Google Ads…
            </div>
          ) : errMsg ? (
            <div className="m-4 flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Erro ao carregar</p>
                <p className="break-all opacity-80">{errMsg}</p>
                <Button size="sm" variant="outline" onClick={sync} className="mt-2 h-7 text-xs">Tentar sync e reconectar se necessário</Button>
              </div>
            </div>
          ) : !report?.rows?.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nenhum dado encontrado para o período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border/50 bg-muted/20">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-semibold">Nome</th>
                    <th className="text-left py-2.5 px-2 font-semibold">Status</th>
                    <th className="text-right py-2.5 px-2 font-semibold">Impressões</th>
                    <th className="text-right py-2.5 px-2 font-semibold">Cliques</th>
                    <th className="text-right py-2.5 px-2 font-semibold">CTR</th>
                    <th className="text-right py-2.5 px-2 font-semibold">CPC médio</th>
                    <th className="text-right py-2.5 px-2 font-semibold">Custo</th>
                    <th className="text-right py-2.5 px-2 font-semibold">Conv.</th>
                    <th className="text-right py-2.5 px-2 font-semibold">Tx Conv</th>
                    <th className="text-right py-2.5 px-2 font-semibold">CPA</th>
                    <th className="text-right py-2.5 px-2 font-semibold">Valor</th>
                    <th className="text-right py-2.5 px-3 font-semibold">ROAS</th>
                    {level === "campaigns" && <th className="text-right py-2.5 px-3 font-semibold">Imp. Share</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => {
                    const canDrill = level !== "ads";
                    return (
                      <tr
                        key={r.id}
                        onClick={() => canDrill && drillDown(r)}
                        className={cn(
                          "border-b border-border/30 hover:bg-muted/20 transition-colors",
                          canDrill && "cursor-pointer"
                        )}
                      >
                        <td className="py-2 px-3 max-w-[280px]">
                          <div className="flex items-center gap-1.5">
                            {canDrill && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-foreground/90 truncate font-medium">{r.name || r.id}</p>
                              {level === "ads" && r.headlines && r.headlines.length > 0 && (
                                <p className="text-[10px] text-muted-foreground truncate">{r.headlines.slice(0, 2).join(" · ")}</p>
                              )}
                              {level === "campaigns" && r.channel_type && (
                                <p className="text-[10px] text-muted-foreground">{r.channel_type}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2"><StatusBadge status={r.status} /></td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtNumber(r.impressions)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtNumber(r.clicks)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.ctr)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(r.cpc)}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-medium text-foreground">{fmtMoney(r.cost)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtFloat(r.conversions)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.conv_rate)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.conversions > 0 ? fmtMoney(r.cpa) : "—"}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(r.conversions_value)}</td>
                        <td className={cn("py-2 px-3 text-right tabular-nums font-medium", r.roas >= 2 ? "text-emerald-400" : r.roas >= 1 ? "text-amber-400" : "text-foreground/70")}>
                          {r.roas > 0 ? fmtFloat(r.roas) : "—"}
                        </td>
                        {level === "campaigns" && (
                          <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                            {r.search_impression_share != null ? fmtPct(r.search_impression_share) : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {report.totals && (
                  <tfoot className="border-t border-border/50 bg-muted/30 font-semibold">
                    <tr>
                      <td className="py-2.5 px-3">Total</td>
                      <td></td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{fmtNumber(report.totals.impressions)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{fmtNumber(report.totals.clicks)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{fmtPct(report.totals.ctr)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(report.totals.cpc)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-foreground">{fmtMoney(report.totals.cost)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{fmtFloat(report.totals.conversions)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{fmtPct(report.totals.conv_rate)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{report.totals.conversions > 0 ? fmtMoney(report.totals.cpa) : "—"}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(report.totals.conversions_value)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{report.totals.roas > 0 ? fmtFloat(report.totals.roas) : "—"}</td>
                      {level === "campaigns" && <td></td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
