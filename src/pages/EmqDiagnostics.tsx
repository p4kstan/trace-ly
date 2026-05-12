import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Zap, TrendingUp, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { toast } from "sonner";

interface PixelDiagnostic {
  pixel_id: string;
  pixel_name: string;
  sources: string[];
  events_total: number;
  events_delivered: number;
  events_failed: number;
  delivery_rate_pct: number;
  emq_estimate: number;
  emq_grade: string;
  coverage: Record<string, number>;
  checklist: Array<{ param: string; status: "ok" | "warn" | "missing"; pct: number; advice: string }>;
}

const PARAM_LABELS: Record<string, string> = {
  em: "Email (em)",
  ph: "Telefone (ph)",
  external_id: "External ID",
  fbp: "Cookie _fbp",
  fbc: "Cookie _fbc / fbclid",
  fn: "Primeiro nome (fn)",
  ln: "Sobrenome (ln)",
  ct: "Cidade (ct)",
  st: "Estado (st)",
  zp: "CEP (zp)",
  country: "País (country)",
  client_ip_address: "IP do cliente",
  client_user_agent: "User Agent",
};

export default function EmqDiagnostics() {
  const { data: workspace } = useWorkspace();
  const [data, setData] = useState<PixelDiagnostic[]>([]);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState(168);

  async function load() {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("meta-emq-diagnostics", {
        body: { workspace_id: workspace.id, hours },
      });
      if (error) throw error;
      setData(res.pixels || []);
    } catch (e: any) {
      toast.error("Erro ao carregar diagnóstico", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [workspace?.id, hours]);

  function emqColor(score: number) {
    if (score >= 8) return "text-emerald-400";
    if (score >= 6) return "text-cyan-400";
    if (score >= 4) return "text-amber-400";
    return "text-rose-400";
  }

  function statusIcon(status: string) {
    if (status === "ok") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "warn") return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Diagnóstico EMQ — Meta CAPI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Event Match Quality estimado por Pixel + checklist do que falta para nota 10.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-card border border-border/50 rounded-md px-3 py-1.5 text-sm"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={24}>Últimas 24h</option>
            <option value={72}>Últimos 3 dias</option>
            <option value={168}>Últimos 7 dias</option>
            <option value={720}>Últimos 30 dias</option>
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <Card className="surface-elevated border-primary/20">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Como funciona o EMQ:</strong> a Meta dá uma nota de 0 a 10 baseada em quantos parâmetros de identificação chegam corretamente em cada evento (email, telefone, IP, _fbp, _fbc, etc).</p>
            <p>Quanto mais parâmetros + maior cobertura, melhor o match com usuários do Facebook → mais conversões atribuídas e ROAS otimizado. <strong className="text-primary">Meta nota ≥ 8.0</strong>.</p>
          </div>
        </CardContent>
      </Card>

      {loading && data.length === 0 && (
        <Card className="surface-elevated"><CardContent className="p-8 text-center text-sm text-muted-foreground">Carregando diagnóstico…</CardContent></Card>
      )}

      {!loading && data.length === 0 && (
        <Card className="surface-elevated">
          <CardContent className="p-8 text-center space-y-2">
            <Activity className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nenhum evento Meta entregue no período. Conecte um Pixel em <strong className="text-primary">Contas Conectadas</strong> e gere tráfego.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {data.map((p) => (
          <Card key={p.pixel_id} className="surface-elevated hover-lift">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" /> {p.pixel_name}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                    Pixel {p.pixel_id} · {p.events_total} eventos · {p.delivery_rate_pct}% entregues
                    {p.sources.map((s) => (
                      <Badge key={s} variant="outline" className="ml-2 text-[10px] uppercase">{s}</Badge>
                    ))}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-bold tabular-nums ${emqColor(p.emq_estimate)}`}>{p.emq_estimate.toFixed(1)}</div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">EMQ {p.emq_grade}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cobertura por parâmetro */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Cobertura por parâmetro
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {p.checklist.map((item) => (
                    <div key={item.param} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          {statusIcon(item.status)}
                          {PARAM_LABELS[item.param] || item.param}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{item.pct}%</span>
                      </div>
                      <Progress value={item.pct} className="h-1" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Checklist do que falta */}
              {p.checklist.filter((c) => c.status !== "ok").length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                    Para subir o EMQ, foque nestes parâmetros:
                  </p>
                  <ul className="space-y-1.5 text-xs">
                    {p.checklist.filter((c) => c.status !== "ok").slice(0, 5).map((c) => (
                      <li key={c.param} className="flex items-start gap-2 p-2 rounded-md bg-muted/20 border border-border/30">
                        {statusIcon(c.status)}
                        <div className="flex-1">
                          <strong className="text-foreground">{PARAM_LABELS[c.param] || c.param}</strong>
                          <span className="text-muted-foreground"> — {c.pct}% de cobertura. {c.advice}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
