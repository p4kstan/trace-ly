import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ShieldCheck, Workflow } from "lucide-react";
import {
  GATEWAY_FAST_PATH_GUIDES,
  type GatewayFastPathGuide,
} from "@/lib/gateway-fast-path-guides";

/**
 * Gateway Docs — Passo O.
 *
 * Read-only documentation for fast-path gateways (WooCommerce / Braip /
 * CartPanda / PerfectPay) and the generic adapter fallback. All content is
 * sourced from `gateway-fast-path-guides.ts` — there are no real API keys,
 * tokens or webhook secrets in this page.
 */

const GENERIC_FALLBACK = {
  id: "generic",
  label: "Generic Adapter (fallback)",
  notes: [
    "Use the generic handler ONLY when no provider-specific handler exists.",
    "Webhook URL: https://<workspace>.functions.supabase.co/gateway-webhook?provider=generic",
    "ALWAYS configure HMAC/secret on the gateway side; the adapter rejects unsigned production traffic.",
    "Map status to canonical buckets: paid / pending / refunded / canceled / chargeback / expired / failed.",
    "Propagate root_order_code + step_key in metadata for multi-step funnels.",
  ],
};

function GuideCard({ g }: { g: GatewayFastPathGuide }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-medium flex items-center gap-2">
          <Workflow className="h-4 w-4 text-primary" />
          {g.label}
        </div>
        <Badge variant="secondary" className="text-[10px]">{g.id}</Badge>
      </div>

      <div className="text-xs space-y-1">
        <div className="text-muted-foreground">Webhook canonical URL</div>
        <code className="block break-all rounded bg-muted px-2 py-1.5 text-[11px]">{g.webhookUrlPattern}</code>
      </div>

      <div className="text-xs space-y-1">
        <div className="text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Assinatura obrigatória
        </div>
        <p className="text-foreground/90 leading-snug">{g.signatureRequirement}</p>
      </div>

      <div className="text-xs space-y-1">
        <div className="text-muted-foreground">Campos mínimos do payload canônico</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-border/40">
                <th className="py-1 pr-2 font-medium">Campo</th>
                <th className="py-1 pr-2 font-medium">Obrig.</th>
                <th className="py-1 pr-2 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {g.fields.map((f) => (
                <tr key={f.name} className="border-b border-border/20 last:border-0">
                  <td className="py-1 pr-2 font-mono">{f.name}</td>
                  <td className="py-1 pr-2">{f.required ? "✓" : "—"}</td>
                  <td className="py-1 pr-2 text-muted-foreground">{f.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs space-y-1">
        <div className="text-muted-foreground">Propagação de UTMs / click IDs / root_order_code</div>
        <ul className="list-disc pl-5 space-y-0.5">
          {g.propagation.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>

      <div className="text-xs space-y-1">
        <div className="text-muted-foreground">Multi-etapa (order-bump / upsell)</div>
        <p className="leading-snug">{g.multiStep}</p>
      </div>

      <div className="text-xs space-y-1">
        <div className="text-muted-foreground">Checklist Go-live (sem chaves reais)</div>
        <ul className="space-y-0.5 font-mono text-[11px]">
          {g.checklist.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default function GatewayDocs() {
  const [active, setActive] = useState<string>(GATEWAY_FAST_PATH_GUIDES[0]?.id ?? "woocommerce");
  const guide = GATEWAY_FAST_PATH_GUIDES.find((g) => g.id === active);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          Gateway Docs (fast-path)
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Documentação operacional para gateways que rodam pelo adapter genérico.
          Apenas templates / checklists — nenhuma chave real, secret ou URL com token aparece aqui.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Selecione um gateway</CardTitle>
          <CardDescription>
            Conteúdo gerado a partir de <code className="text-xs px-1 py-0.5 rounded bg-muted">src/lib/gateway-fast-path-guides.ts</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {GATEWAY_FAST_PATH_GUIDES.map((g) => (
              <Button
                key={g.id}
                size="sm"
                variant={active === g.id ? "default" : "outline"}
                onClick={() => setActive(g.id)}
              >
                {g.label}
              </Button>
            ))}
          </div>
          {guide && <GuideCard g={guide} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generic adapter (fallback)</CardTitle>
          <CardDescription>{GENERIC_FALLBACK.label}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            {GENERIC_FALLBACK.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
