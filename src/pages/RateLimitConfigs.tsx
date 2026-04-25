// Rate-limit configs admin — workspace members only.
// View and edit per-route rate-limit policy (window_seconds, max_hits, fail_closed).
//
// Safety:
//   - Never displays IP, IP hash, or any user identifier.
//   - Shows only route, window, max hits, fail-closed flag, and notes.
//   - Workspace-scoped rows are editable; global defaults (workspace_id IS NULL)
//     appear read-only.
//   - Inputs validated client-side; DB CHECK constraints enforce 10–3600s
//     and 1–10000 hits as a server-side safety net.
//   - All writes flow through RLS + trigger `audit_rate_limit_configs`,
//     which records changes in `audit_logs` without PII.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { useWorkspaceRole, canEditRateLimitConfigs } from "@/hooks/use-workspace-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Lock, Plus, ShieldAlert, Trash2 } from "lucide-react";

type ConfigRow = {
  id: string;
  workspace_id: string | null;
  route: string;
  window_seconds: number;
  max_hits: number;
  fail_closed: boolean;
  notes: string | null;
};

const WINDOW_MIN = 10;
const WINDOW_MAX = 3600;
const HITS_MIN = 1;
const HITS_MAX = 10_000;

function validBounds(window_seconds: number, max_hits: number): string | null {
  if (!Number.isFinite(window_seconds) || window_seconds < WINDOW_MIN || window_seconds > WINDOW_MAX) {
    return `window_seconds deve estar entre ${WINDOW_MIN} e ${WINDOW_MAX}.`;
  }
  if (!Number.isFinite(max_hits) || max_hits < HITS_MIN || max_hits > HITS_MAX) {
    return `max_hits deve estar entre ${HITS_MIN} e ${HITS_MAX}.`;
  }
  return null;
}

export default function RateLimitConfigs() {
  const { data: workspace } = useWorkspace();
  const { data: role } = useWorkspaceRole(workspace?.id);
  const canEdit = canEditRateLimitConfigs(role ?? null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: configs, isLoading } = useQuery({
    queryKey: ["rate-limit-configs", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_limit_configs" as any)
        .select("id, workspace_id, route, window_seconds, max_hits, fail_closed, notes")
        .or(`workspace_id.eq.${workspace!.id},workspace_id.is.null`)
        .order("route", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ConfigRow[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (row: Partial<ConfigRow> & { id?: string }) => {
      const err = validBounds(Number(row.window_seconds), Number(row.max_hits));
      if (err) throw new Error(err);
      if (!row.route || row.route.trim().length < 2) throw new Error("route obrigatório.");

      const payload = {
        workspace_id: workspace!.id,
        route: row.route.trim(),
        window_seconds: Number(row.window_seconds),
        max_hits: Number(row.max_hits),
        fail_closed: !!row.fail_closed,
        notes: row.notes ?? null,
      };

      if (row.id) {
        const { error } = await supabase
          .from("rate_limit_configs" as any)
          .update(payload)
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("rate_limit_configs" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-limit-configs"] });
      toast({ title: "Configuração salva", description: "Política de rate-limit atualizada." });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_limit_configs" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-limit-configs"] });
      toast({ title: "Configuração removida" });
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-primary" /> Rate-limit por rota
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Política persistente de requisições por rota (workspace + IP hash). O padrão é{" "}
          <b>fail-open</b> — habilite <b>fail_closed</b> apenas em rotas onde a indisponibilidade
          do bucket deve bloquear chamadas. Nenhum IP cru é exibido ou armazenado.
        </p>
      </div>

      {!canEdit && (
        <div className="border border-warning/40 bg-warning/5 text-warning rounded-lg px-4 py-3 text-xs flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Você está em modo somente-leitura. Apenas <b>owner</b> ou <b>admin</b> do workspace
          podem alterar políticas de rate-limit.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Políticas ativas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><Skeleton className="h-32 w-full" /></div>
          ) : !configs || configs.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma política específica. As Edge Functions usam os defaults internos
              (60s / 30 reqs, fail-open).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">escopo</th>
                    <th className="text-left px-3 py-2 font-medium">rota</th>
                    <th className="text-right px-3 py-2 font-medium">janela (s)</th>
                    <th className="text-right px-3 py-2 font-medium">max reqs</th>
                    <th className="text-center px-3 py-2 font-medium">fail-closed</th>
                    <th className="text-right px-3 py-2 font-medium">ações</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => (
                    <ConfigRowEditor
                      key={c.id}
                      row={c}
                      canEdit={canEdit}
                      onSave={(updated) => upsertMutation.mutate(updated)}
                      onDelete={() => deleteMutation.mutate(c.id)}
                      saving={upsertMutation.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <NewConfigForm
          onCreate={(row) => upsertMutation.mutate(row)}
          saving={upsertMutation.isPending}
        />
      )}
    </div>
  );
}

function ConfigRowEditor({
  row, canEdit, onSave, onDelete, saving,
}: {
  row: ConfigRow;
  canEdit: boolean;
  onSave: (r: Partial<ConfigRow> & { id?: string }) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const isGlobal = row.workspace_id === null;
  const locked = isGlobal || !canEdit;
  const [windowS, setWindowS] = useState(row.window_seconds);
  const [maxHits, setMaxHits] = useState(row.max_hits);
  const [failClosed, setFailClosed] = useState(row.fail_closed);
  const dirty =
    windowS !== row.window_seconds ||
    maxHits !== row.max_hits ||
    failClosed !== row.fail_closed;

  return (
    <tr className="border-t border-border/40">
      <td className="px-3 py-2">
        {isGlobal ? (
          <Badge variant="outline" className="text-xs gap-1">
            <Lock className="w-3 h-3" /> global
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">workspace</Badge>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{row.route}</td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          min={WINDOW_MIN}
          max={WINDOW_MAX}
          value={windowS}
          disabled={isGlobal}
          onChange={(e) => setWindowS(Number(e.target.value))}
          className="w-24 h-8 ml-auto text-right"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          min={HITS_MIN}
          max={HITS_MAX}
          value={maxHits}
          disabled={isGlobal}
          onChange={(e) => setMaxHits(Number(e.target.value))}
          className="w-28 h-8 ml-auto text-right"
        />
      </td>
      <td className="px-3 py-2 text-center">
        <Switch
          checked={failClosed}
          disabled={isGlobal}
          onCheckedChange={setFailClosed}
        />
      </td>
      <td className="px-3 py-2 text-right space-x-2">
        {!isGlobal && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => onSave({ id: row.id, route: row.route, window_seconds: windowS, max_hits: maxHits, fail_closed: failClosed })}
            >
              salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}

function NewConfigForm({
  onCreate, saving,
}: {
  onCreate: (row: Partial<ConfigRow>) => void;
  saving: boolean;
}) {
  const [route, setRoute] = useState("");
  const [windowS, setWindowS] = useState(60);
  const [maxHits, setMaxHits] = useState(30);
  const [failClosed, setFailClosed] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova política
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">rota (Edge Function)</label>
          <Input
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="ex: webhook-replay-test"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">janela (s)</label>
          <Input type="number" min={WINDOW_MIN} max={WINDOW_MAX} value={windowS} onChange={(e) => setWindowS(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">max reqs</label>
          <Input type="number" min={HITS_MIN} max={HITS_MAX} value={maxHits} onChange={(e) => setMaxHits(Number(e.target.value))} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <label className="text-xs text-muted-foreground block">fail-closed</label>
            <Switch checked={failClosed} onCheckedChange={setFailClosed} />
          </div>
          <Button
            disabled={saving || route.trim().length < 2}
            onClick={() => {
              onCreate({ route, window_seconds: windowS, max_hits: maxHits, fail_closed: failClosed });
              setRoute("");
            }}
          >
            criar
          </Button>
        </div>
        <p className="md:col-span-5 text-xs text-muted-foreground">
          Limites permitidos: janela {WINDOW_MIN}–{WINDOW_MAX}s, max reqs {HITS_MIN}–{HITS_MAX}.
          Alterações são auditadas em <code>audit_logs</code> sem expor PII.
        </p>
      </CardContent>
    </Card>
  );
}
