import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ShieldCheck, Lock, Eye, FileText, Database } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * PII Release Report — Passo L.
 *
 * Read-only audit summary of every PII / privacy control wired into the
 * platform. This page DOES NOT query user data and DOES NOT display secrets.
 * It exists so a workspace owner / auditor can verify, in one place, that
 * the platform's PII guarantees are in effect.
 *
 * Each row links to the underlying enforcement (page, edge function, or
 * release-validate check) for traceability.
 */

type Status = "enforced" | "partial" | "manual";

interface CheckRow {
  id: string;
  area: "logging" | "export" | "audit" | "rate_limit" | "secrets" | "consent";
  title: string;
  description: string;
  status: Status;
  enforcedBy: string;
  link?: { to: string; label: string };
}

const CHECKS: CheckRow[] = [
  {
    id: "safe-logger",
    area: "logging",
    title: "Logs sanitizados em todas as Edge Functions críticas",
    description:
      "createSafeLogger / installSafeConsole redige email, phone, CPF/CNPJ, JWT, Bearer, cookie, api_key e Pix EMV antes de qualquer console.log.",
    status: "enforced",
    enforcedBy: "supabase/functions/_shared/safe-logger.ts (+ release-validate scanner)",
  },
  {
    id: "rate-limit-no-ip",
    area: "rate_limit",
    title: "Rate-limit nunca persiste IP cru",
    description:
      "O helper compartilhado faz SHA-256 do IP antes da chamada RPC; tabela rate_limit_buckets só armazena ip_hash.",
    status: "enforced",
    enforcedBy: "supabase/functions/_shared/rate-limit.ts (+ release-validate 4g/7)",
    link: { to: "/rate-limit-configs", label: "Ver configurações" },
  },
  {
    id: "rate-limit-bounds",
    area: "rate_limit",
    title: "Bounds de configuração validados no servidor",
    description:
      "RPC upsert_rate_limit_config rejeita window_seconds fora de 10–3600 e max_hits fora de 1–10000. UI espelha os mesmos limites.",
    status: "enforced",
    enforcedBy: "public.upsert_rate_limit_config (+ src/pages/RateLimitConfigs.tsx)",
  },
  {
    id: "audience-export",
    area: "export",
    title: "Export de audiência é hash-only com consentimento por padrão",
    description:
      "audience-seed-export aceita apenas SHA-256 hex; require_consent default = true; dry_run retorna só contagens; auditado em audience_seed_exports sem PII.",
    status: "enforced",
    enforcedBy: "supabase/functions/audience-seed-export/index.ts (+ contract.test.ts)",
  },
  {
    id: "audit-viewer-redaction",
    area: "audit",
    title: "AuditLogViewer redige metadata antes do DOM",
    description:
      "redactValue mascara emails, JWTs, hex tokens, dígitos longos e chaves PII (email/phone/cpf/cnpj/ip/cookie/token).",
    status: "enforced",
    enforcedBy: "src/pages/AuditLogViewer.tsx (+ AuditLogViewer.test.ts)",
    link: { to: "/audit-logs", label: "Ver Audit Log" },
  },
  {
    id: "alerts-no-pii",
    area: "audit",
    title: "Alertas internos e auto-resolve sem PII",
    description:
      "queue_health_alerts e auto_resolve_queue_health_alerts gravam apenas provider/destination/alert_type/count/reason — nunca dados de usuário.",
    status: "enforced",
    enforcedBy: "public.auto_resolve_queue_health_alerts (+ auto-resolve.test.ts)",
    link: { to: "/retry-observability", label: "Ver SLA / alertas" },
  },
  {
    id: "cron-secret",
    area: "secrets",
    title: "Segredo de cron nunca exposto no frontend ou em RPCs",
    description:
      "retention_cron_status retorna apenas booleano cron_secret_configured. Frontend só lê esse boolean. release-validate bloqueia regressões.",
    status: "enforced",
    enforcedBy: "public.retention_cron_status (+ release-validate 4i/7)",
    link: { to: "/retry-observability", label: "Ver diagnóstico cron" },
  },
  {
    id: "retention-monitor",
    area: "secrets",
    title: "Retention executa apenas como monitor (dry-run) por cron",
    description:
      "retention-job default = dryRun. Execução destrutiva real é manual e protegida por X-Cron-Secret. release-validate bloqueia execute=1 em cron.",
    status: "manual",
    enforcedBy: "supabase/functions/retention-job/index.ts (+ release-validate 4j/7)",
  },
  {
    id: "rls-critical",
    area: "audit",
    title: "RLS habilitado e auditado em tabelas críticas",
    description:
      "Auditoria de release verifica RLS + ≥1 policy em event_queue, queue_health_alerts, rate_limit_configs, audit_logs, audience_seed_exports, dead_letter_events.",
    status: "enforced",
    enforcedBy: "scripts/release-validate.sh §8a",
  },
  {
    id: "consent-defaults",
    area: "consent",
    title: "Consent-by-default em export e Customer Match",
    description:
      "Export real exige ads_consent_granted=true. Endpoints CAPI/Customer Match validam consentimento por linha.",
    status: "enforced",
    enforcedBy: "supabase/functions/audience-seed-export/index.ts",
  },
];

const STATUS_META: Record<Status, { label: string; className: string }> = {
  enforced: { label: "Enforced", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  partial: { label: "Parcial", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  manual: { label: "Manual", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
};

const AREA_ICON: Record<CheckRow["area"], React.ComponentType<{ className?: string }>> = {
  logging: FileText,
  export: Database,
  audit: Eye,
  rate_limit: ShieldCheck,
  secrets: Lock,
  consent: CheckCircle2,
};

const AREA_LABEL: Record<CheckRow["area"], string> = {
  logging: "Logging",
  export: "Export",
  audit: "Auditoria",
  rate_limit: "Rate-limit",
  secrets: "Segredos",
  consent: "Consentimento",
};

export default function PiiReleaseReport() {
  const grouped = CHECKS.reduce<Record<string, CheckRow[]>>((acc, c) => {
    (acc[c.area] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Relatório de Release — PII & Privacidade
        </h1>
        <p className="text-sm text-muted-foreground">
          Resumo somente leitura de cada controle de PII em produção. Nenhum dado real é exibido nesta página
          e nenhum segredo é lido. Cada controle aponta para o ponto de imposição (edge function,
          RPC, página ou check do release-validate).
        </p>
      </header>

      {Object.entries(grouped).map(([area, rows]) => {
        const Icon = AREA_ICON[area as CheckRow["area"]];
        return (
          <Card key={area} className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Icon className="w-4 h-4 text-primary" />
                {AREA_LABEL[area as CheckRow["area"]]}
                <Badge variant="outline" className="ml-auto text-[10px] uppercase tracking-wider">
                  {rows.length} controle{rows.length === 1 ? "" : "s"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((row) => {
                const meta = STATUS_META[row.status];
                return (
                  <div
                    key={row.id}
                    className="rounded-lg border border-border/30 bg-background/40 p-3.5 space-y-1.5"
                  >
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-sm text-foreground flex-1">{row.title}</span>
                      <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{row.description}</p>
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <code className="text-[10px] text-muted-foreground/70 font-mono truncate">
                        {row.enforcedBy}
                      </code>
                      {row.link && (
                        <Link
                          to={row.link.to}
                          className="text-[11px] text-primary hover:underline shrink-0"
                        >
                          {row.link.label} →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <footer className="text-[11px] text-muted-foreground/60 pt-4 border-t border-border/30">
        Este relatório é gerado a partir de configurações estáticas. Para validar em runtime, rode{" "}
        <code className="font-mono">bash scripts/release-validate.sh</code>.
      </footer>
    </div>
  );
}
