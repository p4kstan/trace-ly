import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface CAInfo {
  id: string;
  name: string;
  status: string;
  category: string;
  type: string;
  counting_type: string;
  include_in_conversions_metric: boolean;
  primary_for_goal: boolean;
}
interface DestResult {
  destination_id: string;
  display_name: string | null;
  is_active: boolean;
  customer_id: string;
  conversion_action_id: string;
  accepts_lead_event: boolean;
  registry_event_filter: string | null;
  api_check: CAInfo | null;
  api_error: string | null;
  issues: string[];
  ok: boolean;
}
interface ValidateResult {
  ok: true;
  summary: {
    google_ads_destinations: number;
    whatsapp_clicks_7d: number;
    lead_events_dispatched_7d: number;
    match_rate_pct: number | null;
  };
  destinations: DestResult[];
}

export function GoogleAdsValidationPanel({ workspaceId }: { workspaceId: string }) {
  const [result, setResult] = useState<ValidateResult | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-validate-google-ads", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha na validação");
      return data as ValidateResult;
    },
    onSuccess: (data) => {
      setResult(data);
      const broken = data.destinations.filter((d) => !d.ok).length;
      if (broken === 0) toast.success("Tudo certo! 1 clique = 1 conversão.");
      else toast.warning(`${broken} destino(s) com problema. Veja abaixo.`);
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Validação Google Ads — Lead do WhatsApp</CardTitle>
            <CardDescription>
              Confere quais <strong>conversion_action_id</strong> recebem o evento <code>Lead</code> do
              <code> whatsapp-click</code> e se cada uma está com <strong>counting_type = MANY_PER_CLICK</strong>
              {" "}(1 conversão por clique, contagem por quantidade).
            </CardDescription>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Validar agora
          </Button>
        </CardHeader>
        {result && (
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Destinos Google Ads" value={result.summary.google_ads_destinations} />
              <Stat label="Cliques (7d)" value={result.summary.whatsapp_clicks_7d} />
              <Stat label="Leads disparados (7d)" value={result.summary.lead_events_dispatched_7d} />
              <Stat
                label="Match"
                value={result.summary.match_rate_pct == null ? "—" : `${result.summary.match_rate_pct}%`}
                hint="Leads/Cliques. Ideal: 100%."
              />
            </div>
          </CardContent>
        )}
      </Card>

      {result?.destinations.map((d) => (
        <Card key={d.destination_id} className={d.ok ? "border-green-500/30" : "border-destructive/30"}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {d.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                )}
                {d.display_name || `Destino ${d.destination_id}`}
              </CardTitle>
              <div className="flex gap-2">
                {!d.is_active && <Badge variant="outline">inativo</Badge>}
                {d.api_check?.status === "ENABLED" && (
                  <Badge className="bg-green-500/15 text-green-500 border-green-500/30">ENABLED</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-xs">
              <KV k="customer_id" v={d.customer_id || "—"} />
              <KV k="conversion_action_id" v={d.conversion_action_id || "—"} />
              <KV k="event filter" v={d.registry_event_filter || "ALL (fallback)"} />
              {d.api_check && (
                <>
                  <KV k="counting_type" v={d.api_check.counting_type} highlight={d.api_check.counting_type === "MANY_PER_CLICK" ? "good" : "bad"} />
                  <KV k="category" v={d.api_check.category} />
                  <KV k="type" v={d.api_check.type} />
                  <KV k="include_in_conv_metric" v={String(d.api_check.include_in_conversions_metric)} highlight={d.api_check.include_in_conversions_metric ? "good" : "bad"} />
                  <KV k="primary_for_goal" v={String(d.api_check.primary_for_goal)} />
                  <KV k="action name" v={d.api_check.name} />
                </>
              )}
            </div>
            {d.issues.length > 0 && (
              <ul className="space-y-1 pt-2 border-t border-border/50">
                {d.issues.map((iss, i) => (
                  <li key={i} className="flex items-start gap-2 text-destructive">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{iss}</span>
                  </li>
                ))}
              </ul>
            )}
            {d.ok && (
              <div className="flex items-center gap-2 text-green-500 text-xs pt-2 border-t border-border/50">
                <CheckCircle2 className="w-4 h-4" />
                <span>Configurado corretamente. Cada clique no WhatsApp conta como 1 conversão nesse destino.</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {result && result.destinations.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum destino Google Ads configurado neste workspace. Vá em <strong>Destinos</strong> e crie um.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="bg-muted/30 rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function KV({ k, v, highlight }: { k: string; v: string; highlight?: "good" | "bad" }) {
  const cls =
    highlight === "good"
      ? "text-green-500"
      : highlight === "bad"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
      <div className={`${cls} break-all`}>{v}</div>
    </div>
  );
}
