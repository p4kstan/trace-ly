import { DollarSign, Target, TrendingUp, Users, Inbox, ShoppingCart, BarChart3 } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { useWorkspace, useEventStats, useRecentEvents } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatCurrency(val: number) {
  return "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const COLORS = ["hsl(199, 89%, 48%)", "hsl(142, 71%, 45%)", "hsl(280, 65%, 60%)", "hsl(38, 92%, 50%)", "hsl(346, 77%, 50%)"];

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

      // By gateway
      const gateways = [...new Set(paid.map(o => o.gateway))];
      const byGateway = gateways.map(g => ({
        name: g,
        value: paid.filter(o => o.gateway === g).reduce((s, o) => s + (Number(o.total_value) || 0), 0),
        count: paid.filter(o => o.gateway === g).length,
      })).sort((a, b) => b.value - a.value);

      // By payment method
      const methods = [...new Set(paid.map(o => o.payment_method).filter(Boolean))];
      const byMethod = methods.map(m => ({
        name: m!,
        value: paid.filter(o => o.payment_method === m).reduce((s, o) => s + (Number(o.total_value) || 0), 0),
        count: paid.filter(o => o.payment_method === m).length,
      })).sort((a, b) => b.value - a.value);

      // By UTM source
      const sources = [...new Set(paid.map(o => o.utm_source).filter(Boolean))];
      const bySource = sources.map(s => ({
        name: s!,
        revenue: paid.filter(o => o.utm_source === s).reduce((s2, o) => s2 + (Number(o.total_value) || 0), 0),
        count: paid.filter(o => o.utm_source === s).length,
      })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

      // By campaign
      const campaigns = [...new Set(paid.map(o => o.utm_campaign).filter(Boolean))];
      const byCampaign = campaigns.map(c => ({
        name: c!,
        revenue: paid.filter(o => o.utm_campaign === c).reduce((s, o) => s + (Number(o.total_value) || 0), 0),
        count: paid.filter(o => o.utm_campaign === c).length,
      })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

      // Revenue by day
      const byDay = new Map<string, { revenue: number; orders: number }>();
      for (const o of paid) {
        const day = (o.paid_at || o.created_at).substring(0, 10);
        const e = byDay.get(day) || { revenue: 0, orders: 0 };
        e.revenue += Number(o.total_value) || 0;
        e.orders += 1;
        byDay.set(day, e);
      }
      const revenueByDay = Array.from(byDay.entries()).map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date));

      // Checkout abandonment estimate
      const checkoutEvents = all.filter(o => o.status === "pending").length;
      const abandonmentRate = all.length > 0 ? Math.round((pendingCount / all.length) * 100) : 0;

      return { totalRevenue, avgTicket, paidCount: paid.length, pendingCount, refundCount, totalOrders: all.length, byGateway, byMethod, bySource, byCampaign, revenueByDay, abandonmentRate };
    },
  });
}

export default function Dashboard() {
  const { data: workspace, isLoading: wsLoading } = useWorkspace();
  const { data: stats, isLoading: statsLoading } = useEventStats(workspace?.id);
  const { data: orderStats, isLoading: orderLoading } = useOrderStats(workspace?.id);
  const { data: recentEvents, isLoading: eventsLoading } = useRecentEvents(workspace?.id);

  const isLoading = wsLoading || statsLoading || orderLoading;

  if (!wsLoading && !workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
        <Inbox className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Nenhum workspace encontrado</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md">
          Faça login e crie um workspace para começar a rastrear eventos.
        </p>
      </div>
    );
  }

  const revenue = orderStats?.totalRevenue || stats?.totalRevenue || 0;
  const conversions = orderStats?.paidCount || stats?.totalConversions || 0;
  const avgTicket = orderStats?.avgTicket || 0;
  const roas = stats?.roas || "0x";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {workspace ? `Workspace: ${workspace.name}` : "Overview of your tracking performance"}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {isLoading ? (
          <>{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</>
        ) : (
          <>
            <MetricCard title="Receita" value={formatCurrency(revenue)} change={0} icon={DollarSign} />
            <MetricCard title="Compras" value={String(conversions)} change={0} icon={ShoppingCart} />
            <MetricCard title="Ticket Médio" value={formatCurrency(avgTicket)} change={0} icon={TrendingUp} />
            <MetricCard title="ROAS" value={roas} change={0} icon={BarChart3} />
            <MetricCard title="Eventos" value={String(stats?.totalEvents || 0)} change={0} icon={Target} />
            <MetricCard title="Abandono" value={`${orderStats?.abandonmentRate || 0}%`} change={0} icon={Users} />
          </>
        )}
      </div>

      {/* Charts */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Receita</TabsTrigger>
          <TabsTrigger value="attribution">Atribuição</TabsTrigger>
          <TabsTrigger value="gateways">Gateways</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Receita por Dia</h3>
              {orderStats?.revenueByDay?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={orderStats.revenueByDay}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                    <XAxis dataKey="date" stroke="hsl(215, 15%, 55%)" fontSize={12} />
                    <YAxis stroke="hsl(215, 15%, 55%)" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 95%)" }} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(199, 89%, 48%)" fill="url(#colorRevenue)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Nenhum dado de receita ainda.</div>
              )}
            </div>

            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Por Método de Pagamento</h3>
              {orderStats?.byMethod?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={orderStats.byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                      {orderStats.byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 95%)" }} formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Sem dados.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="attribution">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Receita por UTM Source</h3>
              {orderStats?.bySource?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={orderStats.bySource} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                    <XAxis type="number" stroke="hsl(215, 15%, 55%)" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="hsl(215, 15%, 55%)" fontSize={11} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 95%)" }} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="revenue" fill="hsl(199, 89%, 48%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Envie eventos com UTM source.</div>
              )}
            </div>
            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Receita por Campanha</h3>
              {orderStats?.byCampaign?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={orderStats.byCampaign} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                    <XAxis type="number" stroke="hsl(215, 15%, 55%)" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="hsl(215, 15%, 55%)" fontSize={11} width={120} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: "8px", color: "hsl(210, 20%, 95%)" }} formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="revenue" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Envie eventos com UTM campaign.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gateways">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Receita por Gateway</h3>
              {orderStats?.byGateway?.length ? (
                <div className="space-y-3">
                  {orderStats.byGateway.map((g, i) => (
                    <div key={g.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-sm text-foreground font-medium capitalize">{g.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-foreground">{formatCurrency(g.value)}</span>
                        <span className="text-xs text-muted-foreground ml-2">({g.count} vendas)</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados.</div>
              )}
            </div>
            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Status dos Pedidos</h3>
              <div className="space-y-3">
                {[
                  { label: "Pagos", value: orderStats?.paidCount || 0, color: "text-emerald-400" },
                  { label: "Pendentes", value: orderStats?.pendingCount || 0, color: "text-amber-400" },
                  { label: "Reembolsos / Chargebacks", value: orderStats?.refundCount || 0, color: "text-red-400" },
                  { label: "Total", value: orderStats?.totalOrders || 0, color: "text-foreground" },
                ].map(s => (
                  <div key={s.label} className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                    <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Recent Events */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-medium text-foreground mb-4">Eventos Recentes</h3>
        {eventsLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded" />)}</div>
        ) : recentEvents?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-2 font-medium">Evento</th>
                  <th className="text-left py-2 font-medium">Source</th>
                  <th className="text-left py-2 font-medium">Valor</th>
                  <th className="text-left py-2 font-medium">Tempo</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((e, i) => {
                  const customData = e.custom_data_json as Record<string, unknown> | null;
                  const value = customData?.value;
                  const currency = customData?.currency || "BRL";
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 font-medium text-foreground">{e.event_name}</td>
                      <td className="py-3 text-muted-foreground">{e.source || "—"}</td>
                      <td className="py-3 text-foreground">
                        {typeof value === "number" ? `${currency} ${value.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-3 text-muted-foreground">{timeAgo(e.created_at)}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          e.processing_status === "delivered" ? "bg-emerald-500/10 text-emerald-400" :
                          e.processing_status === "pending" ? "bg-amber-500/10 text-amber-400" :
                          "bg-muted/10 text-muted-foreground"
                        }`}>
                          {e.processing_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Nenhum evento registrado ainda. Instale o SDK e comece a rastrear.
          </div>
        )}
      </div>
    </div>
  );
}
