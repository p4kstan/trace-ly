import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Link2, Star, Trash2, Settings, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import RoutingRulesEditor, { RoutingRules } from "./RoutingRulesEditor";

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
}

export default function GoogleAdsAccountsManager({ workspaceId }: { workspaceId: string | null }) {
  const [accounts, setAccounts] = useState<GAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [label, setLabel] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [editing, setEditing] = useState<GAccount | null>(null);
  const [editRules, setEditRules] = useState<RoutingRules>({ routing_mode: "all", routing_domains: [], routing_tags: [] });
  const [editLabel, setEditLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    const { data } = await supabase
      .from("google_ads_credentials")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("is_default", { ascending: false });
    setAccounts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // OAuth callback feedback
    const params = new URLSearchParams(window.location.search);
    if (params.get("gads") === "connected") {
      toast.success("Conta Google Ads conectada!");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("gads") === "error") {
      toast.error(`Falha: ${params.get("reason") || "desconhecida"}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line
  }, [workspaceId]);

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
        body: {
          workspace_id: workspaceId,
          customer_id: cleaned,
          account_label: label.trim() || null,
          return_url: "/contas-conectadas",
        },
      });
      if (error) throw error;
      if (data?.auth_url) window.location.href = data.auth_url;
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
      setConnecting(false);
    }
  };

  const setDefault = async (acc: GAccount) => {
    if (!workspaceId) return;
    // Clear current defaults, then set this one
    await supabase.from("google_ads_credentials").update({ is_default: false }).eq("workspace_id", workspaceId);
    const { error } = await supabase
      .from("google_ads_credentials")
      .update({ is_default: true })
      .eq("workspace_id", workspaceId)
      .eq("customer_id", acc.customer_id);
    if (error) toast.error(error.message);
    else {
      toast.success("Conta padrão atualizada");
      load();
    }
  };

  const remove = async (acc: GAccount) => {
    if (!workspaceId) return;
    if (!confirm(`Remover conta ${acc.account_label || acc.customer_id}? Eventos não serão mais enviados pra ela.`)) return;
    const { error } = await supabase
      .from("google_ads_credentials")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("customer_id", acc.customer_id);
    if (error) toast.error(error.message);
    else {
      toast.success("Conta removida");
      load();
    }
  };

  const sync = async (acc: GAccount) => {
    if (!workspaceId) return;
    setSyncingId(acc.customer_id);
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-sync", {
        body: { workspace_id: workspaceId, customer_id: acc.customer_id, days: 30 },
      });
      if (error) throw error;
      toast.success(`Sincronizado: ${data?.synced ?? 0} registros`);
      load();
    } catch (e: any) {
      toast.error(`Falha: ${e.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  const reconnect = async (acc: GAccount) => {
    if (!workspaceId) return;
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-oauth-initiate", {
        body: {
          workspace_id: workspaceId,
          customer_id: acc.customer_id,
          account_label: acc.account_label || null,
          return_url: "/contas-conectadas",
        },
      });
      if (error) throw error;
      if (data?.auth_url) window.location.href = data.auth_url;
    } catch (e: any) {
      toast.error(`Erro ao reconectar: ${e.message}`);
    }
  };

  const openEdit = (acc: GAccount) => {
    setEditing(acc);
    setEditLabel(acc.account_label || "");
    setEditRules({
      routing_mode: (acc.routing_mode as any) || "all",
      routing_domains: acc.routing_domains || [],
      routing_tags: acc.routing_tags || [],
    });
  };

  const saveEdit = async () => {
    if (!editing || !workspaceId) return;
    setSaving(true);
    const { error } = await supabase
      .from("google_ads_credentials")
      .update({
        account_label: editLabel.trim() || null,
        routing_mode: editRules.routing_mode,
        routing_domains: editRules.routing_domains,
        routing_tags: editRules.routing_tags,
      })
      .eq("workspace_id", workspaceId)
      .eq("customer_id", editing.customer_id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Conta atualizada");
      setEditing(null);
      load();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Contas Google Ads conectadas</h3>
          <p className="text-xs text-muted-foreground">{accounts.length} conta(s) — adicione quantas precisar</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Adicionar conta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conectar nova conta Google Ads</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cid" className="text-xs">Customer ID *</Label>
                <Input id="cid" placeholder="123-456-7890" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lbl" className="text-xs">Apelido (opcional)</Label>
                <Input id="lbl" placeholder="Ex: Loja BR — Produto A" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Você será redirecionado pro Google pra autorizar. Após conectar, configure o roteamento (por domínio ou tag).
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleConnect} disabled={connecting || !customerId}>
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
                Conectar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Link2 className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma conta conectada ainda.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Clique em "Adicionar conta" pra começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {accounts.map((acc) => (
            <Card key={acc.customer_id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        {acc.account_label || `Conta ${acc.customer_id}`}
                      </h4>
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
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground space-y-0.5">
                      <p>ID: <span className="font-mono text-foreground/80">{acc.customer_id}</span></p>
                      <p>Roteamento: <span className="text-foreground/80">{labelForMode(acc.routing_mode, acc.routing_domains, acc.routing_tags)}</span></p>
                      <p>Última sync: {acc.last_sync_at ? new Date(acc.last_sync_at).toLocaleString("pt-BR") : "nunca"}</p>
                    </div>
                    {acc.last_error && (
                      <div className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded p-2">
                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span className="break-all">{acc.last_error}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {(acc.status === "error" || acc.last_error) && (
                      <Button size="sm" variant="outline" onClick={() => reconnect(acc)} title="Reconectar conta" className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                        <Link2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {!acc.is_default && (
                      <Button size="sm" variant="ghost" onClick={() => setDefault(acc)} title="Definir como padrão">
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => sync(acc)} disabled={syncingId === acc.customer_id} title="Sincronizar campanhas">
                      {syncingId === acc.customer_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(acc)} title="Editar roteamento">
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(acc)} title="Remover" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar conta {editing?.customer_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Apelido</Label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Ex: Produto A" />
            </div>
            <RoutingRulesEditor value={editRules} onChange={setEditRules} disabled={saving} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function labelForMode(mode: string | null, domains: string[] | null, tags: string[] | null): string {
  const m = mode || "all";
  if (m === "all") return "Todos os eventos";
  if (m === "domain") return `Domínios: ${(domains || []).join(", ") || "(nenhum)"}`;
  if (m === "tag") return `Tags: ${(tags || []).join(", ") || "(nenhuma)"}`;
  return m;
}
