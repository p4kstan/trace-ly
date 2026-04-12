import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Copy, Trash2, Webhook } from "lucide-react";
import { IntegrationDialog } from "@/components/integrations/IntegrationDialog";
import { PROVIDER_CONFIGS } from "@/lib/integration-help-config";

export default function Integrations() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["gateway_integrations", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data } = await supabase.from("gateway_integrations").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!workspace?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (form: { provider: string; name: string; credentials: string; webhookSecret: string; environment: string }) => {
      if (!workspace?.id) throw new Error("No workspace");
      const { error } = await supabase.from("gateway_integrations").insert({
        workspace_id: workspace.id,
        provider: form.provider,
        name: form.name,
        credentials_encrypted: form.credentials,
        webhook_secret_encrypted: form.webhookSecret,
        environment: form.environment,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gateway_integrations"] });
      setDialogOpen(false);
      toast.success("Integração criada com sucesso!");
    },
    onError: (e) => toast.error(String(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("gateway_integrations").update({ status: status === "active" ? "inactive" : "active" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gateway_integrations"] });
      toast.success("Status atualizado");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gateway_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gateway_integrations"] });
      toast.success("Integração removida");
    },
  });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const getWebhookUrl = (integrationId: string, provider: string) =>
    `${supabaseUrl}/functions/v1/gateway-webhook?workspace_id=${workspace?.id}&provider=${provider}&integration_id=${integrationId}`;

  const copyWebhookUrl = (integrationId: string, provider: string) => {
    navigator.clipboard.writeText(getWebhookUrl(integrationId, provider));
    toast.success("URL do webhook copiada!");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
          <p className="text-muted-foreground text-sm mt-1">Conecte gateways de pagamento e plataformas de anúncio</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Adicionar Gateway</Button>
      </div>

      {/* Ad platforms */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Plataformas de Anúncio</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: "Meta Ads", emoji: "📘", desc: "Conversions API (CAPI)", status: "active" },
            { name: "Google Ads", emoji: "🔍", desc: "Offline Conversions (em breve)", status: "soon" },
            { name: "TikTok Ads", emoji: "🎵", desc: "Events API (em breve)", status: "soon" },
          ].map(p => (
            <Card key={p.name} className="glass-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{p.emoji}</span>
                  <div>
                    <p className="font-medium text-foreground text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                </div>
                <Badge variant="outline" className={p.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}>
                  {p.status === "active" ? "Ativo" : "Em breve"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Active integrations */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Gateways Conectados ({(integrations || []).length})</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (integrations || []).length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <Webhook className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-foreground font-medium">Nenhum gateway conectado</p>
              <p className="text-sm text-muted-foreground mt-1">Adicione um gateway para receber webhooks de pagamento</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(integrations || []).map(gi => {
              const prov = PROVIDER_CONFIGS[gi.provider];
              return (
                <Card key={gi.id} className="glass-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{prov?.emoji || "🔌"}</span>
                        <div>
                          <p className="font-medium text-foreground text-sm">{gi.name}</p>
                          <p className="text-xs text-muted-foreground">{prov?.label || gi.provider} · {gi.environment}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={gi.status === "active"} onCheckedChange={() => toggleMutation.mutate({ id: gi.id, status: gi.status })} />
                        <Button variant="ghost" size="sm" onClick={() => copyWebhookUrl(gi.id, gi.provider)} title="Copiar URL do Webhook">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(gi.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2.5 flex items-center gap-2">
                      <Webhook className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <code className="text-xs text-muted-foreground truncate flex-1">{getWebhookUrl(gi.id, gi.provider)}</code>
                      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyWebhookUrl(gi.id, gi.provider)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      <IntegrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
        supabaseUrl={supabaseUrl}
        workspaceId={workspace?.id || ""}
      />
    </div>
  );
}
