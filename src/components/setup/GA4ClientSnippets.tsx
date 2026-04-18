import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

interface GA4ClientSnippetsProps {
  /** Measurement ID do GA4 (G-XXXXXXXXXX). Se omitido, usa placeholder. */
  measurementId?: string;
  /** Mostra o aviso de redundância no topo */
  showRedundancyNote?: boolean;
}

/**
 * Snippets client-side de GA4 Purchase (DataLayer/GTM e gtag.js direto).
 * Usado como BACKUP/REDUNDÂNCIA do envio server-side via webhook.
 */
export function GA4ClientSnippets({
  measurementId,
  showRedundancyNote = true,
}: GA4ClientSnippetsProps) {
  const mid = measurementId || "G-XXXXXXXXXX";

  const dataLayerSnippet = `<!-- GA4 Purchase via dataLayer (GTM) -->
<script>
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({
    event: "purchase",
    ecommerce: {
      transaction_id: "{{ORDER_ID}}",
      value: {{ORDER_VALUE}},
      currency: "BRL",
      tax: 0,
      shipping: 0,
      coupon: "",
      items: [{
        item_id: "{{PRODUCT_ID}}",
        item_name: "{{PRODUCT_NAME}}",
        price: {{ORDER_VALUE}},
        quantity: 1
      }]
    }
  });
</script>`;

  const gtagSnippet = `<!-- GA4 Purchase via gtag.js direto -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${mid}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${mid}');

  // Dispare ao confirmar o pedido
  gtag('event', 'purchase', {
    transaction_id: "{{ORDER_ID}}",
    value: {{ORDER_VALUE}},
    currency: "BRL",
    items: [{
      item_id: "{{PRODUCT_ID}}",
      item_name: "{{PRODUCT_NAME}}",
      price: {{ORDER_VALUE}},
      quantity: 1
    }]
  });
</script>`;

  return (
    <div className="space-y-4">
      {showRedundancyNote && (
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="w-4 h-4 text-primary" />
          <AlertDescription className="text-xs">
            <strong>Backup / Redundância:</strong> use o mesmo <code className="text-[10px] font-mono">transaction_id</code> do
            webhook server-side para o GA4 deduplicar automaticamente. Garante que a venda seja contabilizada
            mesmo se um dos lados falhar.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="datalayer">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="datalayer">DataLayer (GTM)</TabsTrigger>
          <TabsTrigger value="gtag">gtag.js direto</TabsTrigger>
        </TabsList>

        <TabsContent value="datalayer" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">
            Cole na página de confirmação do pedido. Funciona com qualquer container GTM que tenha tag
            GA4 Purchase configurada.
          </p>
          <CodeBlock code={dataLayerSnippet} />
        </TabsContent>

        <TabsContent value="gtag" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">
            Use se o seu site não tem GTM. Inclui o gtag.js do GA4 e dispara o evento <code className="text-[10px] font-mono">purchase</code>.
          </p>
          <CodeBlock code={gtagSnippet} />
        </TabsContent>
      </Tabs>

      <div className="text-[10px] text-muted-foreground space-y-0.5 pl-1">
        <p>
          <strong>Placeholders:</strong> substitua <code className="font-mono">{"{{ORDER_ID}}"}</code>,{" "}
          <code className="font-mono">{"{{ORDER_VALUE}}"}</code>,{" "}
          <code className="font-mono">{"{{PRODUCT_ID}}"}</code> e{" "}
          <code className="font-mono">{"{{PRODUCT_NAME}}"}</code> pelos valores reais do pedido.
        </p>
      </div>
    </div>
  );
}
