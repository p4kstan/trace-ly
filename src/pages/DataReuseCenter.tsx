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
import {
  simulateRule,
  simulateRulesForScope,
  type AutomationRuleRow,
} from "@/lib/automation-rule-simulator";
import { Button } from "@/components/ui/button";

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

interface KeysetCursor { created_at: string; id: string }
interface KeysetSummary {
  ok: boolean;
  inspected?: number;
  total_orders?: number;
  next_cursor?: KeysetCursor | null;
  summary?: Record<string, number>;
}

export default function DataReuseCenter() {
  const { data: workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const [limit, setLimit] = useState<number>(500);
  const [previewProvider, setPreviewProvider] = useState<Provider>("google_ads");
  const [pages, setPages] = useState<OrderRow[]>([]);
  const [cursor, setCursor] = useState<KeysetCursor | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [keysetSummary, setKeysetSummary] = useState<KeysetSummary | null>(null);
  const [keysetMode, setKeysetMode] = useState<"keyset" | "fallback">("keyset");

  // Reset pagination when workspace or limit changes.
  useMemo(() => {
    setPages([]);
    setCursor(null);
    setExhausted(false);
    setKeysetSummary(null);
  }, [workspaceId, limit]);

  const ordersQuery = useQuery({
    queryKey: ["data-reuse-orders", workspaceId, limit],
    enabled: !!workspaceId && pages.length === 0 && !exhausted,
    queryFn: async (): Promise<OrderRow[]> => {
      // Try keyset RPC first — server-side aggregation, no PII.
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "data_reuse_summary_keyset" as never,
          { _workspace_id: workspaceId!, _limit: limit } as never,
        );
        if (!rpcError && rpcData) {
          const s = rpcData as unknown as KeysetSummary;
          if (s?.ok) {
            setKeysetSummary(s);
            setKeysetMode("keyset");
            setCursor(s.next_cursor ?? null);
            if (!s.next_cursor) setExhausted(true);
          }
        } else {
          setKeysetMode("fallback");
        }
      } catch {
        setKeysetMode("fallback");
      }

      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total_value,currency,created_at,customer_email,customer_phone,ads_consent_granted,gclid,gbraid,wbraid,fbclid,ttclid,msclkid")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data ?? []) as OrderRow[];
      setPages(rows);
      if (rows.length < limit) setExhausted(true);
      return rows;
    },
  });

  async function loadMore() {
    if (!workspaceId || exhausted) return;
    // Try keyset advance — count-only summary update.
    if (keysetMode === "keyset" && cursor) {
      try {
        const { data, error } = await supabase.rpc(
          "data_reuse_summary_keyset" as never,
          {
            _workspace_id: workspaceId,
            _limit: limit,
            _cursor_created_at: cursor.created_at,
            _cursor_id: cursor.id,
          } as never,
        );
        if (!error && data) {
          const s = data as unknown as KeysetSummary;
          if (s?.ok) {
            setKeysetSummary((prev) => {
              if (!prev?.summary || !s.summary) return s;
              const merged: Record<string, number> = { ...prev.summary };
              for (const [k, v] of Object.entries(s.summary)) {
                merged[k] = (merged[k] ?? 0) + (v ?? 0);
              }
              return {
                ...prev,
                inspected: (prev.inspected ?? 0) + (s.inspected ?? 0),
                next_cursor: s.next_cursor ?? null,
                summary: merged,
              };
            });
            setCursor(s.next_cursor ?? null);
            if (!s.next_cursor) setExhausted(true);
          }
        }
      } catch {
        /* ignore — UI will show no further advance */
      }
    }

    // Advance row-level fallback so previews/coverage reflect more data.
    const last = pages[pages.length - 1];
    if (last) {
      const { data } = await supabase
        .from("orders")
        .select("id,status,total_value,currency,created_at,customer_email,customer_phone,ads_consent_granted,gclid,gbraid,wbraid,fbclid,ttclid,msclkid")
        .eq("workspace_id", workspaceId)
        .lt("created_at", last.created_at)
        .order("created_at", { ascending: false })
        .limit(limit);
      const rows = (data ?? []) as OrderRow[];
      setPages((p) => [...p, ...rows]);
      if (rows.length < limit) setExhausted(true);
    }
  }


  const destRegistryQuery = useQuery({
    queryKey: ["data-reuse-destination-registry", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<RegistryRow[]> => {
      const { data, error } = await supabase.rpc("list_ad_conversion_destinations", {
        _workspace_id: workspaceId!,
      });
      if (error) return [];
      return (data ?? []) as RegistryRow[];
    },
  });

  const destFallbackQuery = useQuery({
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

  const automationRulesQuery = useQuery({
    queryKey: ["data-reuse-automation-rules", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<AutomationRuleRow[]> => {
      const { data, error } = await supabase
        .from("automation_rules")
        .select("id,name,enabled,execution_mode,guardrails_json,action_json,workspace_id,customer_id,campaign_id")
        .eq("workspace_id", workspaceId!)
        .limit(50);
      if (error) return [];
      return (data ?? []) as unknown as AutomationRuleRow[];
    },
  });

  const records = useMemo(() => pages.map(toRecord), [pages]);
  const clickIdRecords = useMemo(() => pages.map(toClickIdRecord), [pages]);
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

  const { descriptors: destinationDescriptors, source: registrySource } = useMemo(
    () =>
      buildDestinationDescriptors({
        registry: destRegistryQuery.data ?? null,
        fallback: destFallbackQuery.data ?? null,
      }),
    [destRegistryQuery.data, destFallbackQuery.data],
  );

  const destinationsByProvider = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of destinationDescriptors) {
      const p = d.provider;
      out[p] = (out[p] ?? 0) + 1;
    }
    return out;
  }, [destinationDescriptors]);

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

  // Multi-rule simulator (Passo S) — iterate ALL applicable automation_rules
  // for the workspace and aggregate by outcome. Auto stays blocked unless
  // guardrails.auto_enabled=true AND execution_mode=auto on the row.
  const multiRuleReport = useMemo(() => {
    const rules = automationRulesQuery.data ?? [];
    return simulateRulesForScope(
      rules,
      {},
      {
        kind: "budget",
        target_id: "data-reuse-center:budget-preview",
        current_value: 100,
        proposed_value: 110,
        recent_conversions: coverage.paid,
        hours_since_last_change: 48,
      },
    );
  }, [automationRulesQuery.data, coverage.paid]);

  const simulation = useMemo(() => {
    const recentConv = coverage.paid;
    const samples: Array<{ kind: SimulationKind; current: number; proposed: number }> = [
      { kind: "budget", current: 100, proposed: 110 },
      { kind: "bid",    current: 1.0, proposed: 1.20 },
      { kind: "cpa",    current: 50,  proposed: 70 },
    ];
    const realRule = (automationRulesQuery.data ?? [])[0];
    return samples.map((s) => {
      if (realRule) {
        return simulateRule(realRule, {
          kind: s.kind,
          target_id: `rule:${realRule.id}:${s.kind}`,
          current_value: s.current,
          proposed_value: s.proposed,
          recent_conversions: recentConv,
          hours_since_last_change: 48,
        });
      }
      return simulateAutomationChange({
        kind: s.kind,
        target_id: `sample:${s.kind}`,
        current_value: s.current,
        proposed_value: s.proposed,
        recent_conversions: recentConv,
        hours_since_last_change: 48,
        execution_mode: "recommendation",
      });
    });
  }, [coverage.paid, automationRulesQuery.data]);

  const simulationSource: "real_rule" | "synthetic" =
    (automationRulesQuery.data ?? []).length > 0 ? "real_rule" : "synthetic";

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
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            modo: {keysetMode === "keyset" ? "RPC keyset" : "fallback client"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            janela: {pages.length}{" "}
            {keysetSummary?.total_orders ? `/ ${keysetSummary.total_orders}` : ""}
          </Badge>
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
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={exhausted || ordersQuery.isFetching}
          >
            {exhausted ? "Janela completa" : "Carregar mais"}
          </Button>
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
                Verifica destinos duplicados, ausentes, sem credential_ref ou sem consent gate.{" "}
                <Badge variant="outline" className="ml-1 text-[10px]">
                  fonte: {registrySource}
                </Badge>
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
                Recomendações de orçamento/lance/CPA. <strong>Auto bloqueado por padrão</strong> via guardrails.{" "}
                <Badge variant="outline" className="ml-1 text-[10px]">
                  fonte: {simulationSource === "real_rule" ? "automation_rules" : "sintético"}
                </Badge>
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

          {/* MULTI-RULE REPORT (Passo S) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cog className="h-4 w-4 text-primary" /> Multi-rule simulator (Passo S)
              </CardTitle>
              <CardDescription>
                Itera todas as <code>automation_rules</code> aplicáveis ao workspace e agrupa por
                regra/outcome. Auto continua bloqueado sem <code>guardrails.auto_enabled=true</code>{" "}
                e <code>execution_mode=auto</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <StatBlock label="Inspecionadas" value={multiRuleReport.inspected_rules} />
                <StatBlock label="Aplicáveis" value={multiRuleReport.applicable_rules} />
                <StatBlock label="Permitidas" value={multiRuleReport.by_outcome.allowed} />
                <StatBlock
                  label="Bloqueadas"
                  value={
                    multiRuleReport.by_outcome.blocked +
                    multiRuleReport.by_outcome.auto_blocked
                  }
                />
              </div>
              {multiRuleReport.empty ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma <code>automation_rule</code> cadastrada — usando simulação sintética acima.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {multiRuleReport.entries.map((e) => (
                    <li
                      key={e.rule_id}
                      className="rounded border border-border/40 px-3 py-2 flex items-start justify-between gap-2"
                    >
                      <div>
                        <div className="font-medium text-sm">
                          {e.rule_name ?? e.rule_id}
                        </div>
                        {e.result.reasons.length > 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            {e.result.reasons.join(" · ")}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant={
                            e.result.outcome === "allowed" ? "default" :
                            e.result.outcome === "needs_review" ? "secondary" :
                            "destructive"
                          }
                          className="text-[10px]"
                        >
                          {e.result.outcome}
                        </Badge>
                        {e.is_auto_attempt && (
                          <Badge variant="outline" className="text-[10px]">
                            tentativa auto
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
