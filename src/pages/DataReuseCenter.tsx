import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Database,
  ShieldCheck,
  Send,
  Sparkles,
  AlertTriangle,
  Eye,
  Layers,
  Cog,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import {
  PROVIDER_REQUIREMENTS,
  buildCoverageReport,
  type PurchaseRecordSummary,
  type Provider,
  type ClickIdKey,
} from "@/lib/data-reuse-eligibility";
import {
  buildOfflineConversionPreview,
  buildAudienceSeedPreview,
  buildClickIdCoverage,
  type ClickIdField,
  type ClickIdRecord,
} from "@/lib/data-reuse-providers";
import {
  checkMultiDestinationConsistency,
} from "@/lib/multi-destination-consistency";
import {
  simulateAutomationChange,
  type SimulationKind,
} from "@/lib/automation-simulator";
import {
  buildDestinationDescriptors,
  type RegistryRow,
} from "@/lib/ad-destination-registry";
import { simulateRule, type AutomationRuleRow } from "@/lib/automation-rule-simulator";

/**
 * Data Reuse Center — Passo P + Q.
 *
 * Read-only operational view. INVARIANTS:
 *   - No raw PII shown; previews are masked / hash-only.
 *   - All exports/audiences are still dry-run/preview at this surface.
 *   - We never claim to copy a platform's internal ML learning.
 */

interface OrderRow {
  id: string;
  status: string | null;
  total_value: number | null;
  currency: string | null;
  created_at: string;
  customer_email: string | null;
  customer_phone: string | null;
  ads_consent_granted: boolean | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  msclkid: string | null;
}

const CLICK_ID_KEYS: ClickIdKey[] = [
  "gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid",
];

const SAMPLE_LIMITS = [200, 500, 1000, 2000, 5000] as const;

function toRecord(o: OrderRow): PurchaseRecordSummary {
  const status = (o.status ?? "").toLowerCase();
  const paid = status === "paid" || status === "approved";
  const click_ids: Partial<Record<ClickIdKey, boolean>> = {};
  for (const k of CLICK_ID_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) click_ids[k] = true;
  }
  return {
    paid,
    currency: o.currency,
    value: o.total_value,
    happened_at: o.created_at,
    order_id: o.id,
    event_id: o.id,
    has_email_hash: !!o.customer_email,
    has_phone_hash: !!o.customer_phone,
    click_ids,
    consent_marketing: o.ads_consent_granted === true,
    test_mode: false,
  };
}

function toClickIdRecord(o: OrderRow): ClickIdRecord {
  const status = (o.status ?? "").toLowerCase();
  const paid = status === "paid" || status === "approved";
  const fields: Partial<Record<ClickIdField, boolean>> = {};
  for (const k of CLICK_ID_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) fields[k as ClickIdField] = true;
  }
  return { paid, fields };
}

function StatBlock({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

const PROVIDER_GUIDE_LINKS: Record<Provider, string> = {
  google_ads: "/setup-google",
  ga4: "/setup-google",
  meta: "/setup-facebook",
  tiktok: "/contas-conectadas",
};

export default function DataReuseCenter() {
  const { data: workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const [limit, setLimit] = useState<number>(500);
  const [previewProvider, setPreviewProvider] = useState<Provider>("google_ads");

  const ordersQuery = useQuery({
    queryKey: ["data-reuse-orders", workspaceId, limit],
    enabled: !!workspaceId,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total_value,currency,created_at,customer_email,customer_phone,ads_consent_granted,gclid,gbraid,wbraid,fbclid,ttclid,msclkid")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const destQuery = useQuery({
    queryKey: ["data-reuse-destinations", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Array<{ provider: string | null; status?: string | null }>> => {
      const { data, error } = await supabase
        .from("gateway_integrations_safe")
        .select("provider,status")
        .eq("workspace_id", workspaceId!);
      if (error) return [];
      return (data ?? []) as Array<{ provider: string | null; status?: string | null }>;
    },
  });

  const records = useMemo(
    () => (ordersQuery.data ?? []).map(toRecord),
    [ordersQuery.data],
  );
  const clickIdRecords = useMemo(
    () => (ordersQuery.data ?? []).map(toClickIdRecord),
    [ordersQuery.data],
  );
  const coverage = useMemo(() => buildCoverageReport({ records }), [records]);
  const clickCoverage = useMemo(() => buildClickIdCoverage(clickIdRecords), [clickIdRecords]);

  const offlinePreview = useMemo(
    () => buildOfflineConversionPreview(previewProvider, { records }),
    [previewProvider, records],
  );
  const audiencePreview = useMemo(
    () => buildAudienceSeedPreview(previewProvider, { records }),
    [previewProvider, records],
  );

  const destinationsByProvider = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of destQuery.data ?? []) {
      const p = (d.provider ?? "unknown").toLowerCase();
      out[p] = (out[p] ?? 0) + 1;
    }
    return out;
  }, [destQuery.data]);

  const destinationDescriptors: DestinationDescriptor[] = useMemo(() => {
    return (destQuery.data ?? []).map((d, idx) => ({
      destination_id: `${(d.provider ?? "unknown").toLowerCase()}:#${idx + 1}`,
      provider: (d.provider ?? "unknown").toLowerCase(),
      account_id: null,
      conversion_action_id: null,
      event_name: "purchase",
      credential_ref: d.provider ? `cred:${d.provider}` : null,
      consent_gate: true,
      status: d.status ?? "unknown",
      last_success_at: null,
    }));
  }, [destQuery.data]);

  const consistencyReport = useMemo(
    () =>
      checkMultiDestinationConsistency(destinationDescriptors, [
        "google_ads",
        "meta",
        "tiktok",
        "ga4",
      ]),
    [destinationDescriptors],
  );

  const simulation = useMemo(() => {
    const recentConv = coverage.paid;
    const samples: Array<{ kind: SimulationKind; current: number; proposed: number }> = [
      { kind: "budget", current: 100, proposed: 110 },
      { kind: "bid",    current: 1.0, proposed: 1.20 },
      { kind: "cpa",    current: 50,  proposed: 70 },
    ];
    return samples.map((s) =>
      simulateAutomationChange({
        kind: s.kind,
        target_id: `sample:${s.kind}`,
        current_value: s.current,
        proposed_value: s.proposed,
        recent_conversions: recentConv,
        hours_since_last_change: 48,
        execution_mode: "recommendation",
      }),
    );
  }, [coverage.paid]);

  function destinationCount(provider: Provider): number {
    if (provider === "google_ads") return destinationsByProvider["google_ads"] ?? destinationsByProvider["google"] ?? 0;
    if (provider === "ga4") return destinationsByProvider["ga4"] ?? 0;
    if (provider === "meta") return destinationsByProvider["meta"] ?? destinationsByProvider["facebook"] ?? 0;
    if (provider === "tiktok") return destinationsByProvider["tiktok"] ?? 0;
    return 0;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Centro de Reuso de Dados
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Transforma dados first-party em assets reutilizáveis para Google Ads, GA4, Meta e TikTok —
            sempre em modo preview / hash-only. <strong>Não copiamos o aprendizado interno (ML)</strong> das
            plataformas: o que damos é uma calibração inicial mais forte com base em conversões consolidadas,
            público hash-only e click IDs disponíveis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Amostra</span>
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_LIMITS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  últimos {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="coverage" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="coverage" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Cobertura
          </TabsTrigger>
          <TabsTrigger value="clickid" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Click IDs
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Preview por provider
          </TabsTrigger>
          <TabsTrigger value="multidest" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Multi-destination
          </TabsTrigger>
          <TabsTrigger value="simulator" className="gap-1.5">
            <Cog className="h-3.5 w-3.5" /> Simulador
          </TabsTrigger>
        </TabsList>

        {/* COVERAGE TAB */}
        <TabsContent value="coverage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Cobertura first-party (últimos {limit} pedidos)
              </CardTitle>
              <CardDescription>Contagens agregadas — nenhum identificador é exposto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatBlock label="Total" value={coverage.total} />
                <StatBlock label="Pagas" value={coverage.paid} />
                <StatBlock label="Com consentimento" value={coverage.with_consent} hint="aceita audience seed" />
                <StatBlock label="Email hash" value={coverage.hash_pii_coverage.email_hash} />
                <StatBlock label="Phone hash" value={coverage.hash_pii_coverage.phone_hash} />
                <StatBlock label="Audience-seed elegível" value={coverage.audience_seed_eligible} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Prontidão por plataforma
              </CardTitle>
              <CardDescription>Conversões/pedidos elegíveis para offline / enhanced conversions hoje.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PROVIDER_REQUIREMENTS.map((req) => {
                const eligible = coverage.offline_eligible_per_provider[req.provider];
                const pct = coverage.paid > 0 ? Math.round((eligible / coverage.paid) * 100) : 0;
                const dest = destinationCount(req.provider);
                return (
                  <div key={req.provider} className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium flex items-center gap-2">
                        {req.label}
                        <Badge variant="secondary" className="text-[10px]">
                          {eligible} / {coverage.paid} ({pct}%)
                        </Badge>
                        {dest > 0 ? (
                          <Badge variant="default" className="text-[10px] gap-1">
                            <Send className="h-3 w-3" /> {dest} destino(s)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">sem destino configurado</Badge>
                        )}
                      </div>
                      <a href={PROVIDER_GUIDE_LINKS[req.provider]} className="text-xs text-primary hover:underline">
                        abrir guia →
                      </a>
                    </div>
                    <p className="text-xs leading-snug">{req.guide}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CLICK ID COVERAGE */}
        <TabsContent value="clickid" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cobertura por click ID & UTM</CardTitle>
              <CardDescription>Total / pagos / elegíveis por origem. Sem exposição dos valores.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                {clickCoverage.map((row) => (
                  <div key={row.field} className="rounded border border-border/40 px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-xs">{row.field}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {row.primary_provider}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{row.eligible}</div>
                      <div className="text-[10px] text-muted-foreground">
                        pagos {row.paid} / total {row.total}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROVIDER PREVIEW */}
        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Preview por provider (dry-run)
              </CardTitle>
              <CardDescription>
                Apenas contagens, campos disponíveis e amostras mascaradas. Nunca hashes reais.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={previewProvider} onValueChange={(v) => setPreviewProvider(v as Provider)}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_REQUIREMENTS.map((p) => (
                    <SelectItem key={p.provider} value={p.provider}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-3">
                <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <div className="font-medium text-sm mb-2">Offline / Enhanced Conversions</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <StatBlock label="Inspecionados" value={offlinePreview.inspected} />
                    <StatBlock label="Elegíveis" value={offlinePreview.eligible} />
                    <StatBlock label="Click ID match" value={offlinePreview.matched_click_id} />
                    <StatBlock label="Hash fallback" value={offlinePreview.matched_hash_only} />
                  </div>
                  {offlinePreview.sample_masked.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                        Amostras mascaradas
                      </div>
                      <ul className="text-xs font-mono space-y-1">
                        {offlinePreview.sample_masked.map((s, i) => (
                          <li key={i} className="text-muted-foreground">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <div className="font-medium text-sm mb-2">Audience Seed (Customer Match / Custom Audience)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <StatBlock label="Inspecionados" value={audiencePreview.inspected} />
                    <StatBlock label="Elegíveis" value={audiencePreview.eligible} />
                    <StatBlock label="Sem consentimento" value={audiencePreview.reasons.no_consent} />
                    <StatBlock label="Sem hash" value={audiencePreview.reasons.no_identifier_available} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MULTI-DESTINATION CONSISTENCY */}
        <TabsContent value="multidest" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Consistência multi-destination
              </CardTitle>
              <CardDescription>
                Verifica destinos duplicados, ausentes, sem credential_ref ou sem consent gate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {consistencyReport.empty ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum destino configurado ainda. Esta verificação fica vazia até você adicionar
                  pelo menos um destino em <code>/destinations</code>.
                </p>
              ) : consistencyReport.issues.length === 0 ? (
                <p className="text-sm text-success">Sem problemas detectados.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {consistencyReport.issues.map((i, idx) => (
                    <li key={idx} className="rounded border border-border/40 p-2 flex items-start gap-2">
                      <Badge
                        variant={
                          i.severity === "error" ? "destructive" :
                          i.severity === "warning" ? "secondary" : "outline"
                        }
                        className="text-[10px]"
                      >
                        {i.severity}
                      </Badge>
                      <div>
                        <div className="font-medium">{i.message}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {i.code} · {i.provider ?? "—"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SIMULATOR */}
        <TabsContent value="simulator" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cog className="h-4 w-4 text-primary" /> Simulador de automações (dry-run)
              </CardTitle>
              <CardDescription>
                Recomendações de orçamento/lance/CPA. <strong>Auto bloqueado por padrão</strong> via guardrails.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {simulation.map((s, idx) => (
                <div key={idx} className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm capitalize">
                      {s.audit_preview.action} ({s.audit_preview.delta_percent}%)
                    </div>
                    <Badge
                      variant={
                        s.outcome === "allowed" ? "default" :
                        s.outcome === "needs_review" ? "secondary" :
                        s.outcome === "blocked" ? "destructive" : "outline"
                      }
                      className="text-[10px]"
                    >
                      {s.outcome}
                    </Badge>
                  </div>
                  {s.reasons.length > 0 && (
                    <ul className="mt-2 text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-2">
                    Rollback: {s.rollback_plan}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Aviso operacional
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 leading-relaxed">
          <p>
            Reuso de dados <strong>não é cópia de aprendizado</strong>. O ML interno do Google/Meta/TikTok
            roda dentro da conta que recebeu impressões e cliques. O que você faz aqui é{" "}
            <strong>chegar com base de calibração</strong>: lista de compradores hash-only para Customer Match /
            Custom Audience, lookalike, conversões consolidadas (offline/enhanced) e GA4 audiences vinculadas
            ao Google Ads — tudo a partir do mesmo dado first-party deduplicado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
