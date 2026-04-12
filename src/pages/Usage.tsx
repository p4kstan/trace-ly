import { useWorkspace } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Zap, Shield, TrendingUp } from "lucide-react";

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

  const isLoading = wsLoading || usageLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  const eventCount = Number(usage?.event_count || 0);
  const maxEvents = Number(planLimit?.max_events_per_month || 10000);
  const usagePercent = Math.min((eventCount / maxEvents) * 100, 100);
  const plan = workspace?.plan || "free";

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Uso & Limites</h1>
        <p className="text-muted-foreground text-sm mt-1">Consumo do workspace no mês atual</p>
      </div>

      {/* Current Plan */}
      <div className="surface-elevated p-6 space-y-4">
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
          <Badge variant={plan === "free" ? "secondary" : "default"} className="capitalize">
            {plan}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Eventos este mês</span>
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {formatNumber(eventCount)} / {formatNumber(maxEvents)}
            </span>
          </div>
          <Progress
            value={usagePercent}
            className="h-3"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{usagePercent.toFixed(1)}% utilizado</span>
            <span>{formatNumber(maxEvents - eventCount)} restantes</span>
          </div>
        </div>

        {usagePercent >= 80 && (
          <div className={`p-3 rounded-lg border text-sm ${usagePercent >= 100 ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-warning/10 border-warning/30 text-warning"}`}>
            {usagePercent >= 100
              ? "⚠️ Limite de eventos atingido! Novos eventos serão rejeitados. Faça upgrade para continuar."
              : "⚡ Você está próximo do limite. Considere fazer upgrade."}
          </div>
        )}
      </div>

      {/* Plan Limits */}
      <div className="surface-elevated p-6 space-y-4">
        <h3 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Limites do Plano</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Eventos/mês", value: formatNumber(maxEvents), icon: BarChart3 },
            { label: "Pixels", value: String(planLimit?.max_pixels || 1), icon: Shield },
            { label: "API Keys", value: String(planLimit?.max_api_keys || 2), icon: Zap },
            { label: "Destinos", value: String(planLimit?.max_destinations || 1), icon: TrendingUp },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-1">
              <item.icon className="w-4 h-4 text-primary/60" />
              <p className="text-lg font-bold text-foreground tabular-nums">{item.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Usage History */}
      {usageHistory && usageHistory.length > 0 && (
        <div className="surface-elevated p-6 space-y-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Histórico de Uso</h3>
          <div className="space-y-2">
            {usageHistory.map(h => {
              const pct = Math.min((Number(h.event_count) / maxEvents) * 100, 100);
              return (
                <div key={h.month} className="flex items-center gap-4">
                  <span className="text-sm font-mono text-muted-foreground w-20">{h.month}</span>
                  <div className="flex-1">
                    <Progress value={pct} className="h-2" />
                  </div>
                  <span className="text-sm font-mono text-foreground tabular-nums w-16 text-right">
                    {formatNumber(Number(h.event_count))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
