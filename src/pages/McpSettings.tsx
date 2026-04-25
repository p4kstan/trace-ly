import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useWorkspaceRole, canEditRateLimitConfigs } from "@/hooks/use-workspace-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Copy, Check, KeyRound, AlertTriangle, Trash2, Cpu, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";

const MCP_ENDPOINT = "https://xpgsipmyrwyjerjvbhmb.supabase.co/functions/v1/traffic-agent-mcp";

const ALL_SCOPES: { id: string; label: string; default: boolean }[] = [
  { id: "traffic-agent:read", label: "Ler métricas e diagnósticos", default: true },
  { id: "traffic-agent:evaluate", label: "Gerar planos / recomendações", default: true },
  { id: "traffic-agent:simulate", label: "Simular ações (guardrails)", default: true },
  { id: "traffic-agent:dry_run", label: "Registrar ações em dry-run", default: true },
  { id: "rag:read", label: "Pesquisar base de conhecimento", default: true },
  { id: "rag:write", label: "Indexar documentos no RAG", default: false },
];

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string | null;
  owner_user_id: string;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        const ok = await copyToClipboard(value);
        if (ok) {
          setCopied(true);
          toast.success(label ? `${label} copiado` : "Copiado");
          setTimeout(() => setCopied(false), 1500);
        } else {
          toast.error("Falha ao copiar — selecione e use Ctrl+C");
        }
      }}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </Button>
  );
}

function StatusBadge({ row }: { row: TokenRow }) {
  if (row.revoked_at) return <Badge variant="destructive">Revogado</Badge>;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return <Badge variant="secondary">Expirado</Badge>;
  }
  return <Badge variant="default">Ativo</Badge>;
}

export default function McpSettings() {
  const { data: workspace, isLoading: wsLoading } = useWorkspace();
  const { data: role } = useWorkspaceRole(workspace?.id);
  const isAdmin = canEditRateLimitConfigs(role ?? null);

  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceRow[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);

  // Create-token form
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(ALL_SCOPES.filter((s) => s.default).map((s) => s.id));
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Load workspaces (every workspace the user is member of).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("id, name, slug, owner_user_id")
          .order("created_at", { ascending: true });
        if (!cancelled) {
          if (error) throw error;
          setAllWorkspaces(data ?? []);
        }
      } catch {
        if (!cancelled) setAllWorkspaces([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function loadTokens(wsId: string) {
    setTokensLoading(true);
    setTokensError(null);
    try {
      const { data, error } = await supabase.functions.invoke("mcp-token-list", {
        body: { workspace_id: wsId },
      });
      if (error) throw error;
      setTokens((data as any)?.tokens ?? []);
    } catch (e: any) {
      setTokensError(e?.message ?? "Falha ao carregar tokens");
      setTokens([]);
    } finally {
      setTokensLoading(false);
    }
  }

  useEffect(() => {
    if (workspace?.id) loadTokens(workspace.id);
  }, [workspace?.id]);

  const codexCommand = useMemo(() => {
    const wsId = workspace?.id ?? "<workspace_id>";
    return `powershell -ExecutionPolicy Bypass -File C:\\Users\\Admin\\plugins\\capitrack-agent\\scripts\\configure.ps1 -AuthToken "SEU_TOKEN_MCP" -WorkspaceId "${wsId}"`;
  }, [workspace?.id]);

  function toggleScope(id: string) {
    setScopes((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleCreateToken() {
    if (!workspace?.id) return;
    if (!name.trim()) {
      toast.error("Informe um nome para o token");
      return;
    }
    if (scopes.length === 0) {
      toast.error("Selecione ao menos um escopo");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("mcp-token-create", {
        body: {
          workspace_id: workspace.id,
          name: name.trim(),
          scopes,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      });
      if (error) throw error;
      const token = (data as any)?.token;
      if (!token) throw new Error("Resposta inválida");
      setCreatedToken(token);
      setConfirmOpen(false);
      setCreateOpen(false);
      setName("");
      setScopes(ALL_SCOPES.filter((s) => s.default).map((s) => s.id));
      setExpiresAt("");
      await loadTokens(workspace.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    if (!workspace?.id) return;
    setRevokingId(tokenId);
    try {
      const { error } = await supabase.functions.invoke("mcp-token-revoke", {
        body: { token_id: tokenId },
      });
      if (error) throw error;
      toast.success("Token revogado");
      await loadTokens(workspace.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao revogar");
    } finally {
      setRevokingId(null);
    }
  }

  if (wsLoading) {
    return (
      <div className="space-y-6 animate-fade-in max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl min-w-0">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Cpu className="w-6 h-6 text-primary" />
          MCP &amp; Codex
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure o agente Codex para conectar via MCP ao seu workspace.
        </p>
      </div>

      {/* Workspace atual */}
      <section className="glass-card p-5 space-y-4 min-w-0">
        <h2 className="font-semibold text-foreground">Workspace atual</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <p className="text-sm font-medium text-foreground break-anywhere">{workspace?.name}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Workspace ID</Label>
            <div className="flex items-start gap-2 mt-1 min-w-0">
              <code className="flex-1 min-w-0 px-3 py-2 rounded-md bg-muted text-xs font-mono break-all">
                {workspace?.id}
              </code>
              {workspace?.id && <CopyButton value={workspace.id} label="Workspace ID" />}
            </div>
          </div>
        </div>
      </section>

      {/* Endpoint MCP */}
      <section className="glass-card p-5 space-y-3 min-w-0">
        <h2 className="font-semibold text-foreground">Endpoint MCP</h2>
        <p className="text-xs text-muted-foreground">
          Use este endpoint como <code>CAPITRACK_MCP_URL</code>.
        </p>
        <div className="flex items-start gap-2 min-w-0">
          <code className="flex-1 min-w-0 px-3 py-2 rounded-md bg-muted text-xs font-mono break-all">
            {MCP_ENDPOINT}
          </code>
          <CopyButton value={MCP_ENDPOINT} label="Endpoint" />
        </div>
      </section>

      {/* Configurar Codex */}
      <section className="glass-card p-5 space-y-3 min-w-0">
        <h2 className="font-semibold text-foreground">Configurar Codex (PowerShell)</h2>
        <p className="text-xs text-muted-foreground">
          Substitua <code>SEU_TOKEN_MCP</code> pelo token gerado abaixo.
        </p>
        <div className="flex items-start gap-2 min-w-0">
          <pre className="flex-1 min-w-0 px-3 py-2 rounded-md bg-muted text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-40">
{codexCommand}
          </pre>
          <CopyButton value={codexCommand} label="Comando" />
        </div>
      </section>

      {/* Tokens MCP */}
      <section className="glass-card p-5 space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" /> Tokens MCP
            </h2>
            <p className="text-xs text-muted-foreground">
              Cada token concede acesso persistente ao agente. Apenas admins podem criar/revogar.
            </p>
          </div>
          <Button
            size="sm"
            disabled={!isAdmin}
            onClick={() => setCreateOpen(true)}
          >
            Criar token
          </Button>
        </div>

        {!isAdmin && (
          <p className="text-xs text-muted-foreground border border-border/40 bg-muted/30 rounded-md p-2">
            Você precisa ser admin/owner do workspace para criar ou revogar tokens.
          </p>
        )}

        {tokensError && (
          <p className="text-xs text-destructive">{tokensError}</p>
        )}

        {tokensLoading ? (
          <Skeleton className="h-24 rounded-md" />
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum token criado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/40">
                  <th className="text-left py-2 pr-3 font-medium">Nome</th>
                  <th className="text-left py-2 pr-3 font-medium">Prefixo</th>
                  <th className="text-left py-2 pr-3 font-medium">Status</th>
                  <th className="text-left py-2 pr-3 font-medium">Último uso</th>
                  <th className="text-left py-2 pr-3 font-medium">Expira</th>
                  <th className="text-right py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} className="border-b border-border/20">
                    <td className="py-2 pr-3 break-anywhere">{t.name}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{t.token_prefix}…</td>
                    <td className="py-2 pr-3"><StatusBadge row={t} /></td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {t.expires_at ? new Date(t.expires_at).toLocaleDateString() : "Nunca"}
                    </td>
                    <td className="py-2 text-right">
                      {!t.revoked_at && isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={revokingId === t.id}
                          onClick={() => handleRevoke(t.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Revogar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Todos os workspaces */}
      <section className="glass-card p-5 space-y-3 min-w-0">
        <h2 className="font-semibold text-foreground">Todos os workspaces</h2>
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border/40">
                <th className="text-left py-2 pr-3 font-medium">Nome</th>
                <th className="text-left py-2 pr-3 font-medium">ID</th>
                <th className="text-right py-2 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {allWorkspaces.map((w) => (
                <tr key={w.id} className="border-b border-border/20">
                  <td className="py-2 pr-3 break-anywhere">{w.name}</td>
                  <td className="py-2 pr-3 font-mono text-xs break-all">{w.id}</td>
                  <td className="py-2 text-right">
                    <CopyButton value={w.id} label="ID" />
                  </td>
                </tr>
              ))}
              {allWorkspaces.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-sm text-muted-foreground">
                    Nenhum workspace acessível.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create token dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Novo token MCP
            </DialogTitle>
            <DialogDescription>
              Concede acesso persistente ao agente Codex. Token nunca permite mutação real.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tname">Nome</Label>
              <Input
                id="tname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Codex local"
                maxLength={80}
              />
            </div>
            <div>
              <Label>Escopos</Label>
              <div className="space-y-2 mt-2">
                {ALL_SCOPES.map((s) => (
                  <label key={s.id} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={scopes.includes(s.id)}
                      onCheckedChange={() => toggleScope(s.id)}
                    />
                    <span className="leading-tight">
                      <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
                      <br />
                      <span className="text-xs">{s.label}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="texp">Expira em (opcional)</Label>
              <Input
                id="texp"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={creating || !name.trim()}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" /> Confirmar criação
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este token concederá acesso persistente ao agente Codex no workspace
              <strong> {workspace?.name}</strong>. Você poderá revogá-lo a qualquer momento.
              O token completo será exibido apenas uma vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateToken} disabled={creating}>
              {creating ? "Criando..." : "Criar token"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Token reveal modal */}
      <Dialog open={!!createdToken} onOpenChange={(o) => !o && setCreatedToken(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> Token criado
            </DialogTitle>
            <DialogDescription>
              Copie agora. Por segurança, ele <strong>não será mostrado novamente</strong>.
            </DialogDescription>
          </DialogHeader>
          {createdToken && (
            <div className="space-y-3 min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <code className="flex-1 min-w-0 px-3 py-2 rounded-md bg-muted text-xs font-mono break-all">
                  {createdToken}
                </code>
                <CopyButton value={createdToken} label="Token" />
              </div>
              <p className="text-xs text-muted-foreground border border-warning/30 bg-warning/5 rounded-md p-2">
                Salve em um cofre seguro. Use como <code>CAPITRACK_AUTH_TOKEN</code> no Codex.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedToken(null)}>Já copiei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
