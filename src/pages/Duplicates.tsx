import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, AlertTriangle, ShieldAlert, RefreshCw, ExternalLink } from "lucide-react";

interface AuditResult {
  window_hours: number;
  total_conversion_events: number;
  total_unique_orders: number;
  matched_pairs: number;
  pixel_only: number;
  capi_only: number;
  missing_order_id: number;
  id_coverage_pct: number;
  pair_coverage_pct: number;
  dedup_health_score: number;
  samples: Array<{ order_id: string; pixel_count: number; capi_count: number; event_name: string }>;
  issues: Array<{ type: string; order_id: string; event_name: string; recommendation: string }>;
  recent_detections: Array<any>;
}

const CHECKLIST = [
  {
    title: "1. Use o ID NUMÉRICO da Conversion Action no destino",
    body: "No Google Ads vá em Ferramentas → Conversões → clique na sua conversão. A URL contém ctId=XXXXXXXX — esse é o ID numérico que vai no campo 'ID de conversão' do destino. NÃO use o ID do gtag (AW-17xxx) aqui.",
  },
  {
    title: "2. Mantenha o gtag (Pixel) no site com o mesmo Rótulo",
    body: "send_to: 'AW-17862172125/UITqCOjA95wcEN27rMVC' — o ID AW-... é o ID da CONTA, o sufixo é o RÓTULO. Continue usando-os no navegador.",
  },
  {
    title: "3. SEMPRE envie transaction_id no pixel",
    body: "gtag('event','conversion',{ transaction_id: 'PEDIDO-123', value: 97.00, currency: 'BRL', send_to: 'AW-XXX/LABEL' }) — sem isso o Google não consegue deduplicar.",
  },
  {
    title: "4. Garanta que o webhook do gateway envia order_id idêntico",
    body: "O CapiTrack já envia order_id (transaction_id) automaticamente para Google/Meta. Confirme em /webhook-logs que o pedido ID enviado é o MESMO que o pixel usa no checkout.",
  },
  {
    title: "5. Marque o checkbox 'Contar = Uma' (não 'Cada')",
    body: "Na conversão do Google Ads, em Configurações avançadas → 'Contagem', use 'Uma' para Purchase. Isso impede contagem duplicada mesmo se algum evento escapar.",
  },
  {
    title: "6. Defina janela de cliques de 24h (mesmo do CapiTrack)",
    body: "Em Configurações da conversão → 'Janela de conversão por clique', deixe em 24h ou maior. Coincide com a janela de dedup do CapiTrack.",
  },
  {
    title: "7. Aguarde 24-48h e olhe o relatório aqui",
    body: "A aba 'Detecções' mostra ordens com mesmo order_id chegando 2x+. Saúde 90%+ = dedup OK. Abaixo de 70%, abra um issue na lista.",
  },
];

export default function Duplicates() {
  const { data: workspace } = useWorkspace();
  const [auditing, setAuditing] = useState(false);

  const { data: detections = [], refetch: refetchDetections } = useQuery({
    queryKey: ["dup-detections", workspace?.id],
    enabled: !!workspace?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("duplicate_detections")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("last_seen_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["dup-summary", workspace?.id],
    enabled: !!workspace?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from("v_duplicate_summary")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: audit, refetch: refetchAudit } = useQuery<AuditResult | null>({
    queryKey: ["dup-audit", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("audit-pixel-capi", {
        body: { workspace_id: workspace!.id, hours: 24 },
      });
      if (error) throw error;
      return data as AuditResult;
    },
  });

  const runAudit = async () => {
    setAuditing(true);
    try {
      await Promise.all([refetchAudit(), refetchDetections()]);
    } finally {
      setAuditing(false);
    }
  };

  const healthColor =
    !audit ? "text-muted-foreground" :
    audit.dedup_health_score >= 90 ? "text-emerald-400" :
    audit.dedup_health_score >= 70 ? "text-amber-400" : "text-destructive";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">Duplicatas & Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Monitora conversões duplicadas por <code className="text-xs bg-muted/40 px-1 rounded">order_id</code> em janela de 24h e audita Pixel ↔ CAPI.
          </p>
        </div>
        <Button onClick={runAudit} disabled={auditing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${auditing ? "animate-spin" : ""}`} />
          {auditing ? "Auditando..." : "Auditar agora"}
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">Saúde Dedup</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold tabular-nums ${healthColor}`}>
              {audit ? `${audit.dedup_health_score}%` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              cobertura de pares pixel↔CAPI
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">Duplicatas 24h</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-400 tabular-nums">{summary?.dupes_24h ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">pedidos com 2+ envios</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">Pixel sem CAPI</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive tabular-nums">{audit?.pixel_only ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">webhook não chegou</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">CAPI sem Pixel</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-400 tabular-nums">{audit?.capi_only ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">tag não disparou</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="detections" className="w-full">
        <TabsList className="glass-card">
          <TabsTrigger value="detections" className="gap-2"><ShieldAlert className="w-4 h-4" /> Detecções</TabsTrigger>
          <TabsTrigger value="audit" className="gap-2"><AlertTriangle className="w-4 h-4" /> Auditoria Pixel ↔ CAPI</TabsTrigger>
          <TabsTrigger value="checklist" className="gap-2"><CheckCircle2 className="w-4 h-4" /> Checklist Google Ads</TabsTrigger>
        </TabsList>

        {/* DETECTIONS TABLE */}
        <TabsContent value="detections" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Conversões duplicadas detectadas (janela 24h)</CardTitle>
            </CardHeader>
            <CardContent>
              {detections.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400/60" />
                  <p className="text-sm">Nenhuma duplicata detectada — sua dedup está funcionando ✅</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {detections.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-xs bg-muted/40 px-2 py-0.5 rounded text-foreground/90">{d.order_id}</code>
                          <Badge variant="outline" className="text-[10px]">{d.event_name}</Badge>
                          <Badge variant={d.occurrences > 2 ? "destructive" : "secondary"} className="text-[10px]">
                            {d.occurrences}x
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {(d.sources as string[]).map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px] gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground shrink-0 ml-4">
                        <p>Último: {new Date(d.last_seen_at).toLocaleString("pt-BR")}</p>
                        {d.total_value > 0 && (
                          <p className="font-medium text-foreground/80">
                            {Number(d.total_value).toLocaleString("pt-BR", { style: "currency", currency: d.currency || "BRL" })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUDIT */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Comparação Pixel ↔ CAPI (últimas 24h)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!audit ? (
                <p className="text-sm text-muted-foreground">Clique em "Auditar agora" para gerar o diagnóstico.</p>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-xs text-muted-foreground mb-1">Pareados (pixel + CAPI)</p>
                      <p className="text-2xl font-bold text-emerald-400">{audit.matched_pairs}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/20">
                      <p className="text-xs text-muted-foreground mb-1">Total de pedidos únicos</p>
                      <p className="text-2xl font-bold">{audit.total_unique_orders}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-xs text-muted-foreground mb-1">Sem order_id</p>
                      <p className="text-2xl font-bold text-amber-400">{audit.missing_order_id}</p>
                    </div>
                  </div>

                  {audit.issues.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Problemas a investigar</h4>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {audit.issues.map((iss, i) => (
                          <div key={i} className="p-3 rounded border border-border/40 bg-muted/10">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={iss.type === "pixel_only" ? "destructive" : "secondary"} className="text-[10px]">
                                {iss.type === "pixel_only" ? "Sem CAPI" : "Sem Pixel"}
                              </Badge>
                              <code className="text-xs">{iss.order_id}</code>
                              <span className="text-xs text-muted-foreground">({iss.event_name})</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{iss.recommendation}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {audit.samples.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 text-emerald-400">✓ Amostras corretamente pareadas</h4>
                      <div className="space-y-1.5">
                        {audit.samples.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-emerald-500/5">
                            <code>{s.order_id}</code>
                            <Badge variant="outline" className="text-[10px]">{s.event_name}</Badge>
                            <span className="text-muted-foreground ml-auto">
                              pixel: {s.pixel_count} • CAPI: {s.capi_count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CHECKLIST */}
        <TabsContent value="checklist" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Checklist Pixel + CAPI Google Ads</CardTitle>
              <p className="text-xs text-muted-foreground">
                Configure ambos sem duplicar conversões. O CapiTrack envia <code className="bg-muted/40 px-1 rounded">order_id</code> automaticamente — você só precisa garantir que o Pixel também envie o mesmo valor como <code className="bg-muted/40 px-1 rounded">transaction_id</code>.
              </p>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {CHECKLIST.map((item, i) => (
                  <li key={i} className="flex gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold mb-1">{item.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 p-3 rounded-lg border border-primary/30 bg-primary/5 text-xs flex items-start gap-2">
                <ExternalLink className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Resumo:</strong> Pixel usa <code>AW-CONTA/RÓTULO</code> · CapiTrack usa o ID numérico (<code>ctId</code>) ·
                  ambos compartilham o <code>transaction_id</code> · Google deduplica em até 24h. Sem dor de cabeça.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
