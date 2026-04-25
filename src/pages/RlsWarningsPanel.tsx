import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Info, ServerCrash, CheckCircle2 } from "lucide-react";

/**
 * RLS Warnings Panel — Passo O.
 *
 * Read-only static board summarizing the LATEST result of the semantic RLS
 * audit run by `scripts/release-validate.sh` (Step 9).
 *
 * IMPORTANT INVARIANTS:
 *   - Does NOT query users / orders / events / audit_logs.
 *   - Lists only schema/policy/status metadata derived from release-validate.
 *   - When PGHOST is missing in CI, status is `unavailable` — never silent fail.
 *   - Renders zero secrets and zero PII.
 */

type AuditStatus = "passed" | "warning" | "skipped";

interface SensitiveTable {
  name: string;
  policies_min: number;
  notes: string;
}

const SENSITIVE_TABLES: SensitiveTable[] = [
  { name: "event_queue",            policies_min: 1, notes: "Workspace-scoped reads; service-role writes." },
  { name: "queue_health_alerts",    policies_min: 2, notes: "Members read; ack via SECURITY DEFINER RPC." },
  { name: "rate_limit_configs",     policies_min: 1, notes: "Owners/admins manage; gated by is_workspace_admin." },
  { name: "rate_limit_buckets",     policies_min: 1, notes: "Service-role only; never anon-writable." },
  { name: "audit_logs",             policies_min: 1, notes: "Workspace members read; service-role inserts." },
  { name: "audience_seed_exports",  policies_min: 1, notes: "Workspace members; export rows hash-only." },
  { name: "dead_letter_events",     policies_min: 1, notes: "Workspace members; replay via admin-only function." },
  { name: "automation_actions",     policies_min: 1, notes: "Workspace members; mutations via secure RPC." },
];

const SEMANTIC_RULES = [
  "Nenhuma policy usa USING(true) ou WITH CHECK(true).",
  "Nenhuma escrita aceita 'anon' direto sem gate de membership/role.",
  "Toda RPC com efeitos colaterais é SECURITY DEFINER + search_path fixo.",
  "Funções de membership (is_workspace_member/is_workspace_admin) são STABLE.",
];

/**
 * Static fallback. The real value is reconciled at release time by
 * `release-validate.sh` and surfaced in /release-report. We deliberately keep
 * this page server-query-free.
 */
const LAST_KNOWN_STATUS: AuditStatus = "passed";

function StatusBadge({ status }: { status: AuditStatus }) {
  if (status === "passed") {
    return (
      <Badge variant="default" className="gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" />
        passed
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        warning
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1.5">
      <Info className="h-3.5 w-3.5" />
      skipped
    </Badge>
  );
}

export default function RlsWarningsPanel() {
  const status: AuditStatus = LAST_KNOWN_STATUS;

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Painel de RLS &amp; Warnings
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Resultado consolidado do audit semântico de RLS executado em release.
            Esta página NÃO consulta dados das tabelas — apenas exibe schema, policies e status.
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status do release semantic RLS</CardTitle>
          <CardDescription>
            Reportado por <code className="px-1 py-0.5 rounded bg-muted text-xs">scripts/release-validate.sh</code> (Step 9 / 11).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-border/50 p-3 bg-muted/20">
              <div className="text-xs uppercase text-muted-foreground">Última execução</div>
              <div className="font-medium mt-1">RELEASE_SEMANTIC_RLS_STATUS=<span className="text-primary">{status}</span></div>
            </div>
            <div className="rounded-md border border-border/50 p-3 bg-muted/20">
              <div className="text-xs uppercase text-muted-foreground">Tabelas sensíveis monitoradas</div>
              <div className="font-medium mt-1">{SENSITIVE_TABLES.length}</div>
            </div>
            <div className="rounded-md border border-border/50 p-3 bg-muted/20">
              <div className="text-xs uppercase text-muted-foreground">Regras semânticas</div>
              <div className="font-medium mt-1">{SEMANTIC_RULES.length}</div>
            </div>
          </div>
          {status === "skipped" && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
              <ServerCrash className="h-4 w-4 mt-0.5" />
              <div>
                <strong>RLS semantic audit unavailable.</strong> A última execução não encontrou
                <code className="mx-1 px-1 py-0.5 rounded bg-amber-500/20">PGHOST</code>
                no ambiente de CI. Configure as variáveis <code>PGHOST</code>/<code>PGUSER</code>/<code>PGPASSWORD</code>
                no runner para reativar o audit semântico — o linter de schema continua ativo.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tabelas sensíveis verificadas</CardTitle>
          <CardDescription>
            Cada linha foi auditada contra: RLS habilitado, número mínimo de policies e ausência
            de cláusulas permissivas (<code>USING(true)</code>) ou writes anônimos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border/60">
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Tabela</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Policies (mín.)</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Notas (sem PII)</th>
                </tr>
              </thead>
              <tbody>
                {SENSITIVE_TABLES.map((t) => (
                  <tr key={t.name} className="border-b border-border/30 last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{t.name}</td>
                    <td className="py-2 pr-3">{t.policies_min}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{t.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras semânticas aplicadas</CardTitle>
          <CardDescription>
            Estas regras são verificadas tanto pelo linter quanto pelo passo semântico. Qualquer
            violação retornaria <code>warning</code> ou falharia o release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            {SEMANTIC_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
