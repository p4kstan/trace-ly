import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Copy, Info, Eye, ShoppingCart, CreditCard, CheckCircle2, UserPlus, Search, Layers } from "lucide-react";

interface Template {
  id: string;
  label: string;
  ga4Event: string;
  capitrackEvent: string;
  description: string;
  whenToFire: string;
  icon: React.ComponentType<{ className?: string }>;
  code: string;
}

const TEMPLATES: Template[] = [
  {
    id: "view_item",
    label: "View Item",
    ga4Event: "view_item",
    capitrackEvent: "ViewContent",
    description: "Quando o usuário visualiza um produto/item.",
    whenToFire: "Dispare na página de detalhe do produto, após carregar os dados.",
    icon: Eye,
    code: `// Compatível GA4 + auto-bridge CapiTrack
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ ecommerce: null }); // limpa estado anterior
window.dataLayer.push({
  event: "view_item",
  ecommerce: {
    currency: "BRL",
    value: 99.90,
    items: [{
      item_id: "SKU_123",
      item_name: "Camiseta Laranja",
      item_category: "Vestuário",
      price: 99.90,
      quantity: 1
    }]
  }
});`,
  },
  {
    id: "add_to_cart",
    label: "Add to Cart",
    ga4Event: "add_to_cart",
    capitrackEvent: "AddToCart",
    description: "Quando o usuário adiciona algo ao carrinho.",
    whenToFire: "No clique do botão 'Adicionar ao carrinho'.",
    icon: ShoppingCart,
    code: `window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ ecommerce: null });
window.dataLayer.push({
  event: "add_to_cart",
  ecommerce: {
    currency: "BRL",
    value: 199.80,
    items: [{
      item_id: "SKU_123",
      item_name: "Camiseta Laranja",
      price: 99.90,
      quantity: 2
    }]
  }
});`,
  },
  {
    id: "begin_checkout",
    label: "Begin Checkout",
    ga4Event: "begin_checkout",
    capitrackEvent: "InitiateCheckout",
    description: "Quando o usuário inicia o processo de checkout.",
    whenToFire: "Ao entrar na página de checkout (não no clique do botão).",
    icon: CreditCard,
    code: `window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ ecommerce: null });
window.dataLayer.push({
  event: "begin_checkout",
  ecommerce: {
    currency: "BRL",
    value: 199.80,
    coupon: "DESC10",
    items: [{
      item_id: "SKU_123",
      item_name: "Camiseta Laranja",
      price: 99.90,
      quantity: 2
    }]
  }
});`,
  },
  {
    id: "add_payment_info",
    label: "Add Payment Info",
    ga4Event: "add_payment_info",
    capitrackEvent: "AddPaymentInfo",
    description: "Quando o usuário escolhe um método de pagamento.",
    whenToFire: "Após selecionar PIX/cartão/boleto, antes de confirmar.",
    icon: CreditCard,
    code: `window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ ecommerce: null });
window.dataLayer.push({
  event: "add_payment_info",
  ecommerce: {
    currency: "BRL",
    value: 199.80,
    payment_type: "pix",
    items: [{
      item_id: "SKU_123",
      item_name: "Camiseta Laranja",
      price: 99.90,
      quantity: 2
    }]
  }
});`,
  },
  {
    id: "purchase",
    label: "Purchase",
    ga4Event: "purchase",
    capitrackEvent: "Purchase",
    description: "Compra finalizada com sucesso. Evento mais importante.",
    whenToFire: "NA PÁGINA de confirmação (thank you page), após pagamento aprovado. Use o mesmo transaction_id que o webhook do gateway envia para deduplicar.",
    icon: CheckCircle2,
    code: `window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ ecommerce: null });
window.dataLayer.push({
  event: "purchase",
  ecommerce: {
    transaction_id: "ORDER_456",   // MESMO id do webhook → dedup automática
    currency: "BRL",
    value: 199.80,
    tax: 0,
    shipping: 15.00,
    coupon: "DESC10",
    items: [{
      item_id: "SKU_123",
      item_name: "Camiseta Laranja",
      price: 99.90,
      quantity: 2
    }]
  },
  // Dados do cliente (CapiTrack hasheia em SHA-256 automaticamente)
  user_data: {
    email: "cliente@email.com",
    phone: "5511999999999",
    first_name: "João",
    last_name: "Silva"
  }
});`,
  },
  {
    id: "generate_lead",
    label: "Generate Lead",
    ga4Event: "generate_lead",
    capitrackEvent: "Lead",
    description: "Quando alguém preenche um formulário/cadastro.",
    whenToFire: "NA PÁGINA de obrigado pós-formulário, não no submit (evita perda no redirect).",
    icon: UserPlus,
    code: `window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: "generate_lead",
  currency: "BRL",
  value: 50.00,
  user_data: {
    email: "lead@email.com",
    phone: "5511999999999"
  }
});`,
  },
  {
    id: "search",
    label: "Search",
    ga4Event: "search",
    capitrackEvent: "Search",
    description: "Quando o usuário faz uma busca interna.",
    whenToFire: "Ao exibir os resultados da busca.",
    icon: Search,
    code: `window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: "search",
  search_term: "camiseta laranja"
});`,
  },
];

function CodeBlock({ code }: { code: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    toast.success("Snippet copiado!");
  };

  return (
    <div className="relative group">
      <pre className="bg-muted/30 border border-border/30 rounded-lg p-4 overflow-x-auto text-xs leading-relaxed max-h-[400px]">
        <code>{code}</code>
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export function DataLayerTemplatesTab() {
  const [activeTab, setActiveTab] = useState(TEMPLATES[0].id);
  const active = TEMPLATES.find((t) => t.id === activeTab) ?? TEMPLATES[0];

  return (
    <div className="space-y-4">
      <Alert className="border-primary/20 bg-primary/5">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-xs">
          O <strong>SDK CapiTrack v4</strong> já tem <strong>auto-bridge do dataLayer ativo por padrão</strong>.
          Basta dar <code className="bg-muted/50 px-1 rounded">window.dataLayer.push(...)</code> com qualquer
          dos eventos abaixo (formato GA4) — o CapiTrack converte e envia para Meta CAPI, Google Ads CAPI, GA4 e
          TikTok automaticamente, sem você precisar duplicar chamadas.
        </AlertDescription>
      </Alert>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Catálogo de Eventos GA4 / Data Layer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-muted/30 flex flex-wrap h-auto">
              {TEMPLATES.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="text-xs">
                  <t.icon className="w-3.5 h-3.5 mr-1" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {TEMPLATES.map((t) => (
              <TabsContent key={t.id} value={t.id} className="space-y-4 mt-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <h3 className="font-medium flex items-center gap-2">
                      <t.icon className="w-4 h-4 text-primary" />
                      {t.label}
                    </h3>
                    <p className="text-sm text-muted-foreground">{t.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      GA4: <code className="ml-1">{t.ga4Event}</code>
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Meta: <code className="ml-1">{t.capitrackEvent}</code>
                    </Badge>
                  </div>
                </div>

                <Alert className="border-amber-500/30 bg-amber-500/5">
                  <Info className="w-4 h-4 text-amber-500" />
                  <AlertDescription className="text-xs">
                    <strong>Quando disparar:</strong> {t.whenToFire}
                  </AlertDescription>
                </Alert>

                <CodeBlock code={t.code} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-sm">📋 Boas práticas (resumo Stape + GA4)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>• Use sempre <code className="bg-muted/50 px-1 rounded">window.dataLayer.push(...)</code> (nunca redeclare como array vazio).</p>
          <p>• <strong>camelCase importa</strong>: o nome correto é <code className="bg-muted/50 px-1 rounded">dataLayer</code> (D maiúsculo no L).</p>
          <p>• Para eventos com pré-redirect (form submit → thank you), <strong>dispare na página de destino</strong>, não antes.</p>
          <p>• Para <code className="bg-muted/50 px-1 rounded">purchase</code>: use o mesmo <code className="bg-muted/50 px-1 rounded">transaction_id</code> do webhook do gateway → dedup automática Meta/Google.</p>
          <p>• Evite renomear eventos existentes — se precisar mudar, crie versionado: <code className="bg-muted/50 px-1 rounded">add_to_cart_v2</code>.</p>
          <p>• Limpe o <code className="bg-muted/50 px-1 rounded">ecommerce</code> antes de cada push novo: <code className="bg-muted/50 px-1 rounded">push({"{"} ecommerce: null {"}"})</code>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
