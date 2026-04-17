import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle, Server, Globe, Layers } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

interface GTMTabProps {
  publicKey: string;
  supabaseUrl: string;
  sdkUrl: string;
}

export function GTMTab({ publicKey, supabaseUrl, sdkUrl }: GTMTabProps) {
  const gtmTrackingEndpoint = `${supabaseUrl}/functions/v1/track`;
  const gtmServerEndpoint = `${supabaseUrl}/functions/v1/gtm-server-events`;

  // ==== Custom HTML Tag (GTM Web) ====
  const gtmCustomHtml = `<!-- CapiTrack AI - GTM Custom HTML Tag -->
<script>
  (function() {
    if (window.capitrack) return; // já carregado
    window.capitrack = window.capitrack || function(){
      (window.capitrack.q = window.capitrack.q || []).push(arguments);
    };
    var s = document.createElement("script");
    s.src = "${sdkUrl}";
    s.async = true;
    document.head.appendChild(s);

    capitrack("init", "${publicKey}", {
      endpoint: "${gtmTrackingEndpoint}",
      debug: false,
      trackSPA: true,
      autoIdentify: true,    // captura email/phone de forms (Enhanced Conversions)
      dataLayerBridge: true, // espelha eventos do dataLayer (GA4 → CapiTrack)
      consentMode: true      // respeita Consent Mode v2
    });
  })();
</script>
<!-- Trigger: All Pages (Initialization - All Pages) -->`;

  // ==== Server-Side GTM (sGTM) Custom Tag Template ====
  const sgtmTagTemplate = `// sGTM Custom Tag - CapiTrack Server Bridge
// Cole no Tag Manager Server-Side (Custom Tag Template ou HTTP Request Tag)

const sendHttpRequest = require('sendHttpRequest');
const getEventData = require('getEventData');
const JSON = require('JSON');
const log = require('logToConsole');

const url = '${gtmServerEndpoint}';
const apiKey = '${publicKey}';

// Coleta dados do GA4 event no sGTM
const eventName = getEventData('event_name');
const clientId = getEventData('client_id');
const userData = getEventData('user_data') || {};
const items = getEventData('items') || [];

const payload = {
  event_name: eventName,
  event_id: getEventData('x-ga-event_id') || getEventData('ga_session_id'),
  client_id: clientId,
  page_location: getEventData('page_location'),
  page_referrer: getEventData('page_referrer'),
  user_data: userData,
  params: {
    value: getEventData('value'),
    currency: getEventData('currency'),
    transaction_id: getEventData('transaction_id'),
    items: items,
    gclid: getEventData('gclid'),
    gbraid: getEventData('gbraid'),
    wbraid: getEventData('wbraid'),
  }
};

sendHttpRequest(url, {
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
  },
  method: 'POST',
  timeout: 5000,
}, JSON.stringify(payload));

data.gtmOnSuccess();`;

  // ==== Consent Mode v2 init ====
  const consentMode = `<!-- Coloque ANTES do snippet do GTM/CapiTrack -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}

  // Estado padrão (recusado até consentimento)
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'wait_for_update': 500
  });
</script>

<!-- Quando usuário aceitar cookies, chame: -->
<script>
  // Após o usuário aceitar no banner LGPD/GDPR
  gtag('consent', 'update', {
    'ad_storage': 'granted',
    'ad_user_data': 'granted',
    'ad_personalization': 'granted',
    'analytics_storage': 'granted'
  });

  // CapiTrack também respeita
  capitrack('consent', 'update', {
    'ad_storage': 'granted',
    'analytics_storage': 'granted'
  });
</script>`;

  // ==== dataLayer events (GA4 ecommerce) ====
  const dataLayerEvents = `// Esses eventos são capturados AUTOMATICAMENTE pelo CapiTrack
// quando dataLayerBridge: true (não precisa duplicar código!)

// Purchase (GA4 Enhanced Ecommerce)
dataLayer.push({
  event: 'purchase',
  ecommerce: {
    transaction_id: 'ORD-12345',
    value: 297.00,
    currency: 'BRL',
    items: [{
      item_id: 'SKU123',
      item_name: 'Produto X',
      price: 297.00,
      quantity: 1
    }]
  }
});

// Add to Cart
dataLayer.push({
  event: 'add_to_cart',
  ecommerce: {
    value: 49.90,
    currency: 'BRL',
    items: [{ item_id: 'SKU456', item_name: 'Produto Y', price: 49.90, quantity: 1 }]
  }
});

// Lead
dataLayer.push({
  event: 'generate_lead',
  email: 'lead@email.com',
  phone: '5511999999999',
  value: 0,
  currency: 'BRL'
});`;

  return (
    <div className="space-y-4">
      {/* Cenários */}
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> Modo Completo: GTM + GA4 + Google Ads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-muted/30 border border-border/30 rounded-lg p-3">
              <Globe className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium mb-1">1. GTM Web</p>
              <p className="text-xs text-muted-foreground">Custom HTML Tag no GTM. Captura eventos client-side com SDK + dataLayer bridge.</p>
            </div>
            <div className="bg-muted/30 border border-border/30 rounded-lg p-3">
              <Server className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium mb-1">2. GTM Server-Side</p>
              <p className="text-xs text-muted-foreground">sGTM no Google Cloud. Bypass de adblockers + qualidade máxima.</p>
            </div>
            <div className="bg-muted/30 border border-border/30 rounded-lg p-3">
              <CheckCircle className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium mb-1">3. Enhanced Conv.</p>
              <p className="text-xs text-muted-foreground">Hash automático SHA-256 de email/phone para Google Ads.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Passos */}
      <Accordion type="single" collapsible defaultValue="step1" className="space-y-2">
        <AccordionItem value="step1" className="glass-card border-border/30 rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/20 text-primary">Passo 1</Badge>
              <span className="font-medium text-sm">Instalar tag no Google Tag Manager (Web)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>No GTM, clique em <strong>Tags → Nova</strong></li>
              <li>Tipo: <strong>HTML personalizado</strong></li>
              <li>Cole o código abaixo</li>
              <li>Acionador: <strong>Initialization - Todas as páginas</strong></li>
              <li>Salve, publique o container</li>
            </ol>
            <CodeBlock code={gtmCustomHtml} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="step2" className="glass-card border-border/30 rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/20 text-primary">Passo 2</Badge>
              <span className="font-medium text-sm">Disparar eventos via dataLayer (GA4 padrão)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Use os <strong>eventos padrão do GA4 Enhanced Ecommerce</strong>. O CapiTrack escuta o
              dataLayer e converte automaticamente para Meta CAPI, Google Ads CAPI e GA4 MP — <strong>sem
              duplicar código</strong>.
            </p>
            <CodeBlock code={dataLayerEvents} />
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
              <strong className="text-primary">Mapeamento automático:</strong> purchase → Purchase, add_to_cart → AddToCart,
              begin_checkout → InitiateCheckout, view_item → ViewContent, generate_lead → Lead, sign_up → CompleteRegistration.
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="step3" className="glass-card border-border/30 rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/20 text-primary">Passo 3</Badge>
              <span className="font-medium text-sm">Server-Side GTM (sGTM) — Opcional, qualidade máxima</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se você tem um <strong>container sGTM rodando</strong> (Google Cloud / App Engine),
              crie uma <strong>HTTP Request Tag</strong> ou <strong>Custom Tag Template</strong> apontando para o endpoint abaixo:
            </p>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Endpoint server-side:</p>
              <code className="block bg-muted/50 px-3 py-2 rounded text-xs font-mono">{gtmServerEndpoint}</code>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Header obrigatório: <code className="bg-muted/50 px-1 rounded">X-Api-Key: {publicKey.substring(0, 16)}...</code>
            </p>
            <CodeBlock code={sgtmTagTemplate} />
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-muted-foreground">
              <strong className="text-amber-500">Vantagens do sGTM:</strong> Bypass de adblockers (~30% dos visitantes),
              first-party cookies, latência menor, dados mais limpos para o algoritmo do Google Ads.
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="step4" className="glass-card border-border/30 rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/20 text-primary">Passo 4</Badge>
              <span className="font-medium text-sm">Consent Mode v2 (LGPD/GDPR)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Para conformidade legal, configure o Consent Mode v2 ANTES do snippet GTM/CapiTrack:
            </p>
            <CodeBlock code={consentMode} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Checklist final */}
      <Card className="glass-card border-emerald-500/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" /> Checklist de qualidade de dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {[
              "SDK CapiTrack instalado via GTM Custom HTML Tag",
              "dataLayer.push para todos os eventos GA4 (purchase, add_to_cart, etc.)",
              "Auto-identify ativo (captura email/phone em forms)",
              "Hash SHA-256 enviado para Google Ads Enhanced Conversions",
              "Consent Mode v2 configurado (se aplicável)",
              "Click IDs capturados: gclid, gbraid, wbraid, fbclid, msclkid",
              "GA4 Client ID sincronizado para deduplicação cross-channel",
              "(Opcional) sGTM rodando para bypass de adblockers",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
