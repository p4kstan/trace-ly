import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { GO_LIVE_CHECKS, summarizeChecks } from "@/lib/go-live-checks";
import {
  GATEWAY_ADAPTER_CONTRACTS,
  type GatewayAdapterContract,
} from "@/lib/gateway-adapter-contracts";

/**
 * Operational Release Report — Passo M.
 *
 * Read-only board summarizing release status. Static by design — does NOT
 * query users / orders / event_deliveries / audit_logs. Anything that needs
 * live data is linked out to the dedicated dashboards.
 *
 * Never shows secrets or PII. Never lists raw payload bodies.
 */

const QUICK_LINKS = [
  { to: "/canonical-audit", label: "Auditoria canônica" },
  { to: "/retry-observability", label: "Retries & SLA de alertas" },
  { to: "/go-live-checklist", label: "Checklist Go-live" },
  { to: "/rate-limit-configs", label: "Rate-limit Configs" },
  { to: "/audit-logs", label: "Audit Log Viewer" },
  { to: "/pii-release-report", label: "Relatório PII" },
];

function ContractCard({ c }: { c: GatewayAdapterContract }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">{c.label}</div>
        <Badge
          variant={c.shippedHandler ? "default" : "outline"}
          className="text-[10px]"
        >
          {c.shippedHandler ? "handler nativo" : "via generic adapter"}
        </Badge>
      </div>
      <div className="text-[11px] text-muted-foreground">
        slug: <code>{c.providerSlug}</code> · escopo: <code>{c.category}</code>
      </div>
      {c.notes && (
        <div className="text-[11px] text-muted-foreground/80 italic">{c.notes}</div>
      )}
    </div>
  );
}

export default function ReleaseReport() {
  const summary = summarizeChecks();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Operational Release Report</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Visão consolidada de release: status dos controles, contratos de
          gateway, atalhos para painéis de auditoria e validações que rodam no
          CI. Nenhum dado pessoal ou segredo é exibido aqui.
        </p>
      </header>

      <Card className="bg-muted/10 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Resumo geral
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Checks totais" value={summary.total} />
            <Stat label="Enforced" value={summary.enforced} tone="ok" />
            <Stat label="Manuais" value={summary.manual} tone="warn" />
            <Stat label="Informativos" value={summary.informational} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-3">
            Última validação automática: roda em <code>scripts/release-validate.sh</code>{" "}
            (CI + dev). Para detalhes de PII, abra{" "}
            <Link className="underline" to="/pii-release-report">
              /pii-release-report
            </Link>
            .
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atalhos operacionais</CardTitle>
          <CardDescription>
            Painéis somente leitura para auditoria. Nenhum botão destrutivo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {QUICK_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md border border-border/50 bg-background hover:bg-muted/40 px-3 py-2 text-sm flex items-center justify-between"
              >
                <span>{l.label}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-60" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificação Go-Live</CardTitle>
          <CardDescription>
            Cada item é validado por código fonte ou pelo CI. Linked panels
            contêm dados ao vivo; esta página não.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {GO_LIVE_CHECKS.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-border/50 bg-muted/10 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{c.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {c.scope}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {c.area}
                      </Badge>
                      <Badge
                        variant={c.status === "enforced" ? "default" : "outline"}
                        className="text-[10px]"
                      >
                        {c.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.description}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 font-mono break-all">
                      {c.enforcedBy}
                    </p>
                  </div>
                  {c.link && (
                    <Link
                      to={c.link.to}
                      className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      {c.link.label}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Contratos de gateway (Passo M)
          </CardTitle>
          <CardDescription>
            Campos mínimos esperados pelo pipeline canônico — sem hardcode
            inseguro. Gateways sem handler nativo continuam suportados via{" "}
            <code>generic</code> adapter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {GATEWAY_ADAPTER_CONTRACTS.map((c) => (
              <ContractCard key={c.id} c={c} />
            ))}
          </div>
          <div className="mt-4 rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              Esta página é um espelho estático dos contratos. Para dados ao
              vivo (orders, deliveries, alerts), use os painéis de auditoria
              acima.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riscos residuais reais</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            <li>
              Dispatch de alertas externos (Slack/Email) NÃO é configurado por
              padrão — alertas internos só. Habilitar em release futura.
            </li>
            <li>
              Retenção destrutiva continua manual e protegida por
              <code> X-Cron-Secret</code>; cron faz apenas dry-run/monitor.
            </li>
            <li>
              Auditoria semântica de RLS depende de <code>PGHOST</code> em CI;
              em CI sem DB, a checagem é pulada com mensagem.
            </li>
            <li>
              Gateways listados como "via generic adapter" precisam de
              configuração de webhook documentada manualmente; não há fast-path
              específico ainda.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  const cls =
    tone === "ok"
      ? "text-primary"
      : tone === "warn"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border/50 bg-background p-3">
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
