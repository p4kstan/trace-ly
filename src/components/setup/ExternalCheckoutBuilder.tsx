import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Globe, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  generateExternalCheckoutPrompt, EXTERNAL_PLATFORM_META, type ExternalPlatform,
} from "@/lib/external-checkout-prompts";

interface Props {
  publicKey: string;
  endpoint: string;
  supabaseUrl: string;
}

const PLATFORMS: ExternalPlatform[] = [
  "yampi", "shopify", "woocommerce", "cartpanda",
  "hotmart", "kiwify", "eduzz", "monetizze", "ticto", "braip", "perfectpay",
  "other",
];

function CopyableBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative group">
      <pre className="bg-muted/30 border border-border/30 rounded-lg p-4 overflow-auto text-xs leading-relaxed max-h-[600px] whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
      <Button
        size="sm" variant="default"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => { navigator.clipboard.writeText(code); toast.success(`${label} copiado!`); }}
      >
        <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
      </Button>
    </div>
  );
}

export function ExternalCheckoutBuilder({ publicKey, endpoint, supabaseUrl }: Props) {
  const [platform, setPlatform] = useState<ExternalPlatform>("yampi");

  const meta = EXTERNAL_PLATFORM_META[platform];
  const prompt = useMemo(() => generateExternalCheckoutPrompt({
    platform, publicKey, endpoint, supabaseUrl,
  }), [platform, publicKey, endpoint, supabaseUrl]);

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Checkout Externo / Hospedado — Gerador
        </CardTitle>
        <CardDescription>
          Para Yampi, Shopify, WooCommerce, Hotmart, Kiwify, Eduzz, Monetizze etc.
          O cliente <strong>sai do seu site</strong> para pagar na plataforma.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Plataforma de checkout</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as ExternalPlatform)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-[10px] text-muted-foreground">E-commerce</div>
                {PLATFORMS.filter(p => EXTERNAL_PLATFORM_META[p].category === "ecommerce").map(p => (
                  <SelectItem key={p} value={p}>{EXTERNAL_PLATFORM_META[p].label}</SelectItem>
                ))}
                <div className="px-2 py-1 text-[10px] text-muted-foreground">Infoproduto</div>
                {PLATFORMS.filter(p => EXTERNAL_PLATFORM_META[p].category === "infoproduct").map(p => (
                  <SelectItem key={p} value={p}>{EXTERNAL_PLATFORM_META[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border/40 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Capacidades de {meta.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">UTMs: {meta.utmSupport}</Badge>
              <Badge variant="outline" className="text-[10px]">Scripts: {meta.scriptSupport}</Badge>
            </div>
            <div className="text-muted-foreground">
              Order ID: <code className="text-[10px]">{meta.orderIdField}</code>
            </div>
          </div>
        </div>

        <Tabs defaultValue="prompt">
          <TabsList className="bg-muted/30">
            <TabsTrigger value="prompt">Prompt para IA</TabsTrigger>
            <TabsTrigger value="checklist">Checklist rápido</TabsTrigger>
          </TabsList>

          <TabsContent value="prompt" className="mt-4 space-y-3">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription className="text-xs">
                Este prompt cobre auditoria de permissões, injeção de UTMs no link de checkout,
                pixel browser na thank-you e configuração do webhook canônico em <strong>{meta.label}</strong>.
              </AlertDescription>
            </Alert>
            <CopyableBlock code={prompt} label={`Prompt ${meta.label}`} />
          </TabsContent>

          <TabsContent value="checklist" className="mt-4 space-y-2 text-xs">
            <p className="font-medium text-foreground">Para {meta.label}, antes de testar:</p>
            <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
              <li>Confirme em <code>{meta.webhookPath}</code> que o webhook aponta para a URL canônica do CapiTrack</li>
              <li>Confirme que UTMs/click IDs são preservados (suporte: {meta.utmSupport})</li>
              <li>Confirme que o <code>{meta.orderIdField}</code> é o ID estável usado em todos os pontos</li>
              <li>Configure o secret HMAC no painel de integrações do CapiTrack</li>
              <li>Faça uma compra teste e confirme em /webhook-logs status <code>processed</code></li>
              <li>Confirme em /event-logs que o <code>event_id = purchase:&lt;order_id&gt;</code></li>
              <li>F5 na thank-you NÃO deve duplicar (dedupe 48h)</li>
              <li className="text-muted-foreground/70">{meta.notes}</li>
            </ul>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
