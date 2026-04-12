import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, Check, Plus, Trash2, Shield, Activity, Zap, Clock, AlertCircle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copiado!");
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function McpIntegration() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", permissions: "read", expires: "30" });

  const { data: tokens, isLoading } = useQuery({
    queryKey: ["mcp_tokens", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data } = await supabase
        .from("mcp_tokens" as any)
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!workspace?.id,
  });

  const { data: logs } = useQuery({
    queryKey: ["mcp_logs", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data } = await supabase
        .from("mcp_logs" as any)
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as any[];
    },
    enabled: !!workspace?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!workspace?.id) throw new Error("No workspace");
      const session = await supabase.auth.getSession();
      const jwt = session.data.session?.access_token;
      if (!jwt) throw new Error("Not authenticated");

      const permMap: Record<string, string[]> = {
        read: ["read"],
        analyze: ["read", "analyze"],
        admin: ["read", "write", "analyze", "optimize", "admin"],
      };

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/mcp/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          workspace_id: workspace.id,
          name: form.name || "MCP Token",
          permissions: permMap[form.permissions] || ["read"],
          expires_in_days: form.expires === "never" ? undefined : Number(form.expires),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Failed to create token");
      }
      return resp.json();
    },
    onSuccess: (data) => {
      setNewToken(data.token);
      queryClient.invalidateQueries({ queryKey: ["mcp_tokens"] });
      toast.success("Token MCP gerado com sucesso!");
    },
    onError: (e) => toast.error(String(e)),
  });

  const revokeMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const session = await supabase.auth.getSession();
      const jwt = session.data.session?.access_token;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/mcp/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ token_id: tokenId }),
      });
      if (!resp.ok) throw new Error("Failed to revoke");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp_tokens"] });
      toast.success("Token revogado");
    },
  });

  const activeTokens = (tokens || []).filter((t: any) => !t.revoked);
  const mcpEndpoint = `${SUPABASE_URL}/functions/v1/mcp`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integração MCP</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Model Context Protocol — Conecte IA ao seu workspace
          </p>
        </div>
        <Button onClick={() => { setDialogOpen(true); setNewToken(null); }} className="gap-2">
          <Plus className="w-4 h-4" /> Gerar Token MCP
        </Button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{activeTokens.length}</p>
              <p className="text-xs text-muted-foreground">Tokens Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {activeTokens.length > 0 ? "Conectado" : "Desconectado"}
              </p>
              <p className="text-xs text-muted-foreground">Status</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">10</p>
              <p className="text-xs text-muted-foreground">Tools Disponíveis</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{(logs || []).length}</p>
              <p className="text-xs text-muted-foreground">Chamadas Recentes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Endpoint info */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Endpoint MCP</CardTitle>
          <CardDescription>Use este endpoint para conectar sua IA ao CapiTrack</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 rounded-lg p-3 flex items-center gap-2">
            <code className="text-xs text-foreground/80 flex-1 truncate">{mcpEndpoint}</code>
            <CopyBtn text={mcpEndpoint} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="tokens">
        <TabsList>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="space-y-3 mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (tokens || []).length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-foreground font-medium">Nenhum token MCP</p>
                <p className="text-sm text-muted-foreground mt-1">Gere um token para conectar IA ao workspace</p>
              </CardContent>
            </Card>
          ) : (
            (tokens || []).map((t: any) => (
              <Card key={t.id} className="glass-card">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className={`w-5 h-5 ${t.revoked ? "text-muted-foreground" : "text-primary"}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-xs text-muted-foreground">
                          {t.token?.substring(0, 16)}...
                        </code>
                        {!t.revoked && <CopyBtn text={t.token} />}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {(t.permissions || []).map((p: string) => (
                        <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                    <Badge variant={t.revoked ? "destructive" : "default"} className="text-[10px]">
                      {t.revoked ? "Revogado" : "Ativo"}
                    </Badge>
                    {!t.revoked && (
                      <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(t.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { name: "analytics.get_events", desc: "Eventos recentes", icon: "📊" },
              { name: "analytics.get_conversions", desc: "Conversões e receita", icon: "💰" },
              { name: "tracking.get_sessions", desc: "Sessões ativas", icon: "👤" },
              { name: "tracking.get_pixels", desc: "Pixels configurados", icon: "📡" },
              { name: "system.get_logs", desc: "Logs do sistema", icon: "📋" },
              { name: "system.get_errors", desc: "Erros e falhas", icon: "⚠️" },
              { name: "system.get_performance", desc: "Métricas de performance", icon: "⚡" },
              { name: "workspace.get_settings", desc: "Configurações", icon: "⚙️" },
              { name: "queue.get_status", desc: "Status da fila", icon: "📬" },
              { name: "deliveries.get_failed", desc: "Entregas com falha", icon: "❌" },
            ].map((tool) => (
              <Card key={tool.name} className="glass-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-xl">{tool.icon}</span>
                  <div>
                    <code className="text-xs font-medium text-foreground">{tool.name}</code>
                    <p className="text-xs text-muted-foreground">{tool.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          {(logs || []).length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <Activity className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-foreground font-medium">Nenhuma chamada MCP registrada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(logs || []).map((log: any) => (
                <Card key={log.id} className="glass-card">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant={log.status === "success" ? "default" : "destructive"} className="text-[10px]">
                        {log.status}
                      </Badge>
                      <code className="text-xs text-foreground">{log.tool}</code>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{log.duration_ms}ms</span>
                      <span>{new Date(log.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{newToken ? "Token Gerado" : "Gerar Token MCP"}</DialogTitle>
          </DialogHeader>

          {newToken ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200">
                  Copie este token agora. Ele não será exibido novamente.
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <code className="text-xs text-foreground break-all">{newToken}</code>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => {
                  navigator.clipboard.writeText(newToken);
                  toast.success("Token copiado!");
                }}>
                  <Copy className="w-4 h-4" /> Copiar Token
                </Button>
                <Button onClick={() => setDialogOpen(false)} className="flex-1">Fechar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  placeholder="Ex: Cloudo AI Production"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Permissões</Label>
                <Select value={form.permissions} onValueChange={(v) => setForm((f) => ({ ...f, permissions: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Leitura (read)</SelectItem>
                    <SelectItem value="analyze">Análise (read + analyze)</SelectItem>
                    <SelectItem value="admin">Admin (full access)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expiração</Label>
                <Select value={form.expires} onValueChange={(v) => setForm((f) => ({ ...f, expires: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="90">90 dias</SelectItem>
                    <SelectItem value="365">1 ano</SelectItem>
                    <SelectItem value="never">Sem expiração</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Gerando..." : "Gerar Token"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
