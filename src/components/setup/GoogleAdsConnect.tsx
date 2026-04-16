import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Link2, RefreshCw, CheckCircle2, AlertCircle, TrendingUp, MousePointerClick, Eye, DollarSign } from "lucide-react";
import GoogleAdsCredentialsManager from "./GoogleAdsCredentialsManager";

interface CredRow {
  workspace_id: string;
  customer_id: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

interface CampaignRow {
  campaign_id: string;
  campaign_name: string | null;
  status: string | null;
  date: string;
  cost_micros: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversion_value: number;
}

export default function GoogleAdsConnect() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [cred, setCred] = useState<CredRow | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Detect callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gads = params.get("gads");
    if (gads === "connected") {
      toast.success("Google Ads conectado com sucesso!");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (gads === "error") {
      toast.error(`Falha na conexão: ${params.get("reason") || "desconhecida"}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!ws) { setLoading(false); return; }
      setWorkspaceId(ws.id);

      const { data: creds } = await supabase
        .from("google_ads_credentials")
        .select("workspace_id, customer_id, status, last_sync_at, last_error")
        .eq("workspace_id", ws.id)
        .order("is_default", { ascending: false })
        .limit(1);

      const c = (creds?.[0] ?? null) as CredRow | null;
      setCred(c);
      if (c?.customer_id) setCustomerId(c.customer_id);

      const { data: camps } = await supabase
        .from("google_ads_campaigns")
        .select("campaign_id, campaign_name, status, date, cost_micros, impressions, clicks, ctr, conversions, conversion_value")
        .eq("workspace_id", ws.id)
        .order("date", { ascending: false })
        .limit(500);

      setCampaigns((camps as CampaignRow[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleConnect = async () => {
    if (!workspaceId) return;
    const cleaned = customerId.replace(/-/g, "");
    if (!/^\d{10}$/.test(cleaned)) {
      toast.error("Customer ID inválido. Formato: XXX-XXX-XXXX");
      return;
    }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-oauth-initiate", {
        body: { workspace_id: workspaceId, customer_id: cleaned, return_url: "/setup-google" },
      });
      if (error) throw error;
      if (data?.auth_url) window.location.href = data.auth_url;
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    if (!workspaceId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-sync", {
        body: { workspace_id: workspaceId, days: 30 },
      });
      if (error) throw error;
      toast.success(`Sincronizado: ${data?.synced ?? 0} registros`);
      await loadAll();
    } catch (e: any) {
      toast.error(`Falha na sync: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Aggregate metrics (last 30d total)
  const totals = campaigns.reduce((acc, c) => {
    acc.cost += c.cost_micros / 1_000_000;
    acc.impr += c.impressions;
    acc.clicks += c.clicks;
    acc.conv += c.conversions;
    acc.value += c.conversion_value;
    return acc;
  }, { cost: 0, impr: 0, clicks: 0, conv: 0, value: 0 });
  const ctrAvg = totals.impr ? (totals.clicks / totals.impr) * 100 : 0;
  const roas = totals.cost ? totals.value / totals.cost : 0;

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  const connected = cred?.status === "connected";

  return (
    <div className="space-y-4">
      {/* Credentials manager (always visible) */}
      <GoogleAdsCredentialsManager workspaceId={workspaceId} onChanged={loadAll} />

      {/* Connection card */}
      <Card className="glass-card">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">Conexão OAuth</h3>
              {connected && <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10"><CheckCircle2 className="w-3 h-3 mr-1" />Conectado</Badge>}
              {cred?.status === "pending" && <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10">Pendente</Badge>}
            </div>
          </div>

          {!connected ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="customerId" className="text-xs">Google Ads Customer ID</Label>
                <Input
                  id="customerId"
                  placeholder="123-456-7890"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">ID da conta normal (não MCC). Canto sup. direito do Google Ads, acima do e-mail.</p>
              </div>
              <Button onClick={handleConnect} disabled={connecting || !customerId} className="w-full">
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
                Conectar com Google
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                <p>Customer ID: <span className="text-foreground font-mono">{cred?.customer_id}</span></p>
                <p>Última sync: {cred?.last_sync_at ? new Date(cred.last_sync_at).toLocaleString("pt-BR") : "nunca"}</p>
              </div>
              <Button onClick={handleSync} disabled={syncing} size="sm" variant="secondary">
                {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sincronizar
              </Button>
            </div>
          )}

          {cred?.last_error && (
            <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-all">{cred.last_error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metrics dashboard */}
      {connected && campaigns.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricMini icon={DollarSign} label="Gasto (30d)" value={`R$ ${totals.cost.toFixed(2)}`} />
            <MetricMini icon={Eye} label="Impressões" value={totals.impr.toLocaleString("pt-BR")} />
            <MetricMini icon={MousePointerClick} label="Cliques" value={`${totals.clicks.toLocaleString("pt-BR")} · ${ctrAvg.toFixed(2)}% CTR`} />
            <MetricMini icon={TrendingUp} label="ROAS" value={`${roas.toFixed(2)}x`} sub={`${totals.conv.toFixed(0)} conv · R$ ${totals.value.toFixed(2)}`} />
          </div>

          <Card className="glass-card">
            <CardContent className="p-4">
              <h4 className="text-xs font-semibold text-foreground mb-3">Campanhas (últimos 30 dias)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/30">
                      <th className="text-left py-2 px-2">Campanha</th>
                      <th className="text-right py-2 px-2">Gasto</th>
                      <th className="text-right py-2 px-2">Impr.</th>
                      <th className="text-right py-2 px-2">Cliques</th>
                      <th className="text-right py-2 px-2">Conv.</th>
                      <th className="text-right py-2 px-2">Receita</th>
                      <th className="text-right py-2 px-2">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(
                      campaigns.reduce((acc, c) => {
                        const k = c.campaign_id;
                        if (!acc[k]) acc[k] = { name: c.campaign_name || k, cost: 0, impr: 0, clicks: 0, conv: 0, value: 0 };
                        acc[k].cost += c.cost_micros / 1_000_000;
                        acc[k].impr += c.impressions;
                        acc[k].clicks += c.clicks;
                        acc[k].conv += c.conversions;
                        acc[k].value += c.conversion_value;
                        return acc;
                      }, {} as Record<string, any>)
                    )
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .slice(0, 20)
                      .map(([id, r]) => (
                        <tr key={id} className="border-b border-border/10 hover:bg-muted/20">
                          <td className="py-2 px-2 text-foreground truncate max-w-[200px]">{r.name}</td>
                          <td className="py-2 px-2 text-right text-foreground">R$ {r.cost.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{r.impr.toLocaleString("pt-BR")}</td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{r.clicks.toLocaleString("pt-BR")}</td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{r.conv.toFixed(0)}</td>
                          <td className="py-2 px-2 text-right text-foreground">R$ {r.value.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right text-emerald-400 font-medium">{r.cost ? (r.value / r.cost).toFixed(2) : "0.00"}x</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {connected && campaigns.length === 0 && (
        <div className="text-center text-sm text-muted-foreground p-6 border border-dashed border-border/40 rounded-lg">
          Nenhuma campanha sincronizada ainda. Clique em "Sincronizar".
        </div>
      )}
    </div>
  );
}

function MetricMini({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          <Icon className="w-3.5 h-3.5" />
          <span className="text-[11px]">{label}</span>
        </div>
        <p className="text-base font-bold text-foreground">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
