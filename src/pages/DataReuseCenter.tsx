import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, ShieldCheck, Send, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import {
  PROVIDER_REQUIREMENTS,
  buildCoverageReport,
  type PurchaseRecordSummary,
  type Provider,
  type ClickIdKey,
} from "@/lib/data-reuse-eligibility";

/**
 * Data Reuse Center — Passo P.
 *
 * Read-only operational view that turns first-party data into reusable assets.
 * INVARIANTS:
 *   - No raw PII shown. Coverage uses booleans (has_email_hash / click ID present).
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

  const ordersQuery = useQuery({
    queryKey: ["data-reuse-orders", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total_value,currency,created_at,customer_email,customer_phone,ads_consent_granted,gclid,gbraid,wbraid,fbclid,ttclid,msclkid")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const destQuery = useQuery({
    queryKey: ["data-reuse-destinations", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Array<{ provider: string | null }>> => {
      const { data, error } = await supabase
        .from("gateway_integrations_safe")
        .select("provider,status")
        .eq("workspace_id", workspaceId!);
      if (error) return [];
      return (data ?? []) as Array<{ provider: string | null }>;
    },
  });

  const records = useMemo(
    () => (ordersQuery.data ?? []).map(toRecord),
    [ordersQuery.data],
  );
  const coverage = useMemo(() => buildCoverageReport({ records }), [records]);

  const destinationsByProvider = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of destQuery.data ?? []) {
      const p = (d.provider ?? "unknown").toLowerCase();
      out[p] = (out[p] ?? 0) + 1;
    }
    return out;
  }, [destQuery.data]);

  function destinationCount(provider: Provider): number {
    if (provider === "google_ads") return destinationsByProvider["google_ads"] ?? destinationsByProvider["google"] ?? 0;
    if (provider === "ga4") return destinationsByProvider["ga4"] ?? 0;
    if (provider === "meta") return destinationsByProvider["meta"] ?? destinationsByProvider["facebook"] ?? 0;
    if (provider === "tiktok") return destinationsByProvider["tiktok"] ?? 0;
    return 0;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Cobertura first-party (últimos 500 pedidos)
          </CardTitle>
          <CardDescription>
            Contagens agregadas — nenhum identificador é exposto.
          </CardDescription>
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

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Cobertura de click IDs
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
              {CLICK_ID_KEYS.map((k) => (
                <div key={k} className="rounded border border-border/40 px-2 py-1.5 flex justify-between">
                  <span className="font-mono text-xs">{k}</span>
                  <span className="font-medium">{coverage.click_id_coverage[k]}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Prontidão por plataforma
          </CardTitle>
          <CardDescription>
            Conversões/pedidos elegíveis para offline / enhanced conversions hoje.
          </CardDescription>
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
                  <a
                    href={PROVIDER_GUIDE_LINKS[req.provider]}
                    className="text-xs text-primary hover:underline"
                  >
                    abrir guia →
                  </a>
                </div>
                <div className="text-xs text-muted-foreground">
                  Click IDs preferidos:{" "}
                  <code className="text-[11px] px-1 py-0.5 rounded bg-muted">
                    {req.preferred_click_ids.join(" / ")}
                  </code>
                  {req.accepts_hashed_pii_fallback && " — aceita fallback hash SHA-256"}
                </div>
                <p className="text-xs leading-snug">{req.guide}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

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
          <p>
            Páginas com nome “TMT” ou similares <strong>não substituem</strong> tracking real: este painel só
            confia em <code>orders</code> + <code>events</code> + <code>gateway_integrations</code> do seu
            workspace, sem heurísticas externas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
