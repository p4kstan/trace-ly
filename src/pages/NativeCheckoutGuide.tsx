import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/setup/CodeBlock";
import { CheckCircle2, Info, ShieldCheck, Zap } from "lucide-react";

const FRONT_CAPTURE = `<!-- 1. Coloque ANTES do </head> em TODAS as páginas (home + checkout) -->
<script>
(function () {
  // Lê parâmetros da URL e salva em cookie por 90 dias
  var p = new URLSearchParams(location.search);
  var keys = ["gclid","gbraid","wbraid","fbclid","ttclid",
              "utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
  keys.forEach(function (k) {
    var v = p.get(k);
    if (v) document.cookie = "ct_" + k + "=" + encodeURIComponent(v) +
      "; path=/; max-age=" + (60*60*24*90) + "; SameSite=Lax";
  });
})();
</script>

<!-- 2. SDK CapiTrack (já instalado por você) -->
<script src="https://SEU-PROJETO.supabase.co/functions/v1/sdk.js" async></script>
<script>
  window.capitrack = window.capitrack || function(){(capitrack.q=capitrack.q||[]).push(arguments)};
  capitrack("init", "SUA_PUBLIC_KEY", { trackSPA: true, autoIdentify: true });
</script>`;

const READ_TRACKING = `// utils/tracking.js — use no seu checkout pra montar o objeto de tracking
export function readTracking() {
  const c = Object.fromEntries(
    document.cookie.split("; ").map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
    }).filter(([k]) => k)
  );
  const get = (k) => c["ct_" + k] || new URLSearchParams(location.search).get(k) || null;

  return {
    // Click IDs
    gclid: get("gclid"),
    gbraid: get("gbraid"),
    wbraid: get("wbraid"),
    fbclid: get("fbclid"),
    ttclid: get("ttclid"),
    // Cookies do Pixel Meta (setados pelo fbq automaticamente)
    fbp: c._fbp || null,
    fbc: c._fbc || null,
    // UTMs
    utm_source: get("utm_source"),
    utm_medium: get("utm_medium"),
    utm_campaign: get("utm_campaign"),
    utm_content: get("utm_content"),
    utm_term: get("utm_term"),
    // Página
    landing_page: sessionStorage.getItem("ct_landing") || location.href,
    referrer: document.referrer || null,
    user_agent: navigator.userAgent,
  };
}`;

const QUANTUM_API = `// 3. Ao criar o PIX no QuantumPay (no SEU backend ou frontend),
//    inclua o bloco metadata com tracking + dados do cliente.

import { readTracking } from "./utils/tracking";

async function createPixOrder({ items, total, customer }) {
  const tracking = readTracking(); // chamada NO BROWSER

  const body = {
    amount: Math.round(total * 100),                  // centavos
    externalReference: "EV-" + Date.now(),

    // ⬇⬇⬇ ISSO é o que faz a venda ser registrada no Google Ads / Meta CAPI ⬇⬇⬇
    metadata: {
      // Dados do cliente (essenciais p/ Enhanced Conversions)
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        document: customer.document,
      },
      // Tracking completo
      ...tracking,
      // Sua referência interna
      orderCode: "EV-" + Date.now(),
    },
  };

  const r = await fetch("https://api.quantumpay.com.br/v1/charges", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + QUANTUM_TOKEN },
    body: JSON.stringify(body),
  });
  return r.json();
}`;

const FIRE_PURCHASE = `// 4. ASSIM QUE o PIX for confirmado (callback do seu backend OU
//    polling do status no checkout), dispare o Purchase no CapiTrack.
//    Isso garante envio para Google Ads / Meta / TikTok / GA4 mesmo se o
//    webhook do QuantumPay não trouxer tracking.

import { readTracking } from "./utils/tracking";

async function onPaymentConfirmed(order) {
  const tracking = readTracking();

  // Opção A — via SDK (browser)
  window.capitrack("track", "Purchase", {
    event_id: order.id,                      // mesmo ID do webhook = dedup automática
    value: order.total,
    currency: "BRL",
    order_id: order.id,
    email: order.customer.email,             // hasheado SHA-256 no backend
    phone: order.customer.phone,
    ...tracking,
  });

  // Opção B — via fetch direto (server-side, mais confiável)
  await fetch("https://SEU-PROJETO.supabase.co/functions/v1/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "SUA_PUBLIC_KEY",
    },
    body: JSON.stringify({
      event_name: "Purchase",
      event_id: order.id,
      value: order.total,
      currency: "BRL",
      email: order.customer.email,
      phone: order.customer.phone,
      external_id: order.customer.document,
      ...tracking,
      action_source: "website",
      url: location.href,
    }),
  });
}`;

const META_EXAMPLE = `{
  "event": "transaction_paid",
  "transaction": {
    "id": "cmo4dmv0l005x1b5a2bwlh6h8",
    "amount": 3089,
    "status": "paid",
    "externalReference": "EV-20260418-E50D4429",
    "metadata": {
      "customer": {
        "name": "Raquel Tomé da Silva",
        "email": "tome.raquel23@gmail.com",
        "phone": "5585999338988",
        "document": "04100647344"
      },
      "gclid": "Cj0KCQjw...",
      "fbclid": "IwAR1abc...",
      "fbp": "fb.1.1234.5678",
      "fbc": "fb.1.1234.IwAR1abc",
      "utm_source": "google",
      "utm_medium": "cpc",
      "utm_campaign": "marmita-fortaleza",
      "landing_page": "https://casadamarmita.com/?gclid=...",
      "user_agent": "Mozilla/5.0...",
      "orderCode": "EV-20260418-E50D4429"
    }
  }
}`;

export default function NativeCheckoutGuide() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/40 text-primary">
            <ShieldCheck className="w-3 h-3 mr-1" /> Checkout nativo
          </Badge>
          <Badge variant="outline">QuantumPay PIX</Badge>
        </div>
        <h1 className="text-3xl font-bold text-gradient-primary mt-2">
          Capturar tracking no checkout próprio
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Guia para garantir que toda venda PIX dispare <code className="text-primary">Purchase</code> no
          Google Ads, Meta CAPI, TikTok e GA4 — mesmo quando o webhook do gateway vem sem tracking.
        </p>
      </div>

      <Alert className="border-amber-500/30 bg-amber-500/5">
        <Info className="h-4 w-4 text-amber-500" />
        <AlertTitle>Por que isso importa</AlertTitle>
        <AlertDescription className="text-sm">
          Hoje a Google Ads CAPI rejeita conversões que chegam <strong>sem gclid e sem email/telefone</strong>.
          Quando seu checkout não passa esses dados pra QuantumPay, o webhook chega "limpo" e a venda
          vai pra <em>dead letter</em>. Esse fluxo de 4 passos resolve.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="step1">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="step1">1. Capturar</TabsTrigger>
          <TabsTrigger value="step2">2. Ler</TabsTrigger>
          <TabsTrigger value="step3">3. Enviar p/ QuantumPay</TabsTrigger>
          <TabsTrigger value="step4">4. Disparar Purchase</TabsTrigger>
        </TabsList>

        <TabsContent value="step1" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Capturar gclid/UTMs/_fbp na entrada do site
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Coloque esse snippet no <code>&lt;head&gt;</code> do seu site (não só do checkout —
                precisa ser na primeira página em que o usuário cair).
              </p>
              <CodeBlock code={FRONT_CAPTURE} language="html" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="step2" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Helper para ler tudo no checkout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Função utilitária que junta cookies <code>ct_*</code>, <code>_fbp</code>, <code>_fbc</code> e UTMs.
              </p>
              <CodeBlock code={READ_TRACKING} language="javascript" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="step3" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Enviar tracking no metadata da QuantumPay</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ao criar a cobrança PIX, mande tudo dentro de <code className="text-primary">metadata</code>.
                O webhook da CapiTrack já lê esses campos automaticamente.
              </p>
              <CodeBlock code={QUANTUM_API} language="javascript" />

              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground tracking-wide">
                  Exemplo do payload completo que o QuantumPay deve devolver no webhook:
                </p>
                <CodeBlock code={META_EXAMPLE} language="json" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="step4" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Disparar Purchase quando o PIX for pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Camada redundante — funciona mesmo se o webhook atrasar ou falhar. Use o mesmo
                <code className="mx-1 text-primary">event_id</code> do pedido pra deduplicar.
              </p>
              <CodeBlock code={FIRE_PURCHASE} language="javascript" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="glass-card border-emerald-500/30">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold">Como validar que está funcionando</h3>
          </div>
          <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
            <li>Acesse seu site com <code>?gclid=TESTE123&utm_source=google</code> na URL.</li>
            <li>Faça uma compra PIX de teste.</li>
            <li>Vá em <strong>Pedidos</strong> e abra essa venda — os campos <code>gclid</code>, <code>utm_source</code>, <code>email</code> devem aparecer preenchidos.</li>
            <li>Vá em <strong>Monitor de Fila</strong> — o status deve ser <em>processed</em> (não dead_letter).</li>
            <li>No Google Ads, abra o conversion action e veja o card "Recebida" subir.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
