import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, useApiKeys, useEvents } from "@/hooks/use-tracking-data";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Copy, ArrowRight, ArrowLeft, Key, Code, Zap, Rocket, Building2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { generatePublicKey } from "@/lib/key-utils";

export default function Onboarding() {
  const { user } = useAuth();
  const { data: workspace, isLoading: wsLoading, refetch: refetchWs } = useWorkspace();
  const { data: apiKeys } = useApiKeys(workspace?.id);
  const { data: events } = useEvents(workspace?.id, 5);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");
  const [pollingEvents, setPollingEvents] = useState(false);

  // Auto-advance if workspace already exists
  useEffect(() => {
    if (!wsLoading && workspace && step === 0) {
      setWorkspaceName(workspace.name);
      setStep(1);
    }
  }, [wsLoading, workspace]);

  // Auto-advance if API key exists
  useEffect(() => {
    if (apiKeys && apiKeys.length > 0 && step === 1) {
      setGeneratedKey(apiKeys[0].public_key);
      setStep(2);
    }
  }, [apiKeys]);

  // Poll for first event
  useEffect(() => {
    if (step !== 3 || !pollingEvents) return;
    const interval = setInterval(async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    }, 3000);
    return () => clearInterval(interval);
  }, [step, pollingEvents]);

  // Auto-detect first event
  useEffect(() => {
    if (step === 3 && events && events.length > 0) {
      setPollingEvents(false);
    }
  }, [events, step]);

  const steps = [
    { title: "Workspace", icon: Building2, desc: "Crie seu espaço de trabalho" },
    { title: "API Key", icon: Key, desc: "Gere sua chave de acesso" },
    { title: "Instalar SDK", icon: Code, desc: "Adicione o tracking ao seu site" },
    { title: "Primeiro Evento", icon: Rocket, desc: "Valide que tudo funciona" },
  ];

  const handleCreateWorkspace = async () => {
    if (workspaceName.trim().length < 3) {
      toast.error("Nome deve ter pelo menos 3 caracteres");
      return;
    }
    // Workspace is auto-created on signup via trigger, so just rename it
    if (workspace) {
      setLoading(true);
      const { error } = await supabase
        .from("workspaces")
        .update({ name: workspaceName.trim() })
        .eq("id", workspace.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Workspace atualizado!");
        await refetchWs();
        setStep(1);
      }
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    const pk = generatePublicKey();
    const { error } = await supabase.from("api_keys").insert({
      workspace_id: workspace.id,
      name: "Default Key",
      public_key: pk,
      secret_key_hash: "n/a",
      status: "active",
    });
    if (error) toast.error(error.message);
    else {
      setGeneratedKey(pk);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API Key gerada!");
      setStep(2);
    }
    setLoading(false);
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const snippet = `<script>
  (function(){
    var ct=window.capitrack=function(){ct.q.push(arguments)};ct.q=[];
    ct("init","${generatedKey || "pk_YOUR_KEY"}",{endpoint:"${supabaseUrl}/functions/v1/track"});
    ct("page");
    var s=document.createElement("script");
    s.src="${window.location.origin}/sdk.js";
    s.async=true;
    document.head.appendChild(s);
  })();
</script>`;

  const copySnippet = () => {
    navigator.clipboard.writeText(snippet);
    toast.success("Snippet copiado!");
  };

  const hasFirstEvent = events && events.length > 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center glow-primary mx-auto mb-4">
            <Zap className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold gradient-text">Bem-vindo ao CapiTrack AI</h1>
          <p className="text-muted-foreground text-sm mt-1">Vamos configurar seu tracking em 4 passos</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-1">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <button
                onClick={() => { if (i < step) setStep(i); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  i < step
                    ? "bg-success/10 text-success cursor-pointer hover:bg-success/20"
                    : i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{s.title}</span>
              </button>
              {i < steps.length - 1 && (
                <div className={`w-6 h-0.5 rounded ${i < step ? "bg-success" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <Card className="glass-card">
          <CardContent className="p-6">
            {/* Step 0: Workspace */}
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" /> Criar Workspace
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    O workspace é o espaço onde ficam seus pixels, eventos e integrações.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Nome do Workspace</Label>
                  <Input
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Ex: Minha Empresa"
                    className="text-base"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">Você pode alterar depois nas configurações.</p>
                </div>
                <Button
                  onClick={handleCreateWorkspace}
                  disabled={loading || workspaceName.trim().length < 3}
                  className="w-full"
                >
                  {loading ? "Salvando..." : "Continuar"} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}

            {/* Step 1: API Key */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" /> Gerar API Key
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    A API Key autentica o SDK do seu site com o CapiTrack.
                  </p>
                </div>

                {generatedKey ? (
                  <div className="space-y-3">
                    <div className="bg-muted p-3 rounded-lg font-mono text-sm text-foreground break-all flex items-center justify-between">
                      <span>{generatedKey}</span>
                      <button onClick={() => { navigator.clipboard.writeText(generatedKey); toast.success("Copiado!"); }}>
                        <Copy className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" /> Key gerada com sucesso
                    </Badge>
                    <Button onClick={() => setStep(2)} className="w-full">
                      Continuar <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
                      <p>✅ Workspace: <span className="text-foreground font-medium">{workspace?.name}</span></p>
                      <p>A chave pública será usada no snippet do SDK.</p>
                    </div>
                    <Button onClick={handleGenerateKey} disabled={loading} className="w-full">
                      {loading ? "Gerando..." : "Gerar API Key"} <Key className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                )}

                <button onClick={() => setStep(0)} className="text-muted-foreground text-xs hover:text-foreground flex items-center gap-1 mx-auto">
                  <ArrowLeft className="w-3 h-3" /> Voltar
                </button>
              </div>
            )}

            {/* Step 2: Install SDK */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Code className="w-5 h-5 text-primary" /> Instalar SDK
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Cole este snippet antes do <code className="bg-muted px-1 rounded text-xs">&lt;/head&gt;</code> do seu site.
                  </p>
                </div>

                <div className="bg-muted p-4 rounded-lg relative">
                  <pre className="text-xs text-foreground overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">{snippet}</pre>
                  <button
                    onClick={copySnippet}
                    className="absolute top-2 right-2 p-1.5 bg-card rounded hover:bg-accent transition-colors"
                  >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">💡 Dica</p>
                  <p>Funciona com qualquer site: WordPress, Shopify, HTML, React, etc. Basta colar no HTML.</p>
                </div>

                <Button onClick={() => { setStep(3); setPollingEvents(true); }} className="w-full">
                  Já instalei — verificar <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <button onClick={() => setStep(1)} className="text-muted-foreground text-xs hover:text-foreground flex items-center gap-1 mx-auto">
                  <ArrowLeft className="w-3 h-3" /> Voltar
                </button>
              </div>
            )}

            {/* Step 3: First Event */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-primary" /> Primeiro Evento
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Acesse seu site para disparar o primeiro evento de PageView.
                  </p>
                </div>

                {hasFirstEvent ? (
                  <div className="space-y-4">
                    <div className="bg-success/10 border border-success/20 rounded-lg p-4 text-center">
                      <PartyPopper className="w-10 h-10 text-success mx-auto mb-2" />
                      <p className="text-lg font-bold text-foreground">Evento recebido! 🎉</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Seu tracking está funcionando. Primeiro evento: <span className="font-mono text-foreground">{events[0]?.event_name}</span>
                      </p>
                    </div>
                    <Button onClick={() => navigate("/")} className="w-full bg-success text-success-foreground hover:bg-success/90">
                      <CheckCircle className="w-4 h-4 mr-2" /> Ir para o Dashboard
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-foreground font-medium">Aguardando primeiro evento...</p>
                      <p className="text-xs text-muted-foreground mt-1">Acesse seu site com o SDK instalado</p>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                      <p>📋 Checklist:</p>
                      <p>1. Snippet colado antes do &lt;/head&gt;</p>
                      <p>2. Página carregada no navegador</p>
                      <p>3. Sem bloqueador de anúncios ativo</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button onClick={() => setStep(2)} className="text-muted-foreground text-xs hover:text-foreground flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" /> Voltar
                  </button>
                  <button onClick={() => navigate("/")} className="text-muted-foreground text-xs hover:text-foreground">
                    Pular e ir ao Dashboard →
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Progress */}
        <div className="flex justify-center">
          <span className="text-xs text-muted-foreground">
            Passo {step + 1} de {steps.length} — {steps[step].desc}
          </span>
        </div>
      </div>
    </div>
  );
}
