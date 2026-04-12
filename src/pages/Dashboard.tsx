import { DollarSign, Target, TrendingUp, Users, Inbox } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { useWorkspace, useEventStats, useRecentEvents } from "@/hooks/use-tracking-data";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function Dashboard() {
  const { data: workspace, isLoading: wsLoading } = useWorkspace();
  const { data: stats, isLoading: statsLoading } = useEventStats(workspace?.id);
  const { data: recentEvents, isLoading: eventsLoading } = useRecentEvents(workspace?.id);

  const isLoading = wsLoading || statsLoading;

  if (!wsLoading && !workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
        <Inbox className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Nenhum workspace encontrado</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md">
          Faça login e crie um workspace para começar a rastrear eventos. Os dados aparecerão aqui automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {workspace ? `Workspace: ${workspace.name}` : "Overview of your tracking performance"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </>
        ) : (
          <>
            <MetricCard title="Revenue" value={formatCurrency(stats?.totalRevenue || 0)} change={0} icon={DollarSign} />
            <MetricCard title="ROAS" value={stats?.roas || "0x"} change={0} icon={TrendingUp} />
            <MetricCard title="CPA" value={formatCurrency(stats?.cpa || 0)} change={0} icon={Target} />
            <MetricCard title="Conversions" value={String(stats?.totalConversions || 0)} change={0} icon={Users} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-card p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Revenue & Conversions</h3>
          {isLoading ? (
            <Skeleton className="h-[280px] rounded-lg" />
          ) : stats?.revenueData?.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={stats.revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="date" stroke="hsl(215, 15%, 55%)" fontSize={12} />
                <YAxis stroke="hsl(215, 15%, 55%)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(220, 18%, 10%)",
                    border: "1px solid hsl(220, 14%, 18%)",
                    borderRadius: "8px",
                    color: "hsl(210, 20%, 95%)",
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(199, 89%, 48%)" fill="url(#colorRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
              Nenhum dado de receita ainda. Envie eventos com valor para ver o gráfico.
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">By Channel</h3>
          {isLoading ? (
            <Skeleton className="h-[280px] rounded-lg" />
          ) : stats?.channelData?.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.channelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis type="number" stroke="hsl(215, 15%, 55%)" fontSize={12} />
                <YAxis type="category" dataKey="channel" stroke="hsl(215, 15%, 55%)" fontSize={11} width={80} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(220, 18%, 10%)",
                    border: "1px solid hsl(220, 14%, 18%)",
                    borderRadius: "8px",
                    color: "hsl(210, 20%, 95%)",
                  }}
                />
                <Bar dataKey="conversions" fill="hsl(199, 89%, 48%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
              Nenhum canal detectado. Envie eventos com utm_source para ver canais.
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-medium text-foreground mb-4">Recent Events</h3>
        {eventsLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded" />)}
          </div>
        ) : recentEvents?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-2 font-medium">Event</th>
                  <th className="text-left py-2 font-medium">Source</th>
                  <th className="text-left py-2 font-medium">Value</th>
                  <th className="text-left py-2 font-medium">Time</th>
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
                          e.processing_status === "delivered" ? "bg-success/10 text-success" :
                          e.processing_status === "pending" ? "bg-warning/10 text-warning" :
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
