import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { TrackingHubGuide } from "@/components/TrackingHubGuide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  meta: { label: "Meta CAPI", color: "hsl(214 89% 52%)" },
  ga4: { label: "GA4", color: "hsl(36 100% 50%)" },
  google_ads: { label: "Google Ads", color: "hsl(142 71% 45%)" },
  tiktok: { label: "TikTok", color: "hsl(340 82% 52%)" },
  stripe: { label: "Stripe", color: "hsl(250 80% 60%)" },
};

export default function Destinations() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();

  const { data: destinations = [], isLoading } = useQuery({
    queryKey: ["destinations", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_integration_metadata", {
        _workspace_id: workspace!.id,
      });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ["integration-logs-recent", workspace?.id],
    enabled: !!workspace?.id,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_logs")
        .select("provider, status, created_at, latency_ms, event_name")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Stats per provider
  const providerStats = recentLogs.reduce((acc: Record<string, { delivered: number; failed: number; total: number }>, log: any) => {
    if (!acc[log.provider]) acc[log.provider] = { delivered: 0, failed: 0, total: 0 };
    acc[log.provider].total++;
    if (log.status === "delivered") acc[log.provider].delivered++;
    else acc[log.provider].failed++;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <TrackingHubGuide variant="compact" />

      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">Destinations</h1>
        <p className="text-sm text-muted-foreground">
          Destinos de eventos configurados via Integrações. Aqui você monitora o status de entrega.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map(i => <Card key={i} className="glass-card animate-pulse h-48" />)}
        </div>
      ) : destinations.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Send className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum destino ativo</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Configure destinos em Integrações para começar a enviar eventos
            </p>
            <Button variant="outline" onClick={() => window.location.href = "/integrations"}>
              Ir para Integrações
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {destinations.map((dest: any) => {
            const meta = PROVIDER_META[dest.provider] || { label: dest.provider, color: "hsl(var(--primary))" };
            const stats = providerStats[dest.provider];

            return (
              <Card key={dest.id} className="glass-card hover:border-primary/30 transition-colors">
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: `${meta.color}20` }}
                    >
                      <Send className="w-5 h-5" style={{ color: meta.color }} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{dest.name || meta.label}</CardTitle>
                      <p className="text-xs text-muted-foreground">{meta.label} • {dest.environment}</p>
                    </div>
                  </div>
                  <Badge variant={dest.status === "active" ? "default" : "secondary"}>
                    {dest.status === "active" ? (
                      <><CheckCircle className="w-3 h-3 mr-1" /> Ativo</>
                    ) : (
                      <><XCircle className="w-3 h-3 mr-1" /> Inativo</>
                    )}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stats ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold tabular-nums">{stats.total}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                      </div>
                      <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-emerald-400 tabular-nums">{stats.delivered}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Entregue</p>
                      </div>
                      <div className="bg-destructive/10 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-destructive tabular-nums">{stats.failed}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Falha</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" /> Aguardando primeiros eventos...
                    </div>
                  )}
                  {dest.last_sync_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Última sync: {new Date(dest.last_sync_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recent Logs */}
      {recentLogs.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Últimos Envios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {recentLogs.map((log: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/20">
                  <div className="flex items-center gap-2">
                    {log.status === "delivered" ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-destructive" />
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {PROVIDER_META[log.provider]?.label || log.provider}
                    </Badge>
                    <span className="text-muted-foreground">{log.event_name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    {log.latency_ms && <span>{log.latency_ms}ms</span>}
                    <span>{new Date(log.created_at).toLocaleTimeString("pt-BR")}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
