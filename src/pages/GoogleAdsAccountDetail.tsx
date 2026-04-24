import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Link2, RefreshCw, Star, Trash2,
  CheckCircle2, AlertCircle, Save,
} from "lucide-react";
import RoutingRulesEditor, { RoutingRules } from "@/components/accounts/RoutingRulesEditor";

interface GAccount {
  workspace_id: string;
  customer_id: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  account_label: string | null;
  routing_mode: string | null;
  routing_domains: string[] | null;
  routing_tags: string[] | null;
  is_default: boolean | null;
  developer_token?: string | null;
  token_expires_at?: string | null;
  created_at?: string | null;
  login_customer_id?: string | null;
}

export default function GoogleAdsAccountDetail() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [acc, setAcc] = useState<GAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [rules, setRules] = useState<RoutingRules>({ routing_mode: "all", routing_domains: [], routing_tags: [] });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", user.id)
        .limit(1)
        .maybeSingle();
      setWorkspaceId(ws?.id ?? null);
    })();
  }, [user]);

  const load = async () => {
    if (!workspaceId || !customerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("google_ads_credentials")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("customer_id", customerId)
      .maybeSingle();
    const a = data as any as GAccount | null;
    setAcc(a);
    if (a) {
      setLabel(a.account_label || "");
      setLoginCustomerId(a.login_customer_id || "");
      setRules({
        routing_mode: (a.routing_mode as any) || "all",
        routing_domains: a.routing_domains || [],
        routing_tags: a.routing_tags || [],
      });
    }
    // recent campaigns (best effort — table may not exist yet)
    try {
      const { data: camps } = await supabase
        .from("google_ads_campaigns" as any)
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("date", { ascending: false })
        .limit(20);
      setCampaigns((camps as any[]) || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspaceId, customerId]);

  const save = async () => {
    if (!workspaceId || !acc) return;
    setSaving(true);
    const { error } = await supabase
      .from("google_ads_credentials")
      .update({
        account_label: label.trim() || null,
        login_customer_id: loginCustomerId.replace(/-/g, "").trim() || null,
        routing_mode: rules.routing_mode,
        routing_domains: rules.routing_domains,
        routing_tags: rules.routing_tags,
      } as any)
      .eq("workspace_id", workspaceId)
      .eq("customer_id", acc.customer_id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Conta atualizada"); load(); }
  };

  const reconnect = async () => {
    if (!workspaceId || !acc) return;
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-oauth-initiate", {
        body: {
          workspace_id: workspaceId,
          customer_id: acc.customer_id,
          account_label: acc.account_label || null,
          return_url: `/contas-conectadas/google/${acc.customer_id}`,
        },
      });
      if (error) throw error;
      if (data?.auth_url) window.location.href = data.auth_url;
    } catch (e: any) {
      toast.error(`Erro ao reconectar: ${e.message}`);
    }
  };

  const sync = async () => {
    if (!workspaceId || !acc) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-sync", {
        body: { workspace_id: workspaceId, customer_id: acc.customer_id, days: 30 },
      });
      let info: any = null;
      if (error) {
        const ctx: any = (error as any)?.context;
        try { info = await ctx?.json?.(); } catch { /* ignore */ }
        if (!info) { try { info = JSON.parse(error.message); } catch { /* ignore */ } }
      } else info = data;
      if (info?.reconnect) {
        toast.error("Reconexão necessária. Redirecionando…");
        await reconnect();
        return;
      }
      if (error) throw new Error(info?.error || error.message);
      toast.success(`Sincronizado: ${data?.synced ?? 0} registros`);
      load();
    } catch (e: any) {
      toast.error(`Falha: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const setDefault = async () => {
    if (!workspaceId || !acc) return;
    await supabase.from("google_ads_credentials").update({ is_default: false }).eq("workspace_id", workspaceId);
    const { error } = await supabase
      .from("google_ads_credentials")
      .update({ is_default: true })
      .eq("workspace_id", workspaceId)
      .eq("customer_id", acc.customer_id);
    if (error) toast.error(error.message);
    else { toast.success("Conta padrão atualizada"); load(); }
  };

  const remove = async () => {
    if (!workspaceId || !acc) return;
    if (!confirm(`Remover conta ${acc.account_label || acc.customer_id}?`)) return;
    const { error } = await supabase
      .from("google_ads_credentials")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("customer_id", acc.customer_id);
    if (error) toast.error(error.message);
    else { toast.success("Conta removida"); navigate("/contas-conectadas"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (!acc) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/contas-conectadas"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Conta não encontrada.</p>
        </CardContent></Card>
      </div>
    );
  }

  const needsReconnect = acc.status === "pending" || acc.status === "error" || !!acc.last_error;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/contas-conectadas"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar pra contas conectadas</Link>
      </Button>

      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-xl text-foreground flex items-center gap-2 flex-wrap">
                {acc.account_label || `Conta ${acc.customer_id}`}
                {acc.is_default && (
                  <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px]">
                    <Star className="w-2.5 h-2.5 mr-1" /> Padrão
                  </Badge>
                )}
                {acc.status === "connected" && (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Conectado
                  </Badge>
                )}
                {acc.status === "pending" && (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-[10px]">Pendente</Badge>
                )}
                {acc.status === "error" && (
                  <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/10 text-[10px]">Erro</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Customer ID: <span className="font-mono text-foreground/80">{acc.customer_id}</span>
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {needsReconnect && (
                <Button size="sm" variant="outline" onClick={reconnect} className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                  <Link2 className="w-3.5 h-3.5 mr-1.5" /> Reconectar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
                {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Sincronizar
              </Button>
              {!acc.is_default && (
                <Button size="sm" variant="ghost" onClick={setDefault}>
                  <Star className="w-3.5 h-3.5 mr-1.5" /> Tornar padrão
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={remove} className="text-destructive hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remover
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {acc.last_error && (
            <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-all">{acc.last_error}</span>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <Info label="Última sync" value={acc.last_sync_at ? new Date(acc.last_sync_at).toLocaleString("pt-BR") : "Nunca"} />
            <Info label="Token expira" value={acc.token_expires_at ? new Date(acc.token_expires_at).toLocaleString("pt-BR") : "—"} />
            <Info label="Conectada em" value={acc.created_at ? new Date(acc.created_at).toLocaleString("pt-BR") : "—"} />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Configurações</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lbl" className="text-xs">Apelido da conta</Label>
            <Input id="lbl" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Loja BR — Produto A" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcc" className="text-xs">ID da conta gerenciadora (MCC) — opcional</Label>
            <Input
              id="mcc"
              value={loginCustomerId}
              onChange={(e) => setLoginCustomerId(e.target.value)}
              placeholder="Ex: 880-479-2807 (deixe vazio se a conta não está sob MCC)"
            />
            <p className="text-[11px] text-muted-foreground">
              Necessário quando a conta é cliente de uma manager account. Enviado como header <code>login-customer-id</code>.
            </p>
          </div>
          <RoutingRulesEditor value={rules} onChange={setRules} disabled={saving} />
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar alterações
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/50 bg-muted/20 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-foreground/90 truncate">{value}</p>
    </div>
  );
}
