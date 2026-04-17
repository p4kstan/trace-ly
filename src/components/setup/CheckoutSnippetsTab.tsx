import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, CreditCard, CheckCircle2, Info, Webhook, Code2 } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { QuantumWebhookSecret } from "./QuantumWebhookSecret";

interface Props {
  publicKey: string;
  supabaseUrl: string;
}

interface WorkspaceConfig {
  domain: string;
  ga4Id: string;
  googleAdsId: string;
  pixelId: string;
  hasQuantum: boolean;
}

export function CheckoutSnippetsTab({ publicKey, supabaseUrl }: Props) {
  const { data: workspace } = useWorkspace();
  const [cfg, setCfg] = useState<WorkspaceConfig>({
    domain: "seudominio.com.br",
    ga4Id: "G-XXXXXXX",
    googleAdsId: "AW-XXXXXXXX",
    pixelId: "SEU_PIXEL_ID",
    hasQuantum: false,
  });

  useEffect(() => {
    if (!workspace?.id) return;
    (async () => {
      const [srcRes, pixelRes, gwRes] = await Promise.all([
        supabase.from("tracking_sources")
          .select("primary_domain, settings_json")
          .eq("workspace_id", workspace.id).limit(1).maybeSingle(),
        supabase.from("meta_pixels")
          .select("pixel_id").eq("workspace_id", workspace.id)
          .eq("is_active", true).limit(1).maybeSingle(),
        supabase.from("gateway_integrations")
          .select("provider").eq("workspace_id", workspace.id)
          .eq("status", "active"),
      ]);
      const src: any = srcRes.data;
      setCfg({
        domain: src?.primary_domain || "seudominio.com.br",
        ga4Id: src?.settings_json?.ga4_measurement_id || "G-XXXXXXX",
        googleAdsId: src?.settings_json?.gtm_template_defaults?.google_ads_id || "AW-XXXXXXXX",
        pixelId: pixelRes.data?.pixel_id || "SEU_PIXEL_ID",
        hasQuantum: !!gwRes.data?.some((g: any) => g.provider === "quantumpay"),
      });
    })();
  }, [workspace?.id]);

  const trackEndpoint = `${supabaseUrl}/functions/v1/track`;
  const webhookEndpoint = `${supabaseUrl}/functions/v1/gateway-webhook`;

  const helperLib = useMemo(() => `// 📁 src/lib/capitrack.ts — copie este arquivo no seu projeto Lovable
// Helper único para enviar eventos com hash SHA-256 (PII no padrão Meta CAPI)

const ENDPOINT = "${trackEndpoint}";
const API_KEY  = "${publicKey}";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(name: string): string | undefined {
  return document.cookie.split("; ").find(r => r.startsWith(name + "="))?.split("=")[1];
}

function onlyDigits(s?: string) { return (s || "").replace(/\\D/g, ""); }

export interface UserPII {
  email?: string;
  phone?: string;   // qualquer formato — limpamos automaticamente
  cpf?: string;     // qualquer formato — limpamos automaticamente
  firstName?: string;
  lastName?: string;
}

async function buildUserData(u: UserPII = {}) {
  const ud: Record<string, string> = {};
  if (u.email)     ud.em = await sha256(u.email);
  if (u.phone)     ud.ph = await sha256("55" + onlyDigits(u.phone)); // E.164 BR
  if (u.cpf)       ud.external_id = await sha256(onlyDigits(u.cpf));
  if (u.firstName) ud.fn = await sha256(u.firstName);
  if (u.lastName)  ud.ln = await sha256(u.lastName);
  ud.fbp = getCookie("_fbp") || "";
  ud.fbc = getCookie("_fbc") || "";
  ud.client_user_agent = navigator.userAgent;
  return ud;
}

export async function track(eventName: string, opts: {
  user?: UserPII;
  value?: number;
  currency?: string;
  transactionId?: string;
  items?: any[];
  paymentMethod?: string;
  custom?: Record<string, any>;
} = {}) {
  const user_data = await buildUserData(opts.user);
  const event_id = (opts.transactionId || crypto.randomUUID()) + ":" + eventName;

  // 1) dispara no dataLayer (GTM bridge captura)
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).dataLayer.push({ ecommerce: null });
  (window as any).dataLayer.push({
    event: eventName,
    event_id,
    ecommerce: {
      transaction_id: opts.transactionId,
      value: opts.value,
      currency: opts.currency || "BRL",
      payment_type: opts.paymentMethod,
      items: opts.items || [],
    },
    user_data,
    ...(opts.custom || {}),
  });

  // 2) envio direto pro CapiTrack (deduplica via event_id)
  try {
    await fetch(ENDPOINT, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
      body: JSON.stringify({
        event_name: eventName,
        event_id,
        action_source: "website",
        url: location.href,
        user_data,
        custom_data: {
          value: opts.value,
          currency: opts.currency || "BRL",
          transaction_id: opts.transactionId,
          payment_method: opts.paymentMethod,
          contents: opts.items,
          ...(opts.custom || {}),
        },
      }),
    });
  } catch {}
}
`, [publicKey, trackEndpoint]);

  const beginCheckout = `// No clique de "Finalizar pedido" do seu checkout
import { track } from "@/lib/capitrack";

await track("begin_checkout", {
  user: {
    firstName: form.nome.split(" ")[0],
    lastName:  form.nome.split(" ").slice(1).join(" "),
    phone:     form.telefone,            // (11) 98888-7777 — limpamos automaticamente
    cpf:       form.cpf,                 // 123.456.789-00 — limpamos automaticamente
    email:     form.email,               // opcional no delivery
  },
  value: cart.total,                     // ex.: 47.90
  currency: "BRL",
  items: cart.items.map(i => ({
    item_id: i.id,
    item_name: i.nome,
    price: i.preco,
    quantity: i.qtd,
  })),
});`;

  const addPaymentInfo = `// Quando o QR Code Pix da Quantum é exibido na tela
import { track } from "@/lib/capitrack";

await track("add_payment_info", {
  user: { firstName, lastName, phone, cpf, email },
  value: pedido.total,
  currency: "BRL",
  transactionId: pedido.id,              // ID interno do pedido (mesmo do webhook)
  paymentMethod: "pix",
  items: pedido.itens,
});`;

  const purchaseFront = `// ⚠️ OPCIONAL — só dispare se o usuário cair numa tela de "Pix confirmado"
// O ideal é deixar o WEBHOOK da Quantum (ver aba ao lado) confirmar o purchase server-side.
import { track } from "@/lib/capitrack";

await track("purchase", {
  user: { firstName, lastName, phone, cpf, email },
  value: pedido.total,
  currency: "BRL",
  transactionId: pedido.id,              // MESMO ID do begin_checkout (deduplica!)
  paymentMethod: "pix",
  items: pedido.itens,
});`;

  return (
    <div className="space-y-4">
      {/* Header com config detectada */}
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            Snippets prontos para seu checkout Lovable
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Snippets pré-preenchidos com seus dados conectados. Nome, telefone, CPF e email são
            <b> hasheados em SHA-256 no navegador</b> antes de sair do site (padrão Meta CAPI).
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="text-[11px]">
              🌐 {cfg.domain}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              📊 GA4 {cfg.ga4Id}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              🎯 {cfg.googleAdsId}
            </Badge>
            <Badge
              variant={cfg.pixelId === "SEU_PIXEL_ID" ? "destructive" : "outline"}
              className="text-[11px]"
            >
              {cfg.pixelId === "SEU_PIXEL_ID"
                ? "⚠️ Pixel Meta não cadastrado"
                : `📘 Pixel ${cfg.pixelId}`}
            </Badge>
            {cfg.hasQuantum && (
              <Badge className="text-[11px] bg-primary/20 text-primary border-primary/40">
                ✅ Quantum Pix conectado
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Helper único */}
      <Card className="glass-card border-border/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" /> 1. Helper único (cole uma vez)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Crie o arquivo <code>src/lib/capitrack.ts</code> no seu projeto Lovable e cole o
            conteúdo abaixo. Toda chamada de evento usa esse helper — sem repetir hash, fbp/fbc,
            UA etc.
          </p>
          <CodeBlock code={helperLib} />
        </CardContent>
      </Card>

      {/* begin_checkout */}
      <Card className="glass-card border-border/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" /> 2. begin_checkout
            <Badge variant="outline" className="text-[10px] ml-1">no botão "Finalizar pedido"</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock code={beginCheckout} />
        </CardContent>
      </Card>

      {/* add_payment_info */}
      <Card className="glass-card border-border/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" /> 3. add_payment_info
            <Badge variant="outline" className="text-[10px] ml-1">quando QR Code Pix aparece</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock code={addPaymentInfo} />
        </CardContent>
      </Card>

      {/* purchase front opcional */}
      <Card className="glass-card border-border/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            4. purchase no front (opcional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock code={purchaseFront} />
        </CardContent>
      </Card>

      {/* Webhook Quantum */}
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Webhook className="w-4 h-4 text-primary" /> 5. Webhook Quantum (Pix pago server-side)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            <b>Forma recomendada</b> para confirmar o <code>purchase</code>. A Quantum chama o
            CapiTrack assim que o Pix é compensado — não depende do navegador do cliente estar
            aberto. Cole esta URL em <b>Quantum → Configurações → Webhooks</b>:
          </p>
          <CodeBlock
            code={`${webhookEndpoint}/quantumpay?workspace_id=${workspace?.id || "SEU_WORKSPACE_ID"}`}
          />
          <div className="rounded-lg bg-accent/10 border border-accent/30 p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1 font-medium text-foreground">
              <Info className="w-3.5 h-3.5" /> Como funciona a deduplicação
            </div>
            <div>
              • Front envia <code>begin_checkout</code> + <code>add_payment_info</code> com o{" "}
              <code>transactionId</code> do pedido
            </div>
            <div>
              • Quantum dispara webhook com o <b>mesmo</b> ID quando confirmar pagamento → vira{" "}
              <code>purchase</code>
            </div>
            <div>
              • CapiTrack une os dois pelo <code>event_id</code> e envia para Meta CAPI / Google Ads
              CAPI / GA4 sem duplicar
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signing Secret */}
      <QuantumWebhookSecret />

      {/* Aviso Pixel ausente */}
      {cfg.pixelId === "SEU_PIXEL_ID" && (
        <Card className="glass-card border-destructive/40">
          <CardContent className="pt-4 text-xs text-muted-foreground">
            ⚠️ Você ainda <b>não cadastrou um Pixel do Meta</b>. Os eventos serão coletados mas não
            serão entregues ao Facebook/Instagram Ads. Cadastre em{" "}
            <b>Configurações → Pixels Meta</b>.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
