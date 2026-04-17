import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KeyRound, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function QuantumWebhookSecret() {
  const { data: workspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [secretPreview, setSecretPreview] = useState("");
  const [secretLength, setSecretLength] = useState(0);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!workspace?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("gateway_integrations")
        .select("id, webhook_secret_encrypted")
        .eq("workspace_id", workspace.id)
        .eq("provider", "quantumpay")
        .maybeSingle();
      if (data) {
        setIntegrationId(data.id);
        const s = data.webhook_secret_encrypted || "";
        setHasSecret(!!s);
        setSecretLength(s.length);
        setSecretPreview(s.length > 8 ? `${s.slice(0, 6)}…${s.slice(-4)}` : "");
      }
      setLoading(false);
    })();
  }, [workspace?.id]);

  const save = async () => {
    if (!workspace?.id || !secret.trim()) {
      toast.error("Cole o Signing Secret antes de salvar");
      return;
    }
    setSaving(true);
    const payload = {
      workspace_id: workspace.id,
      provider: "quantumpay",
      name: "Quantum Pay",
      status: "active",
      webhook_secret_encrypted: secret.trim(),
    };
    const { error } = integrationId
      ? await supabase.from("gateway_integrations")
          .update({ webhook_secret_encrypted: secret.trim(), status: "active" })
          .eq("id", integrationId)
      : await supabase.from("gateway_integrations").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    setHasSecret(true);
    setSecret("");
    toast.success("✅ Signing Secret salvo", { description: "Webhooks Quantum agora serão validados via HMAC-SHA256." });
    // refresh id
    const { data } = await supabase
      .from("gateway_integrations")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("provider", "quantumpay")
      .maybeSingle();
    if (data) setIntegrationId(data.id);
  };

  return (
    <Card className="glass-card border-primary/30">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          6. Signing Secret do Webhook Quantum
          {!loading && (hasSecret ? (
            <Badge className="ml-1 text-[10px] bg-primary/20 text-primary border-primary/40">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Configurado
            </Badge>
          ) : (
            <Badge variant="destructive" className="ml-1 text-[10px]">
              <AlertCircle className="w-3 h-3 mr-1" /> Não configurado
            </Badge>
          ))}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Cole aqui o <b>Signing Secret (HMAC-SHA256)</b> que a Quantum gerou ao criar o webhook.
          Sem ele, o CapiTrack rejeita os webhooks (proteção contra payloads falsos).
          O header validado é <code>Quantum-Pay-Signature: t=timestamp,v1=hmac_sha256</code>.
        </p>

        {hasSecret && secretPreview && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">Secret salvo no servidor</div>
                <code className="text-[11px] font-mono text-muted-foreground truncate block">
                  {secretPreview} <span className="opacity-60">({secretLength} caracteres)</span>
                </code>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={show ? "text" : "password"}
              placeholder={hasSecret ? "•••••••••••••••• (já salvo — cole novo para substituir)" : "9ce7a7ccd935..."}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="font-mono text-xs pr-10"
              disabled={loading || saving}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button onClick={save} disabled={loading || saving || !secret.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>

        <div className="rounded-lg bg-accent/10 border border-accent/30 p-3 text-xs text-muted-foreground">
          🔒 O secret fica criptografado no nosso backend e nunca aparece no navegador depois de salvo.
          Se você rotacionar o secret na Quantum, atualize aqui também — senão os webhooks vão começar a falhar.
        </div>
      </CardContent>
    </Card>
  );
}
