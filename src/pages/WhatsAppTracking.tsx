import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, useApiKeys } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MetricCard } from "@/components/MetricCard";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { MessageCircle, Copy, CheckCircle2, Clock, ExternalLink, Code, ShieldCheck } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface WhatsAppClick {
  id: string;
  click_id: string;
  destination_phone: string;
  message_template: string | null;
  page_url: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  status: string;
  created_at: string;
}
interface WhatsAppConversion {
  id: string;
  click_id: string;
  value: number;
  currency: string;
  source: string;
  created_at: string;
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

export default function WhatsAppTracking() {
  const { data: workspace } = useWorkspace();
  const { data: apiKeys } = useApiKeys(workspace?.id);
  const publicKey = apiKeys?.[0]?.public_key || "";
  const qc = useQueryClient();

  const [number, setNumber] = useState("5511999999999");
  const [message, setMessage] = useState("Olá! Tenho interesse, pode me ajudar?");
  const [convertDialog, setConvertDialog] = useState<WhatsAppClick | null>(null);
  const [convertValue, setConvertValue] = useState("");
  const [convertCurrency, setConvertCurrency] = useState<string>(() => localStorage.getItem("wa_convert_currency") || "USD");

  const { data: clicks = [] } = useQuery({
    queryKey: ["wa-clicks", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_clicks")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data || []) as WhatsAppClick[];
    },
  });

  const { data: conversions = [] } = useQuery({
    queryKey: ["wa-conversions", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_conversions")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data || []) as WhatsAppConversion[];
    },
  });

  const stats = useMemo(() => {
    const total = clicks.length;
    const converted = clicks.filter((c) => c.status === "converted").length;
    const revenue = conversions.reduce((sum, c) => sum + Number(c.value || 0), 0);
    const rate = total > 0 ? (converted / total) * 100 : 0;
    return { total, converted, rate, revenue };
  }, [clicks, conversions]);

  const convert = useMutation({
    mutationFn: async ({ click_id, value, currency }: { click_id: string; value: number; currency: string }) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-conversion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": publicKey },
        body: JSON.stringify({ click_id, value, currency, source: "manual" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast.success("Conversão registrada e enviada para Meta/Google");
      qc.invalidateQueries({ queryKey: ["wa-clicks"] });
      qc.invalidateQueries({ queryKey: ["wa-conversions"] });
      setConvertDialog(null);
      setConvertValue("");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  const phoneClean = onlyDigits(number);
  const buttonHtml = `<a href="https://wa.me/${phoneClean}"
   data-capitrack-whatsapp
   data-capitrack-message="${message.replace(/"/g, "&quot;")}"
   style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#25D366;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
  💬 Falar no WhatsApp
</a>`;

  const sdkSnippet = `// Já incluído no SDK do CapiTrack: clique automático em qualquer link wa.me/...
// Para gerar dinamicamente:
capitrack.whatsapp('${phoneClean}', { message: '${message.replace(/'/g, "\\'")}' })
  .then(({ wa_url }) => window.location.href = wa_url);`;

  const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-conversion`;
  const businessWebhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-business-webhook?key=${publicKey}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Rastreie cliques no WhatsApp com atribuição completa — funciona com ou sem Business API
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Cliques" value={stats.total.toLocaleString()} change={0} icon={MessageCircle} />
        <MetricCard title="Conversões" value={stats.converted.toLocaleString()} change={0} icon={CheckCircle2} />
        <MetricCard title="Taxa" value={`${stats.rate.toFixed(1)}%`} change={0} icon={Clock} />
        <MetricCard
          title="Receita atribuída"
          value={`R$ ${stats.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          change={0}
          icon={CheckCircle2}
        />
      </div>

      <Tabs defaultValue="clicks" className="w-full">
        <TabsList>
          <TabsTrigger value="clicks">Cliques</TabsTrigger>
          <TabsTrigger value="generator">Gerador de Botão</TabsTrigger>
          <TabsTrigger value="setup">Setup avançado</TabsTrigger>
        </TabsList>

        <TabsContent value="clicks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Últimos cliques</CardTitle>
              <CardDescription>
                Status, atribuição e ação manual de conversão
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Click ID</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clicks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum clique ainda. Use o gerador de botão para começar.
                      </TableCell>
                    </TableRow>
                  )}
                  {clicks.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.click_id}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(c.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">+{c.destination_phone}</TableCell>
                      <TableCell className="text-xs">
                        {c.utm_source || c.utm_campaign || (c.gclid ? "Google" : c.fbclid ? "Meta" : "Direto")}
                      </TableCell>
                      <TableCell>
                        {c.status === "converted" ? (
                          <Badge className="bg-green-500/15 text-green-500 border-green-500/30">Convertido</Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status !== "converted" && (
                          <Button size="sm" variant="outline" onClick={() => setConvertDialog(c)}>
                            Marcar como vendido
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generator" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gerador de botão WhatsApp</CardTitle>
              <CardDescription>
                Cole o HTML no seu site. O SDK do CapiTrack intercepta o clique automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Número (com DDI)</Label>
                  <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="5511999999999" />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem inicial</Label>
                  <Input value={message} onChange={(e) => setMessage(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider">HTML do botão</Label>
                <Textarea readOnly value={buttonHtml} rows={6} className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={() => { copyToClipboard(buttonHtml); toast.success("Copiado"); }}>
                  <Copy className="w-3.5 h-3.5 mr-2" /> Copiar HTML
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider">Uso programático (SDK)</Label>
                <Textarea readOnly value={sdkSnippet} rows={4} className="font-mono text-xs" />
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Pré-requisito:</strong> SDK do CapiTrack instalado no site (página
                <a href="/sdk-setup" className="text-primary underline ml-1">Instalação SDK</a>). UTMs, gclid e fbclid são capturados automaticamente.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="mt-4 space-y-4">
          <Accordion type="single" collapsible defaultValue="manual">
            <AccordionItem value="manual">
              <AccordionTrigger>
                <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Opção 1 — Manual (mais simples)</span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                Quando fechar uma venda no WhatsApp, abra a aba <strong>Cliques</strong> e clique em
                <em> "Marcar como vendido"</em>. Pronto — disparamos o Purchase para Meta CAPI, Google Ads e GA4
                com a atribuição original do clique.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="webhook">
              <AccordionTrigger>
                <span className="flex items-center gap-2"><Code className="w-4 h-4 text-primary" /> Opção 2 — Webhook genérico (Zapier/n8n/CRM)</span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-3">
                <p>Configure seu CRM ou automação para fazer um POST ao fechar uma venda:</p>
                <pre className="bg-muted/50 p-3 rounded text-xs overflow-x-auto">{`POST ${webhookUrl}
Headers:
  X-Api-Key: ${publicKey || "<sua-chave-pública>"}
  Content-Type: application/json

Body:
{
  "click_id": "CT-XXXXXX",     // ou "ref": "texto contendo CT-XXXXXX"
  "value": 297.00,
  "currency": "BRL",
  "source": "webhook"
}`}</pre>
                <Button size="sm" variant="outline" onClick={() => { copyToClipboard(webhookUrl); toast.success("URL copiada"); }}>
                  <Copy className="w-3.5 h-3.5 mr-2" /> Copiar URL
                </Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="business">
              <AccordionTrigger>
                <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-accent" /> Opção 3 — WhatsApp Business API (automático)</span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-3">
                <p>
                  Se você tem WhatsApp Business Cloud API, configure este webhook no painel da Meta. Ao receber mensagens com
                  <code className="mx-1 px-1 bg-muted rounded">CT-XXXXXX</code> e um valor (ex: <em>"fechado: R$ 297"</em>),
                  a conversão é registrada automaticamente.
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">Callback URL</Label>
                  <Input readOnly value={businessWebhookUrl} className="font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Verify Token</Label>
                  <Input readOnly value={publicKey} className="font-mono text-xs" />
                </div>
                <Button size="sm" variant="outline" asChild>
                  <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks" target="_blank" rel="noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-2" /> Docs Meta
                  </a>
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>

      <Dialog open={!!convertDialog} onOpenChange={(o) => !o && setConvertDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como vendido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Click ID: <span className="font-mono">{convertDialog?.click_id}</span>
            </div>
            <div className="space-y-2">
              <Label>Valor da venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="297.00"
                value={convertValue}
                onChange={(e) => setConvertValue(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => convertDialog && convert.mutate({ click_id: convertDialog.click_id, value: Number(convertValue) || 0 })}
              disabled={convert.isPending}
            >
              {convert.isPending ? "Enviando..." : "Confirmar venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
