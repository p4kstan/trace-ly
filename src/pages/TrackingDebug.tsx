import { useState } from "react";
import { Play, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { supabase } from "@/integrations/supabase/client";

type DebugReport = {
  workspace_id: string;
  generated_at: string;
  sessions: { sample: unknown[]; stats: Record<string, number>; total_sampled: number };
  orders: { sample: unknown[]; stats: Record<string, number>; total_sampled: number };
  capi_fallback_simulation: Record<string, unknown>;
  google_ads_deliveries: { sample: unknown[]; stats: Record<string, number> };
  diagnostics: string[];
};

export default function TrackingDebug() {
  const { data: workspace } = useWorkspace();
  const [sessionId, setSessionId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DebugReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const params = new URLSearchParams({ workspace_id: workspace.id });
      if (sessionId) params.set("session_id", sessionId);
      if (orderId) params.set("order_id", orderId);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tracking-debug?${params}`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "request failed");
      setReport(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Tracking Debug</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Valida em tempo real persistência de gclid/gbraid/wbraid e fallback do Google Ads CAPI.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sid">Session ID (opcional)</Label>
            <Input id="sid" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="uuid de sessions.id" />
          </div>
          <div>
            <Label htmlFor="oid">Order ID (opcional)</Label>
            <Input id="oid" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="uuid de orders.id" />
          </div>
        </div>
        <Button onClick={run} disabled={loading || !workspace?.id}>
          <Play className="w-4 h-4 mr-2" />
          {loading ? "Executando…" : "Rodar diagnóstico"}
        </Button>
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
      </Card>

      {report && (
        <>
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Diagnóstico</h2>
            <div className="space-y-2">
              {report.diagnostics.map((d, i) => (
                <div key={i} className="text-sm">{d}</div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatsCard title="Sessions (últimas 10)" stats={report.sessions.stats} total={report.sessions.total_sampled} />
            <StatsCard title="Orders (últimas 10)" stats={report.orders.stats} total={report.orders.total_sampled} />
            <StatsCard title="Google Ads Deliveries" stats={report.google_ads_deliveries.stats} total={report.google_ads_deliveries.stats.total} />
          </div>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">Simulação de fallback CAPI por session_id</h2>
            <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-auto max-h-72">
              {JSON.stringify(report.capi_fallback_simulation, null, 2)}
            </pre>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">Payload completo</h2>
            <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-auto max-h-96">
              {JSON.stringify(report, null, 2)}
            </pre>
          </Card>
        </>
      )}
    </div>
  );
}

function StatsCard({ title, stats, total }: { title: string; stats: Record<string, number>; total: number }) {
  const entries = Object.entries(stats).filter(([k]) => k.endsWith("_pct"));
  return (
    <Card className="p-4">
      <h3 className="font-medium text-sm mb-3">{title} <span className="text-muted-foreground">({total})</span></h3>
      <div className="space-y-2">
        {entries.map(([k, v]) => {
          const label = k.replace("_pct", "");
          const Icon = v >= 50 ? CheckCircle2 : v > 0 ? AlertCircle : XCircle;
          const color = v >= 50 ? "text-success" : v > 0 ? "text-yellow-500" : "text-destructive";
          return (
            <div key={k} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Icon className={`w-3 h-3 ${color}`} />
                <span>{label}</span>
              </div>
              <Badge variant="outline">{v}%</Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
