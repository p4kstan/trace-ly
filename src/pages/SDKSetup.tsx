import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, CheckCircle, Code, Terminal, Zap, Globe } from "lucide-react";

function CodeBlock({ code, language = "html" }: { code: string; language?: string }) {
  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  return (
    <div className="relative group">
      <pre className="bg-muted/30 border border-border/30 rounded-lg p-4 overflow-x-auto text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copyCode}
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function SDKSetup() {
  const { data: workspace } = useWorkspace();

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["api-keys-setup", workspace?.id],
    enabled: !!workspace?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("id, name, public_key, status")
        .eq("workspace_id", workspace!.id)
        .eq("status", "active")
        .limit(5);
      return data || [];
    },
  });

  const publicKey = apiKeys[0]?.public_key || "pk_live_SUA_CHAVE_AQUI";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://seu-projeto.supabase.co";

  const snippetHTML = `<!-- CapiTrack AI SDK -->
<script>
  !function(){
    window.capitrack = window.capitrack || function(){
      (window.capitrack.q = window.capitrack.q || []).push(arguments);
    };
    var s = document.createElement("script");
    s.src = "${supabaseUrl}/functions/v1/track/../../../sdk.js";
    s.async = true;
    document.head.appendChild(s);
  }();

  capitrack("init", "${publicKey}", {
    endpoint: "${supabaseUrl}/functions/v1/track",
    debug: false
  });
</script>`;

  const snippetTrack = `// Rastrear evento personalizado
capitrack("track", "Purchase", {
  value: 297.00,
  currency: "BRL",
  email: "cliente@email.com"
});

// Rastrear PageView manualmente
capitrack("page");

// Identificar usuário
capitrack("identify", {
  email: "cliente@email.com",
  phone: "5511999999999",
  name: "João Silva"
});`;

  const snippetEcommerce = `// AddToCart
capitrack("addToCart", {
  value: 49.90,
  currency: "BRL",
  content_name: "Produto X"
});

// InitiateCheckout
capitrack("initiateCheckout", {
  value: 297.00,
  currency: "BRL",
  num_items: 3
});

// Purchase
capitrack("purchase", {
  value: 297.00,
  currency: "BRL",
  order_id: "ORD-12345"
});

// Lead
capitrack("lead", {
  email: "lead@email.com",
  phone: "5511999999999"
});`;

  const snippetServerSide = `// Server-to-server (Node.js example)
const response = await fetch("${supabaseUrl}/functions/v1/track", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": "${publicKey}"
  },
  body: JSON.stringify({
    event_name: "Purchase",
    event_id: "unique-event-id",
    source: "server",
    action_source: "website",
    url: "https://meusite.com/checkout",
    user_data: {
      email: "cliente@email.com",
      phone: "5511999999999"
    },
    custom_data: {
      value: 297.00,
      currency: "BRL"
    },
    utm_source: "facebook",
    utm_campaign: "campanha_x"
  })
});`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">SDK Setup</h1>
        <p className="text-sm text-muted-foreground">
          Instale o SDK do CapiTrack AI no seu site para começar a coletar eventos
        </p>
      </div>

      {/* Status */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">API Key</p>
              <Badge variant={apiKeys.length > 0 ? "default" : "destructive"}>
                {apiKeys.length > 0 ? "Configurada" : "Não configurada"}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Endpoint</p>
              <Badge variant="default">Ativo</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Code className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">SDK</p>
              <Badge variant="default">v2.0</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Public Key */}
      {apiKeys.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Sua Public Key</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="bg-muted/50 px-3 py-2 rounded-lg text-sm flex-1 font-mono">{publicKey}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigator.clipboard.writeText(publicKey); toast.success("Copiada!"); }}
              >
                <Copy className="w-4 h-4 mr-1" /> Copiar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Code Snippets */}
      <Tabs defaultValue="install">
        <TabsList className="bg-muted/30">
          <TabsTrigger value="install">Instalação</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="ecommerce">E-commerce</TabsTrigger>
          <TabsTrigger value="server">Server-Side</TabsTrigger>
        </TabsList>

        <TabsContent value="install" className="space-y-4 mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="w-4 h-4" /> Snippet de Instalação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cole este código antes do <code className="bg-muted/50 px-1 rounded">&lt;/head&gt;</code> do seu site:
              </p>
              <CodeBlock code={snippetHTML} />
              <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  O SDK captura automaticamente: PageView, UTMs (utm_source, utm_medium, etc.), 
                  click IDs (fbclid, gclid, ttclid), fbp/fbc, fingerprint, session e anonymous ID.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Rastreamento de Eventos</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={snippetTrack} language="javascript" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ecommerce" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Eventos E-commerce</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={snippetEcommerce} language="javascript" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="server" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Integração Server-to-Server</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Use o endpoint de coleta diretamente para enviar eventos do seu backend:
              </p>
              <CodeBlock code={snippetServerSide} language="javascript" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
