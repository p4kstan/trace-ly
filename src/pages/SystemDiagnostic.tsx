import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity, Database, Globe, Shield, Server, Code, Zap, ChevronDown, ChevronRight,
  Copy, Download, Play, CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, RefreshCw,
  Webhook, ShoppingCart, GitBranch,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { toast } from "@/hooks/use-toast";

type DiagnosticStatus = "healthy" | "degraded" | "offline" | "warnings" | "configured" | "not_configured" | "error" | "info" | "online" | "unknown";

interface DiagnosticResult {
  status: string;
  total_time_ms: number;
  checked_at: string;
  services: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  environment: Record<string, string>;
}

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  healthy: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, label: "Healthy" },
  online: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, label: "Online" },
  configured: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, label: "Configured" },
  degraded: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: AlertTriangle, label: "Degraded" },
  warnings: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: AlertTriangle, label: "Warnings" },
  not_configured: { color: "bg-muted text-muted-foreground border-border", icon: Clock, label: "Not Configured" },
  offline: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle, label: "Offline" },
  error: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle, label: "Error" },
  info: { color: "bg-sky-500/20 text-sky-400 border-sky-500/30", icon: Activity, label: "Info" },
  unknown: { color: "bg-muted text-muted-foreground border-border", icon: Clock, label: "Unknown" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.unknown;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} gap-1 text-xs`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function ServiceSection({ title, icon: Icon, status, details, checkedAt, responseTime }: {
  title: string; icon: typeof Activity; status: string; details: Record<string, unknown>; checkedAt?: string; responseTime?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="w-4 h-4 text-primary" /></div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                {checkedAt && <p className="text-xs text-muted-foreground">{new Date(checkedAt).toLocaleString()}{responseTime != null && ` · ${responseTime}ms`}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={status} />
              {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mx-4 mb-4 p-4 bg-muted/30 rounded-b-lg border border-t-0 border-border/50">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-auto max-h-64">{JSON.stringify(details, null, 2)}</pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function SystemDiagnostic() {
  const { data: workspace } = useWorkspace();
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Local diagnostics from DB
  const { data: localDiag } = useQuery({
    queryKey: ["local-diagnostic", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const wid = workspace!.id;

      const [gatewaysRes, ordersRes, eventsRes, webhooksRes, deliveriesRes, reconRes, pixelsRes] = await Promise.all([
        supabase.from("gateway_integrations").select("id, provider, status, last_sync_at").eq("workspace_id", wid),
        supabase.from("orders").select("id, status, paid_at").eq("workspace_id", wid).order("created_at", { ascending: false }).limit(500),
        supabase.from("events").select("id, processing_status").eq("workspace_id", wid).order("created_at", { ascending: false }).limit(500),
        supabase.from("gateway_webhook_logs").select("id, processing_status, provider").eq("workspace_id", wid).order("received_at", { ascending: false }).limit(200),
        supabase.from("event_deliveries").select("id, status, provider").eq("workspace_id", wid).order("created_at", { ascending: false }).limit(200),
        supabase.from("reconciliation_logs").select("id, status, reconciliation_type").eq("workspace_id", wid).order("created_at", { ascending: false }).limit(200),
        supabase.from("meta_pixels").select("id, pixel_id, is_active").eq("workspace_id", wid),
      ]);

      const gateways = gatewaysRes.data || [];
      const orders = ordersRes.data || [];
      const events = eventsRes.data || [];
      const webhooks = webhooksRes.data || [];
      const deliveries = deliveriesRes.data || [];
      const recon = reconRes.data || [];
      const pixels = pixelsRes.data || [];

      const paidOrders = orders.filter(o => o.status === "paid").length;
      const totalOrders = orders.length;
      const reconSuccess = recon.filter(r => r.status === "success").length;
      const reconTotal = recon.length;
      const reconRate = reconTotal > 0 ? Math.round((reconSuccess / reconTotal) * 100) : 0;
      const deliveredEvents = deliveries.filter(d => d.status === "delivered").length;
      const failedDeliveries = deliveries.filter(d => d.status === "failed").length;
      const processedWebhooks = webhooks.filter(w => w.processing_status === "processed").length;

      return {
        gateways: { count: gateways.length, active: gateways.filter(g => g.status === "active").length, providers: gateways.map(g => g.provider) },
        orders: { total: totalOrders, paid: paidOrders, pending: orders.filter(o => o.status === "pending").length, refunded: orders.filter(o => o.status === "refunded").length },
        events: { total: events.length, delivered: events.filter(e => e.processing_status === "delivered").length, pending: events.filter(e => e.processing_status === "pending").length },
        webhooks: { total: webhooks.length, processed: processedWebhooks, failed: webhooks.filter(w => w.processing_status === "failed").length },
        metaDelivery: { total: deliveries.length, delivered: deliveredEvents, failed: failedDeliveries, successRate: deliveries.length > 0 ? Math.round((deliveredEvents / deliveries.length) * 100) : 0 },
        reconciliation: { total: reconTotal, matched: reconSuccess, partial: recon.filter(r => r.status === "partial").length, failed: recon.filter(r => r.status === "failed").length, matchRate: reconRate },
        pixels: { total: pixels.length, active: pixels.filter(p => p.is_active).length },
      };
    },
  });

  const runDiagnostic = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("system-diagnostic");
      if (error) throw error;
      setResult(data as DiagnosticResult);
      toast({ title: "Diagnostic complete", description: `Status: ${(data as DiagnosticResult).status}` });
    } catch (e: unknown) {
      toast({ title: "Diagnostic failed", description: String(e), variant: "destructive" });
    } finally { setLoading(false); }
  }, []);

  const copyDiagnostic = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify({ ...result, local: localDiag }, null, 2));
    toast({ title: "Copied to clipboard" });
  }, [result, localDiag]);

  const exportDiagnostic = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ ...result, local: localDiag }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `capitrack-diagnostic-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }, [result, localDiag]);

  const svc = result?.services ?? {};
  const sections = [
    { key: "database", title: "Database Status", icon: Database },
    { key: "tracking", title: "Tracking Endpoint", icon: Globe },
    { key: "event_processing", title: "Event Processing", icon: Activity },
    { key: "meta_api", title: "Meta API / Pixels", icon: Zap },
    { key: "api_keys", title: "API Keys", icon: Shield },
    { key: "workspaces", title: "Workspaces", icon: Server },
    { key: "sdk", title: "SDK Status", icon: Code },
    { key: "security", title: "Security", icon: Shield },
    { key: "integrations", title: "Integrations", icon: Zap },
  ];

  const overallCfg = statusConfig[result?.status ?? "unknown"] || statusConfig.unknown;
  const OverallIcon = overallCfg.icon;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Diagnostic</h1>
          <p className="text-muted-foreground text-sm mt-1">Health check & platform status</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={runDiagnostic} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Full Diagnostic
          </Button>
          <Button variant="outline" onClick={copyDiagnostic} disabled={!result} className="gap-2"><Copy className="w-4 h-4" /> Copy</Button>
          <Button variant="outline" onClick={exportDiagnostic} disabled={!result} className="gap-2"><Download className="w-4 h-4" /> Export</Button>
        </div>
      </div>

      {/* Live Stats Cards */}
      {localDiag && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="glass-card"><CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Webhook className="w-3 h-3" />Gateways</div>
            <p className="text-lg font-bold text-foreground">{localDiag.gateways.active}/{localDiag.gateways.count}</p>
            <p className="text-xs text-emerald-400">ativos</p>
          </CardContent></Card>
          <Card className="glass-card"><CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><ShoppingCart className="w-3 h-3" />Pedidos</div>
            <p className="text-lg font-bold text-foreground">{localDiag.orders.paid}/{localDiag.orders.total}</p>
            <p className="text-xs text-emerald-400">pagos</p>
          </CardContent></Card>
          <Card className="glass-card"><CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Activity className="w-3 h-3" />Webhooks</div>
            <p className="text-lg font-bold text-foreground">{localDiag.webhooks.processed}/{localDiag.webhooks.total}</p>
            <p className="text-xs text-emerald-400">processados</p>
          </CardContent></Card>
          <Card className="glass-card"><CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Zap className="w-3 h-3" />Meta Delivery</div>
            <p className="text-lg font-bold text-foreground">{localDiag.metaDelivery.successRate}%</p>
            <p className="text-xs text-muted-foreground">{localDiag.metaDelivery.delivered} ok · {localDiag.metaDelivery.failed} fail</p>
          </CardContent></Card>
          <Card className="glass-card"><CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><GitBranch className="w-3 h-3" />Reconciliação</div>
            <p className="text-lg font-bold text-foreground">{localDiag.reconciliation.matchRate}%</p>
            <p className="text-xs text-muted-foreground">{localDiag.reconciliation.matched}/{localDiag.reconciliation.total}</p>
          </CardContent></Card>
          <Card className="glass-card"><CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Globe className="w-3 h-3" />Pixels Meta</div>
            <p className="text-lg font-bold text-foreground">{localDiag.pixels.active}/{localDiag.pixels.total}</p>
            <p className="text-xs text-muted-foreground">configurados</p>
          </CardContent></Card>
        </div>
      )}

      {/* Overall Status Card */}
      {result && (
        <Card className="glass-card border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${result.status === "healthy" ? "bg-emerald-500/10" : result.status === "warnings" ? "bg-amber-500/10" : "bg-red-500/10"}`}>
                  <OverallIcon className={`w-6 h-6 ${result.status === "healthy" ? "text-emerald-400" : result.status === "warnings" ? "text-amber-400" : "text-red-400"}`} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground capitalize">{result.status}</p>
                  <p className="text-sm text-muted-foreground">Completed in {result.total_time_ms}ms · {result.errors.length} errors · {result.warnings.length} warnings</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={runDiagnostic} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Errors & Warnings */}
      {result && (result.errors.length > 0 || result.warnings.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {result.errors.length > 0 && (
            <Card className="glass-card border-red-500/20">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2"><XCircle className="w-4 h-4" /> Errors ({result.errors.length})</CardTitle></CardHeader>
              <CardContent className="space-y-1">{result.errors.map((e, i) => <p key={i} className="text-xs text-red-300/80 font-mono">{e}</p>)}</CardContent>
            </Card>
          )}
          {result.warnings.length > 0 && (
            <Card className="glass-card border-amber-500/20">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Warnings ({result.warnings.length})</CardTitle></CardHeader>
              <CardContent className="space-y-1">{result.warnings.map((w, i) => <p key={i} className="text-xs text-amber-300/80 font-mono">{w}</p>)}</CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Service Sections */}
      {result ? (
        <div className="space-y-2">
          {sections.map((s) => {
            const data = (svc[s.key] ?? {}) as Record<string, unknown>;
            return <ServiceSection key={s.key} title={s.title} icon={s.icon} status={String(data.status ?? "unknown")} details={data} checkedAt={data.checked_at as string | undefined} responseTime={data.response_time_ms as number | undefined} />;
          })}
        </div>
      ) : (
        <Card className="glass-card border-border/50">
          <CardContent className="p-12 text-center">
            <Activity className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-foreground font-medium mb-1">No diagnostic data</h3>
            <p className="text-sm text-muted-foreground mb-4">Click "Run Full Diagnostic" to check all systems.</p>
            <Button onClick={runDiagnostic} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run Full Diagnostic
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
