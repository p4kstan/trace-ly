import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Star, Trash2, Settings, CheckCircle2 } from "lucide-react";
import RoutingRulesEditor, { RoutingRules } from "./RoutingRulesEditor";

interface MetaAccount {
  id: string;
  workspace_id: string;
  account_label: string | null;
  pixel_id: string;
  access_token: string;
  ad_account_id: string | null;
  status: string;
  routing_mode: string | null;
  routing_domains: string[] | null;
  routing_tags: string[] | null;
  is_default: boolean | null;
}

export default function MetaAccountsManager({ workspaceId }: { workspaceId: string | null }) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ label: "", pixel_id: "", access_token: "", ad_account_id: "" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<MetaAccount | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editRules, setEditRules] = useState<RoutingRules>({ routing_mode: "all", routing_domains: [], routing_tags: [] });

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    const { data } = await supabase
      .from("meta_ad_accounts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("is_default", { ascending: false });
    setAccounts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const create = async () => {
    if (!workspaceId) return;
    if (!form.pixel_id.trim() || !form.access_token.trim()) {
      toast.error("Pixel ID e Access Token são obrigatórios");
      return;
    }
    setSaving(true);
    const isFirst = accounts.length === 0;
    const { error } = await supabase.from("meta_ad_accounts").insert({
      workspace_id: workspaceId,
      account_label: form.label.trim() || null,
      pixel_id: form.pixel_id.trim(),
      access_token: form.access_token.trim(),
      ad_account_id: form.ad_account_id.trim() || null,
      status: "connected",
      routing_mode: "all",
      routing_domains: [],
      routing_tags: [],
      is_default: isFirst,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Conta Meta adicionada");
      setForm({ label: "", pixel_id: "", access_token: "", ad_account_id: "" });
      setAddOpen(false);
      load();
    }
  };

  const setDefault = async (acc: MetaAccount) => {
    if (!workspaceId) return;
    await supabase.from("meta_ad_accounts").update({ is_default: false }).eq("workspace_id", workspaceId);
    const { error } = await supabase.from("meta_ad_accounts").update({ is_default: true }).eq("id", acc.id);
    if (error) toast.error(error.message);
    else { toast.success("Padrão atualizado"); load(); }
  };

  const remove = async (acc: MetaAccount) => {
    if (!confirm(`Remover ${acc.account_label || acc.pixel_id}?`)) return;
    const { error } = await supabase.from("meta_ad_accounts").delete().eq("id", acc.id);
    if (error) toast.error(error.message);
    else { toast.success("Removida"); load(); }
  };

  const openEdit = (acc: MetaAccount) => {
    setEditing(acc);
    setEditLabel(acc.account_label || "");
    setEditRules({
      routing_mode: (acc.routing_mode as any) || "all",
      routing_domains: acc.routing_domains || [],
      routing_tags: acc.routing_tags || [],
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from("meta_ad_accounts").update({
      account_label: editLabel.trim() || null,
      routing_mode: editRules.routing_mode,
      routing_domains: editRules.routing_domains,
      routing_tags: editRules.routing_tags,
    }).eq("id", editing.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Atualizada"); setEditing(null); load(); }
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Contas Meta / Facebook conectadas</h3>
          <p className="text-xs text-muted-foreground">{accounts.length} conta(s) — adicione quantos pixels precisar</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Adicionar conta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova conta Meta CAPI</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Apelido (opcional)</Label>
                <Input placeholder="Ex: Loja BR — Pixel principal" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pixel ID *</Label>
                <Input placeholder="1234567890" value={form.pixel_id} onChange={(e) => setForm({ ...form, pixel_id: e.target.value })} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Access Token (CAPI) *</Label>
                <Input type="password" placeholder="EAAB..." value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ad Account ID (opcional)</Label>
                <Input placeholder="act_1234567890" value={form.ad_account_id} onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })} className="font-mono" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma conta Meta nova aqui ainda.</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Pixels configurados na página antiga continuam funcionando. Use isto pra adicionar contas extras.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        {acc.account_label || `Pixel ${acc.pixel_id}`}
                      </h4>
                      {acc.is_default && (
                        <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px]">
                          <Star className="w-2.5 h-2.5 mr-1" /> Padrão
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> {acc.status}
                      </Badge>
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground space-y-0.5">
                      <p>Pixel: <span className="font-mono text-foreground/80">{acc.pixel_id}</span></p>
                      {acc.ad_account_id && <p>Ad Account: <span className="font-mono text-foreground/80">{acc.ad_account_id}</span></p>}
                      <p>Roteamento: <span className="text-foreground/80">{labelForMode(acc.routing_mode, acc.routing_domains, acc.routing_tags)}</span></p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {!acc.is_default && (
                      <Button size="sm" variant="ghost" onClick={() => setDefault(acc)} title="Padrão">
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(acc)} title="Editar">
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
          <DialogHeader><DialogTitle>Editar conta Meta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Apelido</Label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
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
