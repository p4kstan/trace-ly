import { DollarSign, Target, TrendingUp, TrendingDown, Users, Inbox, ShoppingCart, BarChart3, Sparkles, AlertTriangle, Lightbulb, Zap, Brain } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { useWorkspace, useEventStats, useRecentEvents } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

function formatCurrency(val: number) {
  return "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const COLORS = ["hsl(199, 89%, 48%)", "hsl(152, 69%, 46%)", "hsl(265, 80%, 60%)", "hsl(38, 92%, 50%)", "hsl(346, 77%, 50%)"];

const chartTooltipStyle = {
  backgroundColor: "hsl(225, 14%, 8%)",
  border: "1px solid hsl(199, 89%, 48%, 0.15)",
  borderRadius: "10px",
  color: "hsl(210, 20%, 96%)",
  fontSize: "12px",
  boxShadow: "0 12px 32px -8px hsl(0 0% 0% / 0.5), 0 0 0 1px hsl(199 89% 48% / 0.08)",
  backdropFilter: "blur(12px)",
};

function useOrderStats(workspaceId?: string) {
  return useQuery({
    queryKey: ["order-stats", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("status, total_value, currency, gateway, payment_method, utm_source, utm_campaign, created_at, paid_at")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(500);

      const all = orders || [];
      const paid = all.filter(o => o.status === "paid");
      const totalRevenue = paid.reduce((s, o) => s + (Number(o.total_value) || 0), 0);
      const avgTicket = paid.length > 0 ? totalRevenue / paid.length : 0;
      const pendingCount = all.filter(o => o.status === "pending").length;
      const refundCount = all.filter(o => o.status === "refunded" || o.status === "chargeback").length;

      const gateways = [...new Set(paid.map(o => o.gateway))];
      const byGateway = gateways.map(g => ({
        name: g, value: paid.filter(o => o.gateway === g).reduce((s, o) => s + (Number(o.total_value) || 0), 0),
        count: paid.filter(o => o.gateway === g).length,
      })).sort((a, b) => b.value - a.value);

      const methods = [...new Set(paid.map(o => o.payment_method).filter(Boolean))];
      const byMethod = methods.map(m => ({
        name: m!, value: paid.filter(o => o.payment_method === m).reduce((s, o) => s + (Number(o.total_value) || 0), 0),
        count: paid.filter(o => o.payment_method === m).length,
      })).sort((a, b) => b.value - a.value);

      const sources = [...new Set(paid.map(o => o.utm_source).filter(Boolean))];
      const bySource = sources.map(s => ({
        name: s!, revenue: paid.filter(o => o.utm_source === s).reduce((s2, o) => s2 + (Number(o.total_value) || 0), 0),
        count: paid.filter(o => o.utm_source === s).length,
      })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

      const campaigns = [...new Set(paid.map(o => o.utm_campaign).filter(Boolean))];
      const byCampaign = campaigns.map(c => ({
        name: c!, revenue: paid.filter(o => o.utm_campaign === c).reduce((s, o) => s + (Number(o.total_value) || 0), 0),
        count: paid.filter(o => o.utm_campaign === c).length,
      })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

      const byDay = new Map<string, { revenue: number; orders: number }>();
      for (const o of paid) {
        const day = (o.paid_at || o.created_at).substring(0, 10);
        const e = byDay.get(day) || { revenue: 0, orders: 0 };
        e.revenue += Number(o.total_value) || 0;
        e.orders += 1;
        byDay.set(day, e);
      }
      const revenueByDay = Array.from(byDay.entries()).map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date));

      const abandonmentRate = all.length > 0 ? Math.round((pendingCount / all.length) * 100) : 0;

      return { totalRevenue, avgTicket, paidCount: paid.length, pendingCount, refundCount, totalOrders: all.length, byGateway, byMethod, bySource, byCampaign, revenueByDay, abandonmentRate };
    },
  });
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="surface-elevated p-4 space-y-3">
            <div className="flex justify-between">
              <div className="h-3 w-16 rounded animate-shimmer" />
              <div className="h-8 w-8 rounded-lg animate-shimmer" />
            </div>
            <div className="h-7 w-24 rounded animate-shimmer" />
          </div>
        ))}
      </div>
      <div className="surface-elevated p-5">
        <div className="h-4 w-32 rounded animate-shimmer mb-4" />
        <div className="h-[260px] rounded-lg animate-shimmer" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: workspace, isLoading: wsLoading } = useWorkspace();
  const { data: stats, isLoading: statsLoading } = useEventStats(workspace?.id);
  const { data: orderStats, isLoading: orderLoading } = useOrderStats(workspace?.id);
  const { data: recentEvents, isLoading: eventsLoading } = useRecentEvents(workspace?.id);
  const navigate = useNavigate();

  // Fetch recent AI insights
  const { data: aiInsights } = useQuery({
    queryKey: ["dashboard-insights", workspace?.id],
    enabled: !!workspace?.id,
    refetchInterval: 120000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_insights")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .eq("dismissed", false)
        .order("created_at", { ascending: false })
        .limit(4);
      return data || [];
    },
  });

  // Fetch anomaly alerts
  const { data: anomalies } = useQuery({
    queryKey: ["dashboard-anomalies", workspace?.id],
    enabled: !!workspace?.id,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data } = await supabase
        .from("anomaly_alerts")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .eq("acknowledged", false)
        .order("detected_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });
  const isLoading = wsLoading || statsLoading || orderLoading;

  if (!wsLoading && !workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4 animate-pulse-glow">
          <Inbox className="w-7 h-7 text-primary/40" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Nenhum workspace encontrado</h2>
        <p className="text-muted-foreground text-sm text-center max-w-sm">
          Faça login e crie um workspace para começar a rastrear eventos.
        </p>
      </div>
    );
  }

  if (isLoading) return <DashboardSkeleton />;

  const revenue = orderStats?.totalRevenue || stats?.totalRevenue || 0;
  const conversions = orderStats?.paidCount || stats?.totalConversions || 0;
  const avgTicket = orderStats?.avgTicket || 0;
  const roas = stats?.roas || "0x";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {workspace ? workspace.name : "Visão geral do seu rastreamento"}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Receita" value={formatCurrency(revenue)} change={0} icon={DollarSign} />
        <MetricCard title="Compras" value={String(conversions)} change={0} icon={ShoppingCart} />
        <MetricCard title="Ticket Médio" value={formatCurrency(avgTicket)} change={0} icon={TrendingUp} />
        <MetricCard title="ROAS" value={roas} change={0} icon={BarChart3} />
        <MetricCard title="Eventos" value={String(stats?.totalEvents || 0)} change={0} icon={Target} />
        <MetricCard title="Abandono" value={`${orderStats?.abandonmentRate || 0}%`} change={0} icon={Users} />
      </div>

      {/* AI Insights & Anomalies Row */}
      {((anomalies && anomalies.length > 0) || (aiInsights && aiInsights.length > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Anomaly Alerts */}
          {anomalies && anomalies.length > 0 && (
            <div className="surface-elevated p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /> Alertas Ativos
                </h3>
                <Badge variant="outline" className="text-[10px]">{anomalies.length}</Badge>
              </div>
              <div className="space-y-2">
                {anomalies.slice(0, 3).map((a: any) => (
                  <div key={a.id} className={`p-3 rounded-lg border text-sm ${
                    a.severity === "critical" ? "border-destructive/30 bg-destructive/5" : "border-yellow-500/30 bg-yellow-500/5"
                  }`}>
                    <p className="font-medium text-foreground text-xs">{a.metric_name.replace(/_/g, ' ')}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{a.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Insights Preview */}
          {aiInsights && aiInsights.length > 0 && (
            <div className="surface-elevated p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> AI Insights
                </h3>
                <button onClick={() => navigate("/ai-analytics")} className="text-[10px] text-primary hover:underline">Ver todos →</button>
              </div>
              <div className="space-y-2">
                {aiInsights.slice(0, 3).map((insight: any) => (
                  <div key={insight.id} className={`p-3 rounded-lg border text-sm ${
                    insight.severity === "success" ? "border-green-500/30 bg-green-500/5" :
                    insight.severity === "warning" ? "border-yellow-500/30 bg-yellow-500/5" :
                    "border-primary/30 bg-primary/5"
                  }`}>
                    <div className="flex items-center gap-2">
                      {insight.severity === "success" ? <TrendingUp className="w-3 h-3 text-green-500" /> :
                       insight.severity === "warning" ? <AlertTriangle className="w-3 h-3 text-yellow-500" /> :
                       <Lightbulb className="w-3 h-3 text-primary" />}
                      <p className="font-medium text-foreground text-xs">{insight.title}</p>
                    </div>
                    <p className="text-muted-foreground text-xs mt-0.5">{insight.description?.substring(0, 120)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick AI Actions */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => navigate("/ai-analytics")} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/20 bg-primary/5 text-sm text-primary hover:bg-primary/10 transition-colors">
          <Brain className="w-4 h-4" /> Insights IA
        </button>
        <button onClick={() => navigate("/realtime")} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/30 bg-muted/10 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Zap className="w-4 h-4" /> Tempo Real
        </button>
      </div>

      {/* Charts */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList className="bg-card/60 backdrop-blur-sm border border-border/30 p-1">
          <TabsTrigger value="revenue" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none transition-all duration-200">Receita</TabsTrigger>
          <TabsTrigger value="attribution" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none transition-all duration-200">Atribuição</TabsTrigger>
          <TabsTrigger value="gateways" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none transition-all duration-200">Gateways</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 surface-elevated p-5">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70 mb-4 uppercase tracking-widest">Receita por Dia</h3>
              {orderStats?.revenueByDay?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={orderStats.revenueByDay}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 10%, 12%)" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(218, 12%, 30%)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(218, 12%, 30%)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(199, 89%, 48%)" fill="url(#colorRevenue)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "hsl(199, 89%, 48%)", stroke: "hsl(225, 14%, 8%)", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground/60 text-sm">Nenhum dado de receita ainda.</div>
              )}
            </div>

            <div className="surface-elevated p-5">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70 mb-4 uppercase tracking-widest">Método de Pagamento</h3>
              {orderStats?.byMethod?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={orderStats.byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={55} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10} strokeWidth={0}>
                      {orderStats.byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground/60 text-sm">Sem dados.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="attribution" className="animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="surface-elevated p-5">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70 mb-4 uppercase tracking-widest">Receita por UTM Source</h3>
              {orderStats?.bySource?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={orderStats.bySource} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 10%, 12%)" horizontal={false} />
                    <XAxis type="number" stroke="hsl(218, 12%, 30%)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" stroke="hsl(218, 12%, 30%)" fontSize={10} width={80} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="revenue" fill="hsl(199, 89%, 48%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground/60 text-sm">Envie eventos com UTM source.</div>
              )}
            </div>
            <div className="surface-elevated p-5">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70 mb-4 uppercase tracking-widest">Receita por Campanha</h3>
              {orderStats?.byCampaign?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={orderStats.byCampaign} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 10%, 12%)" horizontal={false} />
                    <XAxis type="number" stroke="hsl(218, 12%, 30%)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" stroke="hsl(218, 12%, 30%)" fontSize={10} width={100} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="revenue" fill="hsl(152, 69%, 46%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground/60 text-sm">Envie eventos com UTM campaign.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gateways" className="animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="surface-elevated p-5">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70 mb-4 uppercase tracking-widest">Receita por Gateway</h3>
              {orderStats?.byGateway?.length ? (
                <div className="space-y-3">
                  {orderStats.byGateway.map((g, i) => (
                    <div key={g.name} className="flex items-center justify-between group p-2 rounded-lg hover:bg-primary/3 transition-colors duration-200">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-sm text-foreground font-medium capitalize">{g.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(g.value)}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">({g.count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground/60 text-sm">Sem dados.</div>
              )}
            </div>
            <div className="surface-elevated p-5">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70 mb-4 uppercase tracking-widest">Status dos Pedidos</h3>
              <div className="space-y-4">
                {[
                  { label: "Pagos", value: orderStats?.paidCount || 0, color: "text-success" },
                  { label: "Pendentes", value: orderStats?.pendingCount || 0, color: "text-warning" },
                  { label: "Reembolsos", value: orderStats?.refundCount || 0, color: "text-destructive" },
                  { label: "Total", value: orderStats?.totalOrders || 0, color: "text-foreground" },
                ].map(s => (
                  <div key={s.label} className="flex justify-between items-center p-2 rounded-lg hover:bg-primary/3 transition-colors duration-200">
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                    <span className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Recent Events */}
      <div className="surface-elevated p-5">
        <h3 className="text-[11px] font-semibold text-muted-foreground/70 mb-4 uppercase tracking-widest">Eventos Recentes</h3>
        {eventsLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 rounded-lg animate-shimmer" />)}</div>
        ) : recentEvents?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground/60 border-b border-border/30">
                  <th className="text-left py-2.5 font-medium text-[10px] uppercase tracking-widest">Evento</th>
                  <th className="text-left py-2.5 font-medium text-[10px] uppercase tracking-widest hidden sm:table-cell">Source</th>
                  <th className="text-left py-2.5 font-medium text-[10px] uppercase tracking-widest hidden md:table-cell">Valor</th>
                  <th className="text-left py-2.5 font-medium text-[10px] uppercase tracking-widest">Tempo</th>
                  <th className="text-left py-2.5 font-medium text-[10px] uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((e, i) => {
                  const customData = e.custom_data_json as Record<string, unknown> | null;
                  const value = customData?.value;
                  const currency = customData?.currency || "BRL";
                  return (
                    <tr key={i} className="border-b border-border/20 table-row-hover transition-all duration-200">
                      <td className="py-3 font-medium text-foreground">{e.event_name}</td>
                      <td className="py-3 text-muted-foreground hidden sm:table-cell">{e.source || "—"}</td>
                      <td className="py-3 text-foreground tabular-nums hidden md:table-cell">
                        {typeof value === "number" ? `${currency} ${value.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-3 text-muted-foreground text-xs tabular-nums">{timeAgo(e.created_at)}</td>
                      <td className="py-3">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium border ${
                          e.processing_status === "delivered" ? "bg-success/8 text-success border-success/20" :
                          e.processing_status === "pending" ? "bg-warning/8 text-warning border-warning/20" :
                          "bg-muted/20 text-muted-foreground border-border/30"
                        }`}>
                          {e.processing_status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto mb-3">
              <Target className="w-5 h-5 text-primary/40" />
            </div>
            <p className="text-muted-foreground text-sm">Nenhum evento registrado ainda.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Instale o SDK e comece a rastrear.</p>
          </div>
        )}
      </div>
    </div>
  );
}
