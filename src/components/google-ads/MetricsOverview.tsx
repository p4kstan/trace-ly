/**
 * MetricsOverview — KPI cards row + daily performance line chart.
 * Used inside the Google Ads Campaign Detail "Visão geral" tab.
 */
import { Loader2, DollarSign, MousePointerClick, BarChart3, Target, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend,
} from "recharts";
import { CampaignMetricCard as MetricCard } from "@/components/dashboard/CampaignMetricCard";
import { DeltaBadge } from "./DeltaBadge";
import { pctDelta, type CampaignTotals } from "@/hooks/api/use-period-comparison";

const fmtNumber = (n: number): string => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtMoney = (n: number): string => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number): string => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const fmtFloat = (n: number, d = 2): string => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

interface Totals {
  cost: number;
  clicks: number;
  ctr: number;
  impressions: number;
  cpc: number;
  conversions: number;
  cpa: number;
  roas: number;
  conversions_value: number;
}

interface MetricsOverviewProps {
  totals: Totals | undefined;
  budget: number;
  biddingStrategy: string;
  chartData: Array<{ date: string; cost: number; clicks: number; conversions: number; roas: number }>;
  chartLoading: boolean;
  /** Optional: enable "vs previous period" comparison badges. */
  compareEnabled?: boolean;
  comparePrev?: CampaignTotals | null;
}

export function MetricsOverview({ totals, budget, biddingStrategy, chartData, chartLoading, compareEnabled, comparePrev }: MetricsOverviewProps) {
  const showDelta = !!(compareEnabled && comparePrev);
  const d = (cur: number, prev: number, inverted = false) =>
    showDelta ? <DeltaBadge delta={pctDelta(cur, prev)} inverted={inverted} /> : undefined;

  return (
    <>
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard icon={DollarSign} label="Custo" value={fmtMoney(totals.cost)} delta={d(totals.cost, comparePrev?.cost ?? 0, true)} />
          <MetricCard icon={MousePointerClick} label="Cliques" value={fmtNumber(totals.clicks)} hint={`CTR ${fmtPct(totals.ctr)}`} delta={d(totals.clicks, comparePrev?.clicks ?? 0)} />
          <MetricCard icon={BarChart3} label="Impressões" value={fmtNumber(totals.impressions)} hint={`CPC ${fmtMoney(totals.cpc)}`} delta={d(totals.impressions, comparePrev?.impressions ?? 0)} />
          <MetricCard icon={Target} label="Conversões" value={fmtFloat(totals.conversions)} hint={`CPA ${fmtMoney(totals.cpa)}`} delta={d(totals.conversions, comparePrev?.conversions ?? 0)} />
          <MetricCard icon={TrendingUp} label="ROAS" value={fmtFloat(totals.roas)} hint={`Valor ${fmtMoney(totals.conversions_value)}`} delta={d(totals.roas, comparePrev?.roas ?? 0)} />
          <MetricCard icon={DollarSign} label="Orçamento diário" value={fmtMoney(budget)} hint={biddingStrategy} />
        </div>
      )}

      <Card className="glass-card">
        <CardHeader className="py-3"><CardTitle className="text-sm">Performance diária</CardTitle></CardHeader>
        <CardContent className="h-[320px]">
          {chartLoading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Sem dados no período
            </div>
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
    </>
  );
}
