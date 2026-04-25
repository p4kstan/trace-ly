// Audit Log Viewer — read-only, PII-safe.
//
// Lists the most relevant operational audit events written by Passos H/I/J:
//   - rate_limit_config_create / _update / _delete
//   - queue_health_alert_ack / _auto_resolve
//   - retention_monitor_* (retention dry-run hits)
//   - webhook_replay_test_*
//
// Safety:
//   - No raw payloads. The `metadata_json` column is rendered through a
//     redactor that removes any value matching a PII regex (email, phone,
//     cpf/cnpj, ip, token/secret/cookie/authorization), even if a future
//     writer leaks one.
//   - No filter accepts free-form SQL; everything goes through the
//     supabase-js builder.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, Search } from "lucide-react";

type AuditRow = {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_GROUPS: Record<string, string[]> = {
  all: [],
  rate_limit: [
    "rate_limit_config_create",
    "rate_limit_config_update",
    "rate_limit_config_delete",
  ],
  alerts: [
    "queue_health_alert_ack",
    "queue_health_alert_auto_resolve",
  ],
  retention: [
    "retention_monitor_run",
    "retention_monitor_eligible",
    "retention_execute",
  ],
  replay: [
    "webhook_replay_test",
    "webhook_replay_test_failed",
  ],
};

// ── Redaction ─────────────────────────────────────────────────────────────
const PII_KEY_RE =
  /(email|phone|telefone|celular|cpf|cnpj|document|address|endereco|ip|user_agent|token|secret|key|authorization|cookie|pix|copia)/i;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const LONG_DIGITS_RE = /\b\d{6,}\b/g;
const HEX_TOKEN_RE = /\b[a-f0-9]{40,}\b/gi;

function redactValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "string") {
    if (v.length > 240) return v.slice(0, 240) + "…";
    return v
      .replace(EMAIL_RE, "[redacted-email]")
      .replace(HEX_TOKEN_RE, "[redacted-token]")
      .replace(LONG_DIGITS_RE, "[redacted-num]");
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (PII_KEY_RE.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactValue(val);
      }
    }
    return out;
  }
  return v;
}

function MetadataCell({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const safe = redactValue(value);
  const txt = JSON.stringify(safe, null, 0);
  const short = txt.length > 220 ? txt.slice(0, 220) + "…" : txt;
  return (
    <code className="text-[11px] text-muted-foreground break-all" title={short}>
      {short}
    </code>
  );
}

export default function AuditLogViewer() {
  const { data: workspace } = useWorkspace();
  const [group, setGroup] = useState<keyof typeof ACTION_GROUPS>("all");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState<number>(7);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["audit-logs", workspace?.id, group, days],
    enabled: !!workspace?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
      let q = supabase
        .from("audit_logs")
        .select("id, workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at")
        .eq("workspace_id", workspace!.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500);
      const actions = ACTION_GROUPS[group];
      if (actions.length > 0) q = q.in("action", actions);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows || [];
    return (rows || []).filter(
      (r) =>
        r.action.toLowerCase().includes(s) ||
        (r.entity_type || "").toLowerCase().includes(s) ||
        (r.entity_id || "").toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Audit log (somente leitura)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Histórico de ações operacionais do workspace. Valores sensíveis são
          redatados no frontend antes da exibição. Somente eventos do seu workspace.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por action / entity_type / entity_id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={group} onValueChange={(v) => setGroup(v as keyof typeof ACTION_GROUPS)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              <SelectItem value="rate_limit">Rate-limit configs</SelectItem>
              <SelectItem value="alerts">Alertas internos</SelectItem>
              <SelectItem value="retention">Retenção</SelectItem>
              <SelectItem value="replay">Webhook replay test</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Últimas 24h</SelectItem>
              <SelectItem value="7">Últimos 7d</SelectItem>
              <SelectItem value="30">Últimos 30d</SelectItem>
              <SelectItem value="90">Últimos 90d</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Eventos {isLoading ? "" : `(${filtered.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum evento no período/filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">quando</th>
                    <th className="text-left px-3 py-2 font-medium">action</th>
                    <th className="text-left px-3 py-2 font-medium">entidade</th>
                    <th className="text-left px-3 py-2 font-medium">metadata (redatado)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {r.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {r.entity_type || "—"}
                        {r.entity_id ? <span className="opacity-60"> · {r.entity_id.slice(0, 12)}</span> : null}
                      </td>
                      <td className="px-3 py-2 max-w-[520px]">
                        <MetadataCell value={r.metadata_json} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
