import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Layers, ShoppingCart, User, Search, Eye, Heart } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

const examples = [
  {
    id: "purchase",
    icon: ShoppingCart,
    title: "Purchase (Compra)",
    map: "purchase → Purchase",
    code: `dataLayer.push({ ecommerce: null });  // limpar evento anterior
dataLayer.push({
  event: 'purchase',
  ecommerce: {
    transaction_id: 'ORD-12345',
    value: 297.00,
    tax: 30.00,
    shipping: 15.00,
    currency: 'BRL',
    coupon: 'BLACK20',
    items: [{
      item_id: 'SKU123',
      item_name: 'Curso Premium',
      affiliation: 'Loja Online',
      coupon: 'BLACK20',
      discount: 50.00,
      index: 0,
      item_brand: 'CapiTrack',
      item_category: 'Educação',
      item_variant: 'Anual',
      price: 297.00,
      quantity: 1
    }]
  }
});`,
  },
  {
    id: "atc",
    icon: Heart,
    title: "Add to Cart",
    map: "add_to_cart → AddToCart",
    code: `dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: 'add_to_cart',
  ecommerce: {
    currency: 'BRL',
    value: 49.90,
    items: [{
      item_id: 'SKU456',
      item_name: 'Camiseta Preta',
      item_category: 'Roupas',
      price: 49.90,
      quantity: 1
    }]
  }
});`,
  },
  {
    id: "view",
    icon: Eye,
    title: "View Item (Visualizar Produto)",
    map: "view_item → ViewContent",
    code: `dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: 'view_item',
  ecommerce: {
    currency: 'BRL',
    value: 49.90,
    items: [{
      item_id: 'SKU456',
      item_name: 'Camiseta Preta',
      item_category: 'Roupas',
      price: 49.90
    }]
  }
});`,
  },
  {
    id: "checkout",
    icon: ShoppingCart,
    title: "Begin Checkout",
    map: "begin_checkout → InitiateCheckout",
    code: `dataLayer.push({ ecommerce: null });
dataLayer.push({
  event: 'begin_checkout',
  ecommerce: {
    currency: 'BRL',
    value: 297.00,
    coupon: 'BLACK20',
    items: [/* mesmo formato dos outros */]
  }
});`,
  },
  {
    id: "search",
    icon: Search,
    title: "Search (Busca)",
    map: "search → Search",
    code: `dataLayer.push({
  event: 'search',
  search_term: 'tênis branco'
});`,
  },
  {
    id: "lead",
    icon: User,
    title: "Generate Lead (com identificação)",
    map: "generate_lead → Lead (Enhanced Conversions)",
    code: `dataLayer.push({
  event: 'generate_lead',
  value: 0,
  currency: 'BRL',
  // user_data → CapiTrack faz hash SHA-256 automático
  user_data: {
    email: 'lead@email.com',
    phone_number: '+5511999999999',
    first_name: 'João',
    last_name: 'Silva'
  }
});`,
  },
  {
    id: "signup",
    icon: User,
    title: "Sign Up / Login",
    map: "sign_up → CompleteRegistration | login → Login",
    code: `dataLayer.push({
  event: 'sign_up',
  method: 'email',
  user_data: { email: 'novo@user.com' }
});

dataLayer.push({
  event: 'login',
  method: 'google',
  user_id: 'user-123'
});`,
  },
  {
    id: "custom",
    icon: Layers,
    title: "Eventos Customizados",
    map: "qualquer_nome → mantido como está",
    code: `// Eventos custom também viram eventos no CapiTrack
dataLayer.push({
  event: 'video_started',
  video_title: 'Tutorial Setup',
  video_duration: 180
});

dataLayer.push({
  event: 'newsletter_signup',
  source: 'footer',
  user_data: { email: 'sub@email.com' }
});`,
  },
];

export function DataLayerAdvancedTab() {
  return (
    <div className="space-y-4">
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> dataLayer — Eventos GA4 Enhanced Ecommerce
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use os eventos padrão do GA4. O CapiTrack escuta o <code className="bg-muted/50 px-1 rounded">dataLayer</code> via
            bridge automático e converte para Meta CAPI, Google Ads CAPI e GA4 MP — <strong>sem duplicar código</strong>.
          </p>
          <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
            💡 <strong>Boa prática:</strong> Sempre faça <code>dataLayer.push(&#123; ecommerce: null &#125;)</code> antes de eventos
            ecommerce para limpar o objeto anterior (recomendação oficial Google).
          </div>
        </CardContent>
      </Card>

      <Accordion type="single" collapsible defaultValue="purchase" className="space-y-2">
        {examples.map((ex) => {
          const Icon = ex.icon;
          return (
            <AccordionItem key={ex.id} value={ex.id} className="glass-card border-border/30 rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{ex.title}</span>
                  <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">{ex.map}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <CodeBlock code={ex.code} />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Card className="glass-card border-border/30">
        <CardHeader>
          <CardTitle className="text-base">Variáveis e Triggers no GTM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Variável de camada de dados:</p>
            <p className="text-xs mt-1">
              No GTM crie variáveis tipo "Data Layer Variable" para cada parâmetro:
              <code className="bg-muted/50 px-1 rounded ml-1">ecommerce.transaction_id</code>,
              <code className="bg-muted/50 px-1 rounded ml-1">ecommerce.value</code>, etc.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Triggers customizados:</p>
            <p className="text-xs mt-1">
              Tipo "Custom Event" → nome do evento exatamente como no <code className="bg-muted/50 px-1 rounded">dataLayer.push</code>
              {" "}(ex: <code className="bg-muted/50 px-1 rounded">purchase</code>, <code className="bg-muted/50 px-1 rounded">add_to_cart</code>).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
