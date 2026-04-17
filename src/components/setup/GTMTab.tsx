import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Zap, Globe, Smartphone, Layers, Server, Shield, Sparkles, ShoppingCart } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { GTMWizard } from "./GTMWizard";
import { GTMMobileTab } from "./GTMMobileTab";
import { DataLayerAdvancedTab } from "./DataLayerAdvancedTab";
import { GTMTemplatesTab } from "./GTMTemplatesTab";
import { CheckoutSnippetsTab } from "./CheckoutSnippetsTab";

interface GTMTabProps {
  publicKey: string;
  supabaseUrl: string;
  sdkUrl: string;
}

export function GTMTab({ publicKey, supabaseUrl, sdkUrl }: GTMTabProps) {
  const gtmServerEndpoint = `${supabaseUrl}/functions/v1/gtm-server-events`;

  const sgtmTagTemplate = `// sGTM HTTP Request Tag — CapiTrack Bridge
const sendHttpRequest = require('sendHttpRequest');
const getEventData = require('getEventData');
const JSON = require('JSON');

const url = '${gtmServerEndpoint}';
const apiKey = '${publicKey}';

const payload = {
  event_name: getEventData('event_name'),
  event_id: getEventData('x-ga-event_id'),
  client_id: getEventData('client_id'),
  page_location: getEventData('page_location'),
  page_referrer: getEventData('page_referrer'),
  user_data: getEventData('user_data') || {},
  params: {
    value: getEventData('value'),
    currency: getEventData('currency'),
    transaction_id: getEventData('transaction_id'),
    items: getEventData('items') || [],
    gclid: getEventData('gclid'),
    gbraid: getEventData('gbraid'),
    wbraid: getEventData('wbraid'),
  }
};

sendHttpRequest(url, {
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
  method: 'POST',
  timeout: 5000,
}, JSON.stringify(payload));

data.gtmOnSuccess();`;

  const consentMode = `<!-- ANTES do snippet GTM/CapiTrack -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'wait_for_update': 500
  });
</script>

<!-- Após o usuário aceitar cookies -->
<script>
  gtag('consent', 'update', {
    'ad_storage': 'granted',
    'ad_user_data': 'granted',
    'ad_personalization': 'granted',
    'analytics_storage': 'granted'
  });
  capitrack('consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted' });
</script>`;

  return (
    <Tabs defaultValue="checkout" className="w-full">
      <TabsList className="grid w-full grid-cols-3 md:grid-cols-7">
        <TabsTrigger value="checkout"><ShoppingCart className="w-3.5 h-3.5 mr-1" /> Checkout</TabsTrigger>
        <TabsTrigger value="templates"><Sparkles className="w-3.5 h-3.5 mr-1" /> Templates</TabsTrigger>
        <TabsTrigger value="wizard"><Zap className="w-3.5 h-3.5 mr-1" /> Wizard</TabsTrigger>
        <TabsTrigger value="datalayer"><Layers className="w-3.5 h-3.5 mr-1" /> dataLayer</TabsTrigger>
        <TabsTrigger value="mobile"><Smartphone className="w-3.5 h-3.5 mr-1" /> Mobile</TabsTrigger>
        <TabsTrigger value="server"><Server className="w-3.5 h-3.5 mr-1" /> sGTM</TabsTrigger>
        <TabsTrigger value="consent"><Shield className="w-3.5 h-3.5 mr-1" /> Consent</TabsTrigger>
      </TabsList>

      <TabsContent value="checkout" className="mt-4">
        <CheckoutSnippetsTab publicKey={publicKey} supabaseUrl={supabaseUrl} />
      </TabsContent>

      <TabsContent value="templates" className="mt-4">
        <GTMTemplatesTab publicKey={publicKey} supabaseUrl={supabaseUrl} />
      </TabsContent>

      <TabsContent value="wizard" className="mt-4">
        <GTMWizard publicKey={publicKey} supabaseUrl={supabaseUrl} sdkUrl={sdkUrl} />
      </TabsContent>

      <TabsContent value="datalayer" className="mt-4">
        <DataLayerAdvancedTab />
      </TabsContent>

      <TabsContent value="mobile" className="mt-4">
        <GTMMobileTab publicKey={publicKey} supabaseUrl={supabaseUrl} />
      </TabsContent>

      <TabsContent value="server" className="mt-4 space-y-4">
        <Card className="glass-card border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" /> Server-Side GTM (sGTM)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se você tem um container sGTM (Google Cloud / App Engine), crie uma <strong>HTTP Request Tag</strong> apontando para:
            </p>
            <code className="block bg-muted/50 px-3 py-2 rounded text-xs font-mono">{gtmServerEndpoint}</code>
            <CodeBlock code={sgtmTagTemplate} />
            <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 text-xs text-muted-foreground">
              <strong>Vantagens:</strong> bypass adblockers (~30% visitantes), first-party cookies, latência menor,
              dados mais limpos para algoritmo Google Ads.
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="consent" className="mt-4 space-y-4">
        <Card className="glass-card border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Consent Mode v2 (LGPD/GDPR)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Conformidade legal: bloqueia cookies/tracking até o usuário aceitar. CapiTrack respeita automaticamente.
            </p>
            <CodeBlock code={consentMode} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
