import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, Plug, RefreshCw, ShieldCheck, ExternalLink, Plus, Trash2,
  Users, Activity, DollarSign, MousePointerClick, Target,
} from "lucide-react";

type GA4Cred = {
  id: string;
  property_id: string;
  property_name: string | null;
  account_name: string | null;
  measurement_id: string | null;
  status: string;
  last_sync_at: string | null;
};

function fmt(n: number | string | undefined, currency = false) {
  const v = Number(n || 0);
  if (currency) return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return v.toLocaleString("pt-BR");
}

function extractGa4SetupIssue(error: unknown) {
  const fallbackMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const jsonStart = fallbackMessage.indexOf("{");

  let payload: any = null;
  if (jsonStart >= 0) {
    try {
      payload = JSON.parse(fallbackMessage.slice(jsonStart));
    } catch {
      payload = null;
    }
  }

  const details = payload?.details?.error?.details ?? [];
  const errorInfo = details.find((item: any) => item?.["@type"]?.includes("ErrorInfo"));
  const help = details.find((item: any) => item?.["@type"]?.includes("Help"));
  const localized = details.find((item: any) => item?.["@type"]?.includes("LocalizedMessage"));

  const message = payload?.error || localized?.message || fallbackMessage;
  if (!message) return null;

  return {
    message,
    apiName: errorInfo?.metadata?.serviceTitle || null,
    activationUrl: help?.links?.[0]?.url || errorInfo?.metadata?.activationUrl || null,
    isConfigurationIssue:
      errorInfo?.reason === "SERVICE_DISABLED" ||
      errorInfo?.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
      /not been used|disabled|scope/i.test(message),
  };
}

function MetricBox({ icon: Icon, label, value, color }: any) {
  return (
    <Card className="glass-card">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GA4Analytics() {
  const { data: workspace } = useWorkspace();
  const ws = workspace?.id;
  const [dateRange, setDateRange] = useState("last_7_days");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: cred, isLoading: credLoading } = useQuery({
    queryKey: ["ga4-cred", ws],
    enabled: !!ws,
    queryFn: async () => {
      const { data } = await supabase
        .from("ga4_credentials")
        .select("*")
        .eq("workspace_id", ws!)
        .neq("property_id", "pending")
        .order("last_sync_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as GA4Cred | null;
    },
  });

  const isConnected = cred?.status === "connected";

  const { data: report, error: reportError, isLoading: reportLoading, refetch: refetchReport } = useQuery({
    queryKey: ["ga4-report", ws, activeTab, dateRange, cred?.property_id],
    enabled: !!ws && isConnected,
    retry: false,
    queryFn: async () => {
      const cacheParts = [ws, cred?.property_id, activeTab, dateRange];
      const cached = getGa4Cache<unknown>(cacheParts);
      if (cached) return cached;
      const { data, error } = await supabase.functions.invoke("ga4-data-reports", {
        body: { workspace_id: ws, report_type: activeTab, date_range: dateRange },
      });
      if (error) throw error;
      setGa4Cache(cacheParts, data);
      return data;
    },
  });

  const { data: conversionEvents = [], error: conversionEventsError, refetch: refetchConvs } = useQuery({
    queryKey: ["ga4-conv-events", ws, cred?.property_id],
    enabled: !!ws && isConnected,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ga4-admin", {
        body: { workspace_id: ws, action: "list_conversion_events" },
      });
      if (error) throw error;
      return data?.data?.conversionEvents || [];
    },
  });

  const { data: dataStreams = [], error: dataStreamsError } = useQuery({
    queryKey: ["ga4-streams", ws, cred?.property_id],
    enabled: !!ws && isConnected,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ga4-admin", {
        body: { workspace_id: ws, action: "list_data_streams" },
      });
      if (error) throw error;
      return data?.data?.dataStreams || [];
    },
  });

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ga4-oauth-initiate", {
        body: { workspace_id: ws, return_url: "/ga4-analytics" },
      });
      if (error) throw error;
      window.location.href = data.auth_url;
    },
    onError: (e: any) => toast.error(e.message || "Erro ao iniciar conexão com o GA4"),
  });

  const createConv = useMutation({
    mutationFn: async (eventName: string) => {
      const { data, error } = await supabase.functions.invoke("ga4-admin", {
        body: { workspace_id: ws, action: "create_conversion_event", payload: { event_name: eventName } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Evento de conversão criado no GA4!");
      refetchConvs();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar conversão"),
  });

  const deleteConv = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("ga4-admin", {
        body: { workspace_id: ws, action: "delete_conversion_event", payload: { id } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Conversão removida");
      refetchConvs();
    },
  });

  const [newEventName, setNewEventName] = useState("");
  const ga4SetupIssue = extractGa4SetupIssue(reportError || dataStreamsError || conversionEventsError);

  if (credLoading) return <Skeleton className="h-96" />;

  if (!cred || cred.status !== "connected") {
    const needsProperty = cred?.status === "needs_property_selection";
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">GA4 — Relatórios & Admin</h1>
          <p className="text-sm text-muted-foreground">Conecte sua conta Google para ler relatórios e gerenciar a propriedade GA4.</p>
        </div>

        {needsProperty && (
          <Card className="glass-card border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-6 space-y-2">
              <div className="flex items-center gap-2 text-amber-500 font-semibold text-sm">
                <Activity className="w-4 h-4" /> Conexão parcial detectada
              </div>
              <p className="text-sm text-muted-foreground">
                Você autorizou com sucesso, mas o sistema não conseguiu ler suas propriedades GA4 automaticamente.
                Isso normalmente significa que as <strong>APIs do Google Analytics ainda não estão ativadas</strong> no
                seu projeto Google Cloud. Siga os passos abaixo e clique em <strong>"Reconectar"</strong>.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Pré-requisitos */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Pré-requisitos para integrar o GA4
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="font-semibold text-foreground">1. Ative as 2 APIs no Google Cloud</div>
              <p className="text-muted-foreground">
                No <strong>mesmo projeto</strong> onde você criou o OAuth Client (o mesmo do Google Ads), ative:
              </p>
              <ul className="space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <div>
                    <strong>Google Analytics Admin API</strong> — gerencia propriedades, streams e conversões
                    <a
                      href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com"
                      target="_blank" rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-primary hover:underline text-xs"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <div>
                    <strong>Google Analytics Data API</strong> — lê relatórios (sessões, receita, conversões)
                    <a
                      href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
                      target="_blank" rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-primary hover:underline text-xs"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground italic mt-1">
                Em cada link, clique em <strong>ENABLE / ATIVAR</strong> e aguarde ~1 minuto antes de continuar.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="font-semibold text-foreground">2. Tenha uma propriedade GA4 criada</div>
              <p className="text-muted-foreground">
                Em <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">analytics.google.com</a>,
                no menu <strong>Admin → Criar → Propriedade</strong> (escolha tipo <em>GA4</em>, não Universal Analytics).
                Se já tem, basta confirmar que está logado com a conta Google certa.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="font-semibold text-foreground">3. Confira o redirect URI</div>
              <p className="text-muted-foreground">
                No OAuth Client do Google Cloud, em <strong>Authorized redirect URIs</strong>, deve existir:
              </p>
              <code className="block text-xs bg-muted/40 px-2 py-1.5 rounded border border-border/40 break-all">
                https://xpgsipmyrwyjerjvbhmb.supabase.co/functions/v1/ga4-oauth-callback
              </code>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="font-semibold text-foreground">4. Aceite todas as permissões na tela do Google</div>
              <p className="text-muted-foreground">
                Quando o Google pedir consentimento, marque <strong>todas as caixas</strong> (Visualizar e Editar Analytics).
                Sem isso a listagem de propriedades não funciona.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-4 py-12">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">
                {needsProperty ? "Reconectar Google Analytics 4" : "Conectar Google Analytics 4"}
              </h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Após concluir os 4 passos acima, clique abaixo para autorizar o CapiTrack a ler relatórios e
                gerenciar eventos de conversão da sua propriedade GA4.
              </p>
            </div>
            <Button size="lg" onClick={() => connect.mutate()} disabled={connect.isPending}>
              <Plug className="w-4 h-4 mr-2" />
              {connect.isPending ? "Redirecionando..." : needsProperty ? "Reconectar com Google" : "Conectar com Google"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Permissões solicitadas: <code>analytics.readonly</code> + <code>analytics.edit</code>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = report?.data?.rows || [];
  const metricHeaders = report?.data?.metricHeaders || [];
  const dimensionHeaders = report?.data?.dimensionHeaders || [];

  // Overview metrics
  const overview = activeTab === "overview" && rows[0]?.metricValues || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">GA4 — Relatórios & Admin</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Conectado a <strong>{cred.property_name || cred.property_id}</strong>
            {cred.account_name && <span className="text-muted-foreground">• {cred.account_name}</span>}
            <Badge variant="outline">Property {cred.property_id}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
              <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
              <SelectItem value="last_90_days">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetchReport()}>
            <RefreshCw className={`w-4 h-4 ${reportLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

        {ga4SetupIssue?.isConfigurationIssue && (
          <Alert className="border-border bg-muted/30">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Falta ativar a API do Google Analytics</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{ga4SetupIssue.message}</p>
              <p>
                Ative a <strong>{ga4SetupIssue.apiName || "Google Analytics Data API"}</strong> no mesmo projeto Google Cloud do seu OAuth,
                aguarde 1–5 minutos e clique em atualizar.
              </p>
              {ga4SetupIssue.activationUrl && (
                <a
                  href={ga4SetupIssue.activationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Abrir ativação da API <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="by_channel">Canais</TabsTrigger>
          <TabsTrigger value="by_source">Source / Medium</TabsTrigger>
          <TabsTrigger value="by_campaign">Campanhas</TabsTrigger>
          <TabsTrigger value="by_page">Páginas</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {reportLoading ? (
            <div className="grid gap-3 md:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : ga4SetupIssue?.isConfigurationIssue ? (
            <Card className="glass-card">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Os relatórios não podem ser carregados até a API ser ativada no Google Cloud.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <MetricBox icon={Users} label="Sessões" value={fmt(overview[0]?.value)} color="hsl(214 89% 52%)" />
              <MetricBox icon={Activity} label="Usuários ativos" value={fmt(overview[1]?.value)} color="hsl(142 71% 45%)" />
              <MetricBox icon={MousePointerClick} label="Page views" value={fmt(overview[2]?.value)} color="hsl(36 100% 50%)" />
              <MetricBox icon={Target} label="Conversões" value={fmt(overview[3]?.value)} color="hsl(280 70% 55%)" />
              <MetricBox icon={DollarSign} label="Receita" value={fmt(overview[4]?.value, true)} color="hsl(142 71% 45%)" />
              <MetricBox icon={Activity} label="Engajamento" value={`${(Number(overview[5]?.value || 0) * 100).toFixed(1)}%`} color="hsl(340 82% 52%)" />
            </div>
          )}
          {report?.cached && (
            <p className="text-xs text-muted-foreground">⚡ Cache (15min) — clique em refresh para atualizar.</p>
          )}
        </TabsContent>

        {/* TABLES */}
        {["by_channel", "by_source", "by_campaign", "by_page", "events"].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <Card className="glass-card">
              <CardContent className="pt-6">
                {reportLoading ? <Skeleton className="h-64" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {dimensionHeaders.map((h: any) => (
                          <TableHead key={h.name}>{h.name}</TableHead>
                        ))}
                        {metricHeaders.map((h: any) => (
                          <TableHead key={h.name} className="text-right">{h.name}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Nenhum dado neste período.</TableCell></TableRow>
                      ) : rows.map((r: any, i: number) => (
                        <TableRow key={i}>
                          {r.dimensionValues?.map((d: any, j: number) => (
                            <TableCell key={j} className="font-mono text-xs">{d.value || "(not set)"}</TableCell>
                          ))}
                          {r.metricValues?.map((m: any, j: number) => {
                            const isCurrency = metricHeaders[j]?.name?.toLowerCase().includes("revenue");
                            return (
                              <TableCell key={j} className="text-right">
                                {isCurrency ? fmt(m.value, true) : fmt(m.value)}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        {/* ADMIN */}
        <TabsContent value="admin" className="space-y-4 mt-4">
          {/* Data Streams */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Data Streams</CardTitle>
            </CardHeader>
            <CardContent>
                {dataStreamsError ? <p className="text-sm text-muted-foreground">Os streams ficarão disponíveis após ativar a API.</p> : !dataStreams ? <Skeleton className="h-24" /> : dataStreams.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum stream encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {dataStreams.map((s: any) => (
                    <div key={s.name} className="flex items-center justify-between p-3 rounded-md bg-muted/20">
                      <div>
                        <div className="font-medium text-sm">{s.displayName}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {s.webStreamData?.measurementId} • {s.webStreamData?.defaultUri}
                        </div>
                      </div>
                      <Badge variant="outline">{s.type?.replace("_DATA_STREAM", "")}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conversion Events */}
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Eventos de Conversão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Nome do evento (ex: purchase, generate_lead, sign_up)</Label>
                  <Input
                    value={newEventName}
                    onChange={e => setNewEventName(e.target.value)}
                    placeholder="purchase"
                  />
                </div>
                <Button
                  onClick={() => { if (newEventName) { createConv.mutate(newEventName); setNewEventName(""); } }}
                  disabled={!newEventName || createConv.isPending}
                >
                  <Plus className="w-4 h-4 mr-2" />Adicionar
                </Button>
              </div>

              {conversionEventsError ? <p className="text-sm text-muted-foreground">Os eventos de conversão aparecerão após ativar a API.</p> : !conversionEvents ? <Skeleton className="h-24" /> : conversionEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento de conversão configurado.</p>
              ) : (
                <div className="space-y-2">
                  {conversionEvents.map((e: any) => (
                    <div key={e.name} className="flex items-center justify-between p-3 rounded-md bg-muted/20">
                      <div>
                        <div className="font-medium text-sm">{e.eventName}</div>
                        <div className="text-xs text-muted-foreground">
                          Criado em {e.createTime ? new Date(e.createTime).toLocaleDateString("pt-BR") : "—"}
                          {e.deletable === false && <Badge variant="secondary" className="ml-2">padrão</Badge>}
                        </div>
                      </div>
                      {e.deletable !== false && (
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => deleteConv.mutate(e.name?.split("/").pop())}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <Button variant="outline" asChild>
                <a href={`https://analytics.google.com/analytics/web/#/p${cred.property_id}/`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir GA4 no Google
                </a>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
