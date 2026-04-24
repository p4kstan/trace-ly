import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, KeyRound, RefreshCw, CheckCircle2, XCircle, Edit3, Save, X, Unlink, ExternalLink } from "lucide-react";

interface SecretStatus { exists: boolean; masked: string | null }
interface StatusResponse {
  secrets: {
    GOOGLE_OAUTH_CLIENT_ID: SecretStatus;
    GOOGLE_OAUTH_CLIENT_SECRET: SecretStatus;
    GOOGLE_ADS_DEVELOPER_TOKEN: SecretStatus;
  };
  workspace_credentials: {
    customer_id: string;
    customer_id_formatted: string;
    login_customer_id?: string | null;
    login_customer_id_formatted?: string | null;
    status: string;
    has_refresh_token: boolean;
    last_sync_at: string | null;
    last_error: string | null;
    updated_at: string;
  } | null;
}

interface Props { workspaceId: string | null; onChanged?: () => void }

export default function GoogleAdsCredentialsManager({ workspaceId, onChanged }: Props) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCustomerId, setEditingCustomerId] = useState(false);
  const [customerIdInput, setCustomerIdInput] = useState("");
  const [loginCustomerIdInput, setLoginCustomerIdInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-ads-credentials-status?workspace_id=${workspaceId}`;
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setData(json);
      setCustomerIdInput(json.workspace_credentials?.customer_id_formatted || "");
      setLoginCustomerIdInput(json.workspace_credentials?.login_customer_id_formatted || "");
    } catch (e: any) {
      toast.error(`Erro ao carregar credenciais: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  const updateSecret = (name: string) => {
    toast.message(`Como atualizar ${name}`, {
      description: "No menu lateral do Lovable, abra Cloud → Secrets → encontre o nome → clique em Update value. Depois volte aqui e clique no botão de refresh.",
      duration: 10000,
    });
  };

  const saveCustomerId = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("google-ads-credentials-update", {
        body: {
          workspace_id: workspaceId,
          action: "update_customer_id",
          customer_id: customerIdInput,
          login_customer_id: loginCustomerIdInput,
        },
      });
      if (error) throw error;
      toast.success("Credenciais Google Ads atualizadas");
      setEditingCustomerId(false);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!workspaceId) return;
    if (!confirm("Desconectar Google Ads? Você terá que autorizar novamente.")) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("google-ads-credentials-update", {
        body: { workspace_id: workspaceId, action: "disconnect" },
      });
      if (error) throw error;
      toast.success("Desconectado. Conecte novamente quando quiser.");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <Card className="glass-card"><CardContent className="p-4 flex items-center justify-center">
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
    </CardContent></Card>
  );

  if (!data) return null;

  return (
    <Card className="glass-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Credenciais cadastradas</h3>
          </div>
          <Button onClick={load} variant="ghost" size="sm" className="h-7 px-2">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Visualize e atualize cada credencial individualmente. Os valores são mascarados por segurança.
        </p>

        <div className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conta Google Ads</h4>

          <div className="bg-muted/20 border border-border/30 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Credenciais da conta</span>
              {!editingCustomerId ? (
                <Button onClick={() => setEditingCustomerId(true)} variant="ghost" size="sm" className="h-6 px-2 text-xs">
                  <Edit3 className="w-3 h-3 mr-1" /> Editar
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button onClick={saveCustomerId} disabled={saving} size="sm" className="h-6 px-2 text-xs">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3 mr-1" />Salvar</>}
                  </Button>
                  <Button onClick={() => {
                    setEditingCustomerId(false);
                    setCustomerIdInput(data.workspace_credentials?.customer_id_formatted || "");
                    setLoginCustomerIdInput(data.workspace_credentials?.login_customer_id_formatted || "");
                  }} variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">Customer ID</span>
              {editingCustomerId ? (
                <Input
                  value={customerIdInput}
                  onChange={(e) => setCustomerIdInput(e.target.value)}
                  placeholder="123-456-7890"
                  className="h-8 text-xs font-mono"
                />
              ) : (
                <p className="text-xs font-mono text-muted-foreground">
                  {data.workspace_credentials?.customer_id_formatted || <span className="italic">não definido</span>}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">Login Customer ID (MCC)</span>
              {editingCustomerId ? (
                <Input
                  value={loginCustomerIdInput}
                  onChange={(e) => setLoginCustomerIdInput(e.target.value)}
                  placeholder="880-479-2807"
                  className="h-8 text-xs font-mono"
                />
              ) : (
                <p className="text-xs font-mono text-muted-foreground">
                  {data.workspace_credentials?.login_customer_id_formatted || <span className="italic">não definido</span>}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">Preencha somente se a conta cliente estiver sob uma manager account (MCC).</p>
            </div>
          </div>

          <div className="bg-muted/20 border border-border/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Autorização OAuth</span>
              {data.workspace_credentials?.status === "connected" ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] h-5">
                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Conectado
                </Badge>
              ) : (
                <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground text-[10px] h-5">
                  <XCircle className="w-2.5 h-2.5 mr-1" />Desconectado
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {data.workspace_credentials?.has_refresh_token ? "Tokens armazenados" : "Sem tokens"}
                {data.workspace_credentials?.last_sync_at && ` · Última sync: ${new Date(data.workspace_credentials.last_sync_at).toLocaleString("pt-BR")}`}
              </p>
              {data.workspace_credentials?.status === "connected" && (
                <Button onClick={disconnect} disabled={saving} variant="ghost" size="sm" className="h-6 px-2 text-xs text-rose-400 hover:text-rose-300">
                  <Unlink className="w-3 h-3 mr-1" /> Desconectar
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/30">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Secrets globais (Lovable Cloud)</h4>
          {[
            { key: "GOOGLE_OAUTH_CLIENT_ID", label: "OAuth Client ID" },
            { key: "GOOGLE_OAUTH_CLIENT_SECRET", label: "OAuth Client Secret" },
            { key: "GOOGLE_ADS_DEVELOPER_TOKEN", label: "Developer Token" },
          ].map((s) => {
            const status = data.secrets[s.key as keyof typeof data.secrets];
            return (
              <div key={s.key} className="bg-muted/20 border border-border/30 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-foreground">{s.label}</span>
                    {status?.exists ? (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] h-4">OK</Badge>
                    ) : (
                      <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/10 text-[10px] h-4">Faltando</Badge>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-muted-foreground truncate">
                    {status?.masked || "—"}
                  </p>
                </div>
                <Button onClick={() => updateSecret(s.key)} variant="outline" size="sm" className="h-7 px-2 text-xs shrink-0">
                  <Edit3 className="w-3 h-3 mr-1" /> Trocar
                </Button>
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground pt-1 flex items-start gap-1">
            <ExternalLink className="w-2.5 h-2.5 mt-0.5 shrink-0" />
            <span>Por segurança, valores secretos só podem ser trocados pelo painel de Secrets. Clique em "Trocar" para abrir.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
