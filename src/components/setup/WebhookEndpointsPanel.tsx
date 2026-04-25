import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, Webhook, AlertCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

/**
 * Lists every supported gateway with the canonical webhook URL the merchant
 * must paste in their gateway dashboard, plus a freshness indicator showing
 * whether we've received any webhook from that provider in the last 24h.
 *
 * No PII is rendered — only counts and provider names.
 */
const SUPPORTED_PROVIDERS = [
  "hotmart", "kiwify", "yampi", "eduzz", "stripe", "mercadopago",
  "pagarme", "asaas", "monetizze", "appmax", "cakto", "kirvano",
  "pagseguro", "ticto", "greenn", "shopify", "paypal", "paddle",
  "fortpay", "cloudfy", "quantumpay", "gumroad",
];

function buildWebhookUrl(provider: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL || "";
  return `${base}/functions/v1/gateway-webhook?provider=${provider}`;
}

export function WebhookEndpointsPanel() {
  const { data: workspace } = useWorkspace();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["webhook_endpoint_readiness", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return { byProvider: {} as Record<string, { total: number; ok: number; failed: number; invalidSig: number; lastSeen?: string }> };
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("gateway_webhook_logs")
        .select("provider, processing_status, signature_valid, received_at")
        .eq("workspace_id", workspace.id)
        .gte("received_at", since)
        .order("received_at", { ascending: false })
        .limit(500);

      const byProvider: Record<string, { total: number; ok: number; failed: number; invalidSig: number; lastSeen?: string }> = {};
      for (const row of (data || []) as Array<{ provider: string; processing_status: string; signature_valid: boolean; received_at: string }>) {
        const p = row.provider || "unknown";
        if (!byProvider[p]) byProvider[p] = { total: 0, ok: 0, failed: 0, invalidSig: 0 };
        byProvider[p].total++;
        if (row.processing_status === "processed") byProvider[p].ok++;
        if (row.processing_status === "failed") byProvider[p].failed++;
        if (row.signature_valid === false) byProvider[p].invalidSig++;
        if (!byProvider[p].lastSeen) byProvider[p].lastSeen = row.received_at;
      }
      return { byProvider };
    },
    enabled: !!workspace?.id,
    refetchInterval: 30_000,
  });

  const sortedProviders = useMemo(() => {
    const seen = new Set(Object.keys(stats?.byProvider || {}));
    // Providers with recent activity first, then the rest alphabetically.
    return [
      ...Array.from(seen).sort(),
      ...SUPPORTED_PROVIDERS.filter(p => !seen.has(p)).sort(),
    ];
  }, [stats]);

  const copy = async (provider: string) => {
    try {
      await navigator.clipboard.writeText(buildWebhookUrl(provider));
      setCopied(provider);
      toast.success(`URL do ${provider} copiada`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Card className="glass-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Webhook className="w-4 h-4 text-primary" />
              Endpoints de webhook por gateway
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Cole a URL exata no painel do seu gateway. Última atividade nas últimas 24h.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sortedProviders.map(provider => {
            const s = stats?.byProvider?.[provider];
            const active = !!s && s.total > 0;
            return (
              <div
                key={provider}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground capitalize">{provider}</span>
                    {active ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] py-0 h-4">
                        {s!.ok}/{s!.total} ok
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border/50 text-[10px] py-0 h-4">
                        sem hits 24h
                      </Badge>
                    )}
                    {s && s.invalidSig > 0 && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] py-0 h-4 gap-1">
                        <ShieldAlert className="w-3 h-3" /> {s.invalidSig} sig inválida
                      </Badge>
                    )}
                    {s && s.failed > 0 && (
                      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px] py-0 h-4 gap-1">
                        <AlertCircle className="w-3 h-3" /> {s.failed} falha
                      </Badge>
                    )}
                    {s && s.invalidSig === 0 && s.failed === 0 && active && (
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    )}
                  </div>
                  <code className="text-[10px] text-muted-foreground font-mono break-all block mt-0.5">
                    {buildWebhookUrl(provider)}
                  </code>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(provider)}
                  className="shrink-0 h-7 px-2"
                >
                  {copied === provider ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border/30 pt-3">
          Dica: se um gateway aparecer como <span className="text-foreground">"sem hits 24h"</span> mas você fez uma compra teste,
          confirme se a URL acima está exatamente igual no painel do gateway e se o secret HMAC corresponde.
          Esta tela não exibe dados pessoais — apenas contadores.
        </p>
      </CardContent>
    </Card>
  );
}
