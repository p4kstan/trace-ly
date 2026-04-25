/**
 * Go-Live Certification — Passo M.
 *
 * Pure data + helpers describing every check that MUST pass before flipping
 * a workspace from staging to production. Used by:
 *
 *   - /go-live-checklist (existing) → can render a high-level summary
 *   - /release-report (new) → renders the operational status board
 *   - scripts/release-validate.sh → keeps these IDs in sync with CI
 *
 * No queries, no PII. Every check has an `enforcedBy` pointer so an auditor
 * can navigate to the actual implementation.
 */

export type CheckScope = "native" | "external" | "multi-step" | "all";
export type CheckStatus = "enforced" | "manual" | "informational";

export interface CertificationCheck {
  id: string;
  scope: CheckScope;
  area:
    | "ingestion"
    | "canonical"
    | "dedup"
    | "queue-health"
    | "alerts"
    | "rls"
    | "consent"
    | "export"
    | "logs"
    | "prompts";
  title: string;
  description: string;
  enforcedBy: string;
  status: CheckStatus;
  /** Optional UI route the user can visit to verify the check. */
  link?: { to: string; label: string };
}

export const GO_LIVE_CHECKS: CertificationCheck[] = [
  {
    id: "test-mode-replay",
    scope: "all",
    area: "ingestion",
    title: "test_mode replay seguro",
    description:
      "webhook-replay-test exige owner/admin, valida bounds e nunca grava em event_deliveries reais; rate-limit DB-backed sem IP cru.",
    enforcedBy:
      "supabase/functions/webhook-replay-test/index.ts + scripts/release-validate.sh (4c)",
    status: "enforced",
    link: { to: "/canonical-audit", label: "Abrir auditoria canônica" },
  },
  {
    id: "webhook-staging",
    scope: "all",
    area: "ingestion",
    title: "Webhooks staging documentados por gateway",
    description:
      "URL canônica única `?provider=<slug>` para qualquer gateway/checkout. Nenhum hardcode de path por gateway.",
    enforcedBy:
      "src/lib/native-checkout-prompts.ts + src/lib/external-checkout-prompts.ts",
    status: "enforced",
    link: { to: "/webhook-logs", label: "Ver webhook logs" },
  },
  {
    id: "canonical-main-step",
    scope: "multi-step",
    area: "canonical",
    title: "event_id canônico principal + etapas",
    description:
      "Pedido principal usa `purchase:<root_order_code>`. Cada etapa adicional usa `purchase:<root_order_code>:step:<step_key>` herdando metadata do raiz.",
    enforcedBy:
      "supabase/functions/gateway-webhook/handlers/_canonical.ts + release-validate (7/7)",
    status: "enforced",
    link: { to: "/canonical-audit", label: "Auditoria canônica" },
  },
  {
    id: "dedup-4col",
    scope: "all",
    area: "dedup",
    title: "Dedup 4-colunas em event_deliveries",
    description:
      "UNIQUE(workspace_id, event_id, provider, destination) impede duplicação por reentrega de webhook, polling ou reconcile.",
    enforcedBy: "uq_event_queue_dedup + uq_tracked_events_dedup (release-validate 3/7)",
    status: "enforced",
  },
  {
    id: "queue-health",
    scope: "all",
    area: "queue-health",
    title: "Queue health monitor + amostragem parcial",
    description:
      "queue-health calcula backlog/falhas, sinaliza amostra parcial >5000 linhas e auto-resolve alertas quando condição limpa.",
    enforcedBy: "supabase/functions/queue-health/index.ts (4e/7 + 4i/7)",
    status: "enforced",
    link: { to: "/retry-observability", label: "Painel SLA" },
  },
  {
    id: "internal-alerts",
    scope: "all",
    area: "alerts",
    title: "Alertas internos com ack/resolved auditável",
    description:
      "queue_health_alerts: open → acknowledged → resolved. RPC com workspace gate + audit_logs sem PII.",
    enforcedBy:
      "public.acknowledge_queue_health_alert + auto_resolve_queue_health_alerts",
    status: "enforced",
    link: { to: "/retry-observability", label: "Alertas SLA" },
  },
  {
    id: "rls-critical-tables",
    scope: "all",
    area: "rls",
    title: "RLS habilitado e auditado em tabelas sensíveis",
    description:
      "event_queue, queue_health_alerts, rate_limit_configs, audit_logs, audience_seed_exports, dead_letter_events e correlatos têm RLS + policies não-permissivas.",
    enforcedBy: "scripts/release-validate.sh (8/8) + scripts/rls-semantic-audit.sh",
    status: "enforced",
  },
  {
    id: "consent-export",
    scope: "all",
    area: "consent",
    title: "Audience export exige consentimento e é hash-only",
    description:
      "audience-seed-export: dry_run retorna apenas counts, real export envia somente hashes SHA-256 com require_consent !== false.",
    enforcedBy:
      "supabase/functions/audience-seed-export/index.ts + contract.test.ts (release-validate 8b + 9d)",
    status: "enforced",
  },
  {
    id: "export-preview",
    scope: "all",
    area: "export",
    title: "Modo preview/dry-run em exports",
    description:
      "Toda rota de export oferece preview sem PII para o operador validar tamanho antes de gerar artefato real.",
    enforcedBy: "supabase/functions/audience-seed-export/index.ts (Passo K)",
    status: "enforced",
  },
  {
    id: "logs-no-pii",
    scope: "all",
    area: "logs",
    title: "Logs sanitizados em todas as Edge Functions críticas",
    description:
      "installSafeConsole + safe-logger redigem PII antes de qualquer console.log; release-validate falha se interpolação crua reaparecer.",
    enforcedBy:
      "supabase/functions/_shared/safe-logger.ts + release-validate (4b + 6/7)",
    status: "enforced",
    link: { to: "/pii-release-report", label: "Relatório PII" },
  },
  {
    id: "prompts-installable",
    scope: "all",
    area: "prompts",
    title: "Prompts nativo + externo sincronizados (Passo M+Q)",
    description:
      "Geradores incluem root_order_code/step_key, event_id canônico, test_mode, replay seguro, rate-limit, queue-health, retention dry-run, RLS, PII report, export preview/hash-only, consentimento, multi-destination, IA em recommendation com guardrails, Data Reuse Center com paginação/preview por provider/coverage por click ID/multi-destination consistency/simulador dry-run.",
    enforcedBy:
      "src/lib/native-checkout-prompts.ts + external-checkout-prompts.ts + go-live-checks.ts",
    status: "enforced",
    link: { to: "/prompt-generator", label: "Abrir gerador de prompts" },
  },
  {
    id: "data-reuse-center-q",
    scope: "all",
    area: "export",
    title: "Data Reuse Center operacional (Passo Q)",
    description:
      "Paginação configurável, preview por provider (Google Ads / GA4 / Meta / TikTok / Microsoft via msclkid) hash-only com amostras mascaradas, coverage por click ID/UTM, multi-destination consistency e simulador dry-run com guardrails (auto bloqueado por default).",
    enforcedBy:
      "src/lib/data-reuse-providers.ts + multi-destination-consistency.ts + automation-simulator.ts + src/pages/DataReuseCenter.tsx",
    status: "enforced",
    link: { to: "/data-reuse-center", label: "Abrir Data Reuse Center" },
  },
  {
    id: "destination-registry-r",
    scope: "all",
    area: "dedup",
    title: "Destination registry normalizado + RPC paginada (Passo R)",
    description:
      "Tabela `ad_conversion_destinations` com RLS (leitura por workspace, escrita só owner/admin), RPC `list_ad_conversion_destinations` sem segredos, RPC `data_reuse_summary` paginada server-side (limite 1..10000) e simulador lendo `automation_rules` reais via `simulateRule()`. Auto continua bloqueado a menos que `guardrails.auto_enabled=true`.",
    enforcedBy:
      "supabase/migrations + src/lib/ad-destination-registry.ts + src/lib/automation-rule-simulator.ts + src/pages/DataReuseCenter.tsx",
    status: "enforced",
    link: { to: "/data-reuse-center", label: "Abrir Data Reuse Center" },
  },
  {
    id: "destination-registry-admin-s",
    scope: "all",
    area: "dedup",
    title: "Registry admin UI + dispatch gate + keyset + multi-rule (Passo S)",
    description:
      "Página `/destination-registry` (role-gated owner/admin) edita `ad_conversion_destinations` com `credential_ref` mascarado. RPC `data_reuse_summary_keyset` paga via cursor `(created_at,id)` no Data Reuse Center com botão `Carregar mais`. `simulateRulesForScope` itera todas as automation_rules aplicáveis e agrupa por outcome. `decideDispatch` respeita `send_enabled`/`status`/`consent_gate_required`/`test_mode_default` por destination_id e cai em fallback compatível quando registry está vazio — sem chamadas externas reais.",
    enforcedBy:
      "src/pages/DestinationRegistry.tsx + src/lib/destination-dispatch-gate.ts + src/lib/automation-rule-simulator.ts + supabase/migrations (data_reuse_summary_keyset)",
    status: "enforced",
    link: { to: "/destination-registry", label: "Abrir Registry de destinos" },
  },
];

export interface CertificationSummary {
  total: number;
  enforced: number;
  manual: number;
  informational: number;
  byScope: Record<CheckScope, number>;
}

export function summarizeChecks(checks = GO_LIVE_CHECKS): CertificationSummary {
  const summary: CertificationSummary = {
    total: checks.length,
    enforced: 0,
    manual: 0,
    informational: 0,
    byScope: { native: 0, external: 0, "multi-step": 0, all: 0 },
  };
  for (const c of checks) {
    summary[c.status] += 1;
    summary.byScope[c.scope] += 1;
  }
  return summary;
}
