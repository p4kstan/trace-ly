import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Wand2, Bot, ListChecks, Sparkles, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateNativeCheckoutPrompt, GATEWAY_META, PAYMENT_META,
  type GatewayId, type PaymentMethod, type NativeCheckoutConfig,
} from "@/lib/native-checkout-prompts";

interface Props {
  publicKey: string;
  endpoint: string;
  supabaseUrl: string;
}

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

const GATEWAYS: GatewayId[] = [
  "quantumpay","asaas","mercadopago","pagarme","stripe","appmax","pagseguro","iugu","efi","custom",
];
const METHODS: PaymentMethod[] = ["pix", "card", "boleto", "subscription"];

export function NativeCheckoutBuilder({ publicKey, endpoint, supabaseUrl }: Props) {
  const [gateway, setGateway] = useState<GatewayId>("quantumpay");
  const [methods, setMethods] = useState<PaymentMethod[]>(["pix", "card"]);
  const [stack, setStack] = useState<NativeCheckoutConfig["stack"]>("react");

  const [code, setCode] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  const wizardPrompt = useMemo(() => generateNativeCheckoutPrompt({
    gateway, methods, publicKey, endpoint, supabaseUrl, stack,
  }), [gateway, methods, publicKey, endpoint, supabaseUrl, stack]);

  const templatePrompt = useMemo(() => generateNativeCheckoutPrompt({
    gateway, methods: METHODS, publicKey, endpoint, supabaseUrl, stack: "unknown",
  }), [gateway, publicKey, endpoint, supabaseUrl]);

  const toggleMethod = (m: PaymentMethod) => {
    setMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const runAi = async () => {
    if (code.trim().length < 30) {
      toast.error("Cole pelo menos um trecho do código do checkout (≥30 caracteres).");
      return;
    }
    setAiLoading(true);
    setAiPrompt("");
    try {
      const { data, error } = await supabase.functions.invoke("checkout-prompt-ai", {
        body: { code, gateway, methods, publicKey, endpoint },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiPrompt(data?.prompt || "");
      toast.success("Prompt customizado gerado pela IA!");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar prompt");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Checkout Nativo — Gerador de prompts
        </CardTitle>
        <CardDescription>
          Para qualquer checkout próprio (PIX, cartão, boleto, assinatura). Escolha um dos 3 modos abaixo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Config compartilhada */}
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="text-xs">Gateway</Label>
            <Select value={gateway} onValueChange={(v) => setGateway(v as GatewayId)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GATEWAYS.map(g => (
                  <SelectItem key={g} value={g}>{GATEWAY_META[g].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Stack do checkout</Label>
            <Select value={stack} onValueChange={(v) => setStack(v as NativeCheckoutConfig["stack"]) }>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="react">React / Vite</SelectItem>
                <SelectItem value="next">Next.js</SelectItem>
                <SelectItem value="vue">Vue / Nuxt</SelectItem>
                <SelectItem value="html">HTML estático</SelectItem>
                <SelectItem value="node-backend">Node backend (sem browser)</SelectItem>
                <SelectItem value="unknown">Não sei</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Métodos ativos</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {METHODS.map(m => (
                <label key={m} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox checked={methods.includes(m)} onCheckedChange={() => toggleMethod(m)} />
                  {PAYMENT_META[m].label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <Tabs defaultValue="wizard">
          <TabsList className="bg-muted/30">
            <TabsTrigger value="wizard">
              <Wand2 className="w-3.5 h-3.5 mr-1" /> Wizard Guiado
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Bot className="w-3.5 h-3.5 mr-1" /> Gerador IA
            </TabsTrigger>
            <TabsTrigger value="template">
              <ListChecks className="w-3.5 h-3.5 mr-1" /> Template Fixo
            </TabsTrigger>
          </TabsList>

          {/* WIZARD */}
          <TabsContent value="wizard" className="mt-4 space-y-3">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription className="text-xs">
                Gera um prompt 100% baseado no que você selecionou acima — métodos específicos
                (PIX/cartão/boleto/assinatura) e estrutura do gateway. Já vem com sua key/endpoint.
              </AlertDescription>
            </Alert>
            {methods.length === 0 ? (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertDescription className="text-xs">
                  Selecione pelo menos um método de pagamento acima.
                </AlertDescription>
              </Alert>
            ) : (
              <CopyableBlock code={wizardPrompt} label="Prompt wizard" />
            )}
          </TabsContent>

          {/* AI */}
          <TabsContent value="ai" className="mt-4 space-y-3">
            <Alert className="border-primary/20 bg-primary/5">
              <Bot className="w-4 h-4" />
              <AlertDescription className="text-xs">
                Cole trechos do código do seu checkout (arquivo de pagamento, criação de cobrança, etc.).
                A IA identifica suas funções/variáveis reais e gera um prompt customizado.
              </AlertDescription>
            </Alert>
            <div>
              <Label className="text-xs">Cole aqui o código do seu checkout (até ~60 mil chars)</Label>
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`Ex: arquivo PaymentForm.tsx, função createPixCharge, etc.\n\nasync function createOrder(items, customer) {\n  const total = items.reduce(...);\n  const charge = await fetch("/api/quantumpay/charge", {...});\n  ...\n}`}
                className="mt-1 font-mono text-xs min-h-[240px]"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {code.length.toLocaleString()} caracteres
              </p>
            </div>
            <Button onClick={runAi} disabled={aiLoading || code.trim().length < 30} className="gap-2">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {aiLoading ? "Analisando código..." : "Gerar prompt com IA"}
            </Button>
            {aiPrompt && (
              <div>
                <Label className="text-xs flex items-center gap-1 mb-2">
                  <Sparkles className="w-3 h-3 text-primary" /> Prompt customizado pela IA
                </Label>
                <CopyableBlock code={aiPrompt} label="Prompt IA" />
              </div>
            )}
          </TabsContent>

          {/* TEMPLATE */}
          <TabsContent value="template" className="mt-4 space-y-3">
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription className="text-xs">
                Template completo do gateway <strong>{GATEWAY_META[gateway].label}</strong> cobrindo
                TODOS os métodos (PIX + cartão + boleto + assinatura). Use quando quer cobertura
                máxima sem precisar pensar nos métodos.
              </AlertDescription>
            </Alert>
            <CopyableBlock code={templatePrompt} label="Template fixo" />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
          <Badge variant="outline" className="text-[10px]">
            Gateway: {GATEWAY_META[gateway].label}
          </Badge>
          {methods.map(m => (
            <Badge key={m} variant="outline" className="text-[10px]">
              {PAYMENT_META[m].label} ({PAYMENT_META[m].flow})
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
