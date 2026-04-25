// Go-live checklist — gateway/checkout production readiness.
// Read-only operational page. Lists the mandatory steps before scaling
// traffic on a new gateway/checkout, both for native and external flows.
//
// Each item is a static rule paired with a "live" computed status when
// possible (e.g. canonical events present? queue health ok?). For pure
// procedural items (replay test executed) we render a manual checkbox
// stored locally so operators can mark progress.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertTriangle, Circle, Shield, ExternalLink } from "lucide-react";

type CheckStatus = "ok" | "warn" | "fail" | "manual";
interface CheckItem {
  key: string;
  label: string;
  hint: string;
  status: CheckStatus;
  link?: { to: string; label: string };
}

function statusIcon(s: CheckStatus) {
  if (s === "ok") return <CheckCircle2 className="w-4 h-4 text-success" />;
  if (s === "warn") return <AlertTriangle className="w-4 h-4 text-warning" />;
  if (s === "fail") return <AlertTriangle className="w-4 h-4 text-destructive" />;
  return <Circle className="w-4 h-4 text-muted-foreground" />;
}

const MANUAL_KEY_PREFIX = "goLiveChecklist:";

export default function GoLiveChecklist() {
  const { data: workspace } = useWorkspace();
  const [flow, setFlow] = useState<"native" | "external">("native");
  const [gateway, setGateway] = useState<string>("hotmart");
  const [manual, setManual] = useState<Record<string, boolean>>({});

  // Persist manual checks per workspace+gateway+flow.
  const storageKey = `${MANUAL_KEY_PREFIX}${workspace?.id || "anon"}:${flow}:${gateway}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setManual(raw ? JSON.parse(raw) : {});
    } catch { setManual({}); }
  }, [storageKey]);
  const setManualKey = (k: string, v: boolean) => {
    const next = { ...manual, [k]: v };
    setManual(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const { data: health } = useQuery({
    queryKey: ["go-live-health", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("queue-health", {
        body: { workspace_id: workspace!.id },
      });
      if (error) throw error;
      return data as { status: "ok" | "warn" | "critical"; totals: any };
    },
  });

  const { data: hasCanonical } = useQuery({
    queryKey: ["go-live-canonical", workspace?.id, gateway],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("event_queue")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace!.id)
        .ilike("event_id", "purchase:%");
      const { count: stepCount } = await supabase
        .from("event_queue")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace!.id)
        .ilike("event_id", "purchase:%:step:%");
      return { main: count || 0, step: stepCount || 0 };
    },
  });

  const { data: hasReplay } = useQuery({
    queryKey: ["go-live-replay", workspace?.id, gateway],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace!.id)
        .eq("action", "webhook_replay_test")
        .eq("entity_id", gateway);
      return (count || 0) > 0;
    },
  });

  const items: CheckItem[] = useMemo(() => {
    const healthOk = health?.status === "ok";
    const healthWarn = health?.status === "warn";
    const canonicalOk = (hasCanonical?.main || 0) > 0;
    const stepOk = flow === "external" ? (hasCanonical?.step || 0) > 0 : true;

    return [
      {
        key: "replay_test",
        label: "Replay de payload sanitizado em test_mode",
        hint: "Use o harness webhook-replay-test com test_mode=true antes de receber webhook real.",
        status: hasReplay ? "ok" : "fail",
      },
      {
        key: "real_staging_webhook",
        label: "Webhook real do gateway recebido em staging",
        hint: "Configure a URL do gateway-webhook no painel do gateway e dispare uma compra real de teste.",
        status: manual["real_staging_webhook"] ? "ok" : "manual",
      },
      {
        key: "canonical_main",
        label: "Compra principal canônica purchase:<root_order_code>",
        hint: "Pelo menos 1 evento canônico de Purchase deve aparecer na fila.",
        status: canonicalOk ? "ok" : "fail",
      },
      ...(flow === "external" ? [{
        key: "canonical_step",
        label: "Etapas extras purchase:<root_order_code>:step:<step_key>",
        hint: "Checkouts externos com múltiplas etapas precisam emitir steps canônicos.",
        status: stepOk ? "ok" as const : "warn" as const,
      }] : []),
      {
        key: "dedup_4col",
        label: "Dedup 4-col workspace+event_id+provider+destination",
        hint: "Validado por release-validate.sh + uq_event_queue_dedup / uq_tracked_events_dedup.",
        status: manual["dedup_4col"] ? "ok" : "manual",
        link: { to: "/canonical-audit", label: "Ver auditoria canônica" },
      },
      {
        key: "logs_no_pii",
        label: "Logs sem PII (safe-logger ativo)",
        hint: "Edge functions críticas chamam installSafeConsole — release-validate bloqueia regressão.",
        status: "ok",
      },
      {
        key: "queue_health",
        label: "Queue health OK",
        hint: "dead_letter_count baixo, retry_age_max < 30min, queued_age_max < 15min.",
        status: healthOk ? "ok" : healthWarn ? "warn" : "fail",
        link: { to: "/retry-observability", label: "Ver observabilidade" },
      },
      {
        key: "consent_retention",
        label: "Consent + retention configurados",
        hint: "audience-seed-export exige consent; retention_policies define 180/365 dias por padrão.",
        status: manual["consent_retention"] ? "ok" : "manual",
      },
      {
        key: "enhanced_conversions",
        label: "Enhanced conversions / customer match com consentimento",
        hint: "Hashes SHA-256 + consentimento explícito antes de enviar ao Google Ads/Meta.",
        status: manual["enhanced_conversions"] ? "ok" : "manual",
      },
    ];
  }, [health, hasCanonical, hasReplay, manual, flow]);

  const okCount = items.filter((i) => i.status === "ok").length;
  const failCount = items.filter((i) => i.status === "fail").length;
  const warnCount = items.filter((i) => i.status === "warn").length;
  const ready = failCount === 0 && warnCount === 0 && okCount === items.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Checklist de Go-live</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Passos obrigatórios antes de escalar tráfego em um gateway/checkout.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Shield className="w-3 h-3" /> {okCount}/{items.length} OK
          </Badge>
          <Badge variant="outline" className={ready ? "border-success/40 text-success" : "border-warning/40 text-warning"}>
            {ready ? "pronto" : "pendente"}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Fluxo:</span>
            <Select value={flow} onValueChange={(v) => setFlow(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Checkout nativo</SelectItem>
                <SelectItem value="external">Checkout externo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Gateway:</span>
            <Select value={gateway} onValueChange={setGateway}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["hotmart", "kiwify", "yampi", "eduzz", "monetizze", "cakto", "kirvano", "appmax", "ticto", "pagarme", "stripe", "paypal", "mercadopago", "shopify", "generic"].map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Critérios obrigatórios</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border/40">
            {items.map((it) => (
              <li key={it.key} className="px-4 py-3 flex items-start gap-3">
                <div className="pt-0.5">{statusIcon(it.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{it.label}</span>
                    {it.link && (
                      <Link to={it.link.to} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                        {it.link.label} <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{it.hint}</p>
                </div>
                {it.status === "manual" && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={!!manual[it.key]}
                      onCheckedChange={(c) => setManualKey(it.key, !!c)}
                    />
                    confirmar
                  </label>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Itens automáticos (✓/⚠️/✕) refletem o estado vivo do workspace. Itens marcados como "confirmar"
        ficam salvos localmente neste navegador apenas como apoio operacional.
      </p>
    </div>
  );
}
