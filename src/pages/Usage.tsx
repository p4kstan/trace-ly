import { useWorkspace } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Zap, Shield, TrendingUp, Activity, Send, AlertTriangle, Key } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function Usage() {
  const { data: workspace, isLoading: wsLoading } = useWorkspace();

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["workspace-usage", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const currentMonth = new Date().toISOString().substring(0, 7);
      const { data } = await supabase
        .from("workspace_usage")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .eq("month", currentMonth)
        .maybeSingle();
      return data;
    },
  });

  const { data: planLimit } = useQuery({
    queryKey: ["plan-limits", workspace?.plan],
    enabled: !!workspace?.plan,
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_limits")
        .select("*")
        .eq("plan_name", workspace!.plan || "free")
        .maybeSingle();
      return data;
    },
  });

  const { data: usageHistory } = useQuery({
    queryKey: ["usage-history", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_usage")
        .select("month, event_count")
        .eq("workspace_id", workspace!.id)
        .order("month", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  // Resource counts for the tenant
  const { data: resourceCounts } = useQuery({
    queryKey: ["tenant-resources", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const [keysRes, pixelsRes, destsRes, deliveriesRes] = await Promise.all([
        supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("workspace_id", workspace!.id).eq("status", "active"),
        supabase.from("meta_pixels").select("id", { count: "exact", head: true }).eq("workspace_id", workspace!.id).eq("is_active", true),
        supabase.from("integration_destinations").select("id", { count: "exact", head: true }).eq("workspace_id", workspace!.id).eq("is_active", true),
        supabase.from("event_deliveries").select("status", { count: "exact" }).eq("workspace_id", workspace!.id).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);
      return {
        activeKeys: keysRes.count || 0,
        activePixels: pixelsRes.count || 0,
        activeDestinations: destsRes.count || 0,
        deliveries24h: deliveriesRes.count || 0,
      };
    },
  });

  // Daily event breakdown (last 7 days)
  const { data: dailyBreakdown } = useQuery({
    queryKey: ["daily-events", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("events")
        .select("event_time")
        .eq("workspace_id", workspace!.id)
        .gte("event_time", sevenDaysAgo)
        .order("event_time", { ascending: true })
        .limit(1000);

      // Group by day
      const days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        days[d.toISOString().substring(0, 10)] = 0;
      }
      (data || []).forEach((e: any) => {
        const day = e.event_time?.substring(0, 10);
        if (day && days[day] !== undefined) days[day]++;
      });
      return Object.entries(days).map(([date, count]) => ({
        date: date.substring(5), // MM-DD
        events: count,
      }));
    },
  });

  const isLoading = wsLoading || usageLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const eventCount = Number(usage?.event_count || 0);
  const maxEvents = Number(planLimit?.max_events_per_month || 10000);
  const usagePercent = Math.min((eventCount / maxEvents) * 100, 100);
  const plan = workspace?.plan || "free";

  const statCards = [
    { label: "Eventos/mês", value: formatNumber(maxEvents), icon: BarChart3, color: "text-primary" },
    { label: "Pixels Ativos", value: String(resourceCounts?.activePixels ?? "—"), icon: Shield, color: "text-emerald-400" },
    { label: "API Keys", value: String(resourceCounts?.activeKeys ?? "—"), icon: Key, color: "text-amber-400" },
    { label: "Destinos", value: String(resourceCounts?.activeDestinations ?? "—"), icon: Send, color: "text-sky-400" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Uso & Limites</h1>
        <p className="text-muted-foreground text-sm mt-1">Consumo e recursos do workspace no mês atual</p>
      </div>

      {/* Top: Plan + Usage gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Main usage card */}
        <div className="lg:col-span-3 surface-elevated p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground capitalize">Plano {plan}</h3>
                <p className="text-xs text-muted-foreground">{formatNumber(maxEvents)} eventos/mês</p>
              </div>
            </div>
            <Badge variant={plan === "free" ? "secondary" : "default"} className="capitalize">{plan}</Badge>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Eventos este mês</span>
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {formatNumber(eventCount)} / {formatNumber(maxEvents)}
              </span>
            </div>
            <Progress value={usagePercent} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{usagePercent.toFixed(1)}% utilizado</span>
              <span>{formatNumber(Math.max(maxEvents - eventCount, 0))} restantes</span>
            </div>
          </div>

          {usagePercent >= 80 && (
            <div className={`p-3 rounded-lg border text-sm flex items-center gap-2 ${usagePercent >= 100 ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-warning/10 border-warning/30 text-warning"}`}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {usagePercent >= 100
                ? "Limite atingido! Novos eventos serão rejeitados."
                : "Próximo do limite. Considere fazer upgrade."}
            </div>
          )}
        </div>

        {/* Resource stats */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          {statCards.map(item => (
            <div key={item.label} className="surface-elevated p-4 flex flex-col justify-between">
              <item.icon className={`w-4 h-4 ${item.color} opacity-70`} />
              <div className="mt-3">
                <p className="text-2xl font-bold text-foreground tabular-nums">{item.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily chart */}
      {dailyBreakdown && dailyBreakdown.length > 0 && (
        <div className="surface-elevated p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary/60" />
            <h3 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Eventos — Últimos 7 dias</h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyBreakdown}>
                <defs>
                  <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area type="monotone" dataKey="events" stroke="hsl(var(--primary))" fill="url(#usageGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Usage History */}
      {usageHistory && usageHistory.length > 0 && (
        <div className="surface-elevated p-6 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary/60" />
            <h3 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Histórico Mensal</h3>
          </div>
          <div className="space-y-2">
            {usageHistory.map(h => {
              const pct = Math.min((Number(h.event_count) / maxEvents) * 100, 100);
              return (
                <div key={h.month} className="flex items-center gap-4">
                  <span className="text-sm font-mono text-muted-foreground w-20">{h.month}</span>
                  <div className="flex-1"><Progress value={pct} className="h-2" /></div>
                  <span className="text-sm font-mono text-foreground tabular-nums w-16 text-right">{formatNumber(Number(h.event_count))}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan Limits detail */}
      <div className="surface-elevated p-6 space-y-4">
        <h3 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Limites do Plano</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Eventos/mês", current: eventCount, max: maxEvents },
            { label: "Pixels", current: resourceCounts?.activePixels ?? 0, max: planLimit?.max_pixels ?? 1 },
            { label: "API Keys", current: resourceCounts?.activeKeys ?? 0, max: planLimit?.max_api_keys ?? 2 },
            { label: "Destinos", current: resourceCounts?.activeDestinations ?? 0, max: planLimit?.max_destinations ?? 1 },
          ].map(item => {
            const pct = Math.min((Number(item.current) / Number(item.max)) * 100, 100);
            return (
              <div key={item.label} className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                <p className="text-sm font-bold text-foreground tabular-nums">{formatNumber(Number(item.current))} / {formatNumber(Number(item.max))}</p>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
