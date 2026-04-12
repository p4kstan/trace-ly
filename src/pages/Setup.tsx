import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, useApiKeys } from "@/hooks/use-tracking-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Copy, ArrowRight, MonitorDot, Key, Globe, Code, Zap } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { generatePublicKey } from "@/lib/key-utils";

export default function Setup() {
  const { data: workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Pixel fields
  const [pixelName, setPixelName] = useState("My Meta Pixel");
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [domain, setDomain] = useState("");

  // Generated
  const [generatedKey, setGeneratedKey] = useState("");
  const [createdPixelId, setCreatedPixelId] = useState("");

  const steps = [
    { title: "Pixel Meta", icon: MonitorDot },
    { title: "Domínio", icon: Globe },
    { title: "API Key", icon: Key },
    { title: "Instalação", icon: Code },
  ];

  const handleCreatePixel = async () => {
    if (!workspace?.id || !pixelId || !accessToken) {
      toast.error("Preencha Pixel ID e Access Token");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("meta_pixels").insert({
      workspace_id: workspace.id,
      pixel_id: pixelId,
      name: pixelName,
      access_token_encrypted: accessToken,
      test_event_code: testEventCode || null,
      is_active: true,
      allow_all_domains: false,
    }).select("id").single();

    if (error) {
      toast.error("Erro ao criar pixel: " + error.message);
    } else {
      setCreatedPixelId(data.id);
      toast.success("Pixel criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["meta-pixels"] });
      setStep(1);
    }
    setLoading(false);
  };

  const handleAddDomain = async () => {
    if (!domain || !createdPixelId) {
      toast.error("Informe um domínio");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("allowed_domains").insert({
      meta_pixel_id: createdPixelId,
      domain: domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Domínio adicionado!");
      setStep(2);
    }
    setLoading(false);
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
      setStep(3);
    }
    setLoading(false);
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const snippet = `<script>
  (function(){
    var ct=window.capitrack=function(){ct.q.push(arguments)};ct.q=[];
    ct("init","${generatedKey}",{endpoint:"${supabaseUrl}/functions/v1/track"});
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

  const finishSetup = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8 animate-fade-in">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center glow-primary mx-auto mb-4">
            <Zap className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold gradient-text">Setup CapiTrack</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure seu tracking em poucos minutos</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground glow-primary" : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i < step ? "bg-success" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="glass-card p-6">
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><MonitorDot className="w-5 h-5 text-primary" /> Cadastrar Pixel Meta</h3>
              <div className="space-y-3">
                <div><Label className="text-foreground">Nome</Label><Input value={pixelName} onChange={e => setPixelName(e.target.value)} /></div>
                <div><Label className="text-foreground">Pixel ID</Label><Input value={pixelId} onChange={e => setPixelId(e.target.value)} placeholder="123456789012345" /></div>
                <div><Label className="text-foreground">Access Token</Label><Input value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAAxxxxxxx..." type="password" /></div>
                <div><Label className="text-foreground">Test Event Code (opcional)</Label><Input value={testEventCode} onChange={e => setTestEventCode(e.target.value)} placeholder="TEST12345" /></div>
              </div>
              <Button onClick={handleCreatePixel} disabled={loading} className="w-full bg-primary text-primary-foreground">
                {loading ? "Salvando..." : "Salvar Pixel"} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <button onClick={() => { setStep(2); }} className="text-muted-foreground text-sm hover:text-foreground block mx-auto">Pular esta etapa</button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /> Domínio Permitido</h3>
              <p className="text-muted-foreground text-sm">Adicione o domínio do seu site para autorizar o envio de eventos.</p>
              <div><Label className="text-foreground">Domínio</Label><Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="meusite.com.br" /></div>
              <Button onClick={handleAddDomain} disabled={loading} className="w-full bg-primary text-primary-foreground">
                {loading ? "Salvando..." : "Adicionar Domínio"} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <button onClick={() => setStep(2)} className="text-muted-foreground text-sm hover:text-foreground block mx-auto">Pular</button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> Gerar API Key</h3>
              <p className="text-muted-foreground text-sm">Crie uma chave pública para autenticar o SDK no seu site.</p>
              {generatedKey ? (
                <div className="bg-muted p-3 rounded-lg font-mono text-sm text-foreground break-all">{generatedKey}</div>
              ) : (
                <Button onClick={handleGenerateKey} disabled={loading} className="w-full bg-primary text-primary-foreground">
                  {loading ? "Gerando..." : "Gerar API Key"} <Key className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Code className="w-5 h-5 text-primary" /> Instalar Snippet</h3>
              <p className="text-muted-foreground text-sm">Cole este código antes do &lt;/head&gt; do seu site.</p>
              <div className="bg-muted p-4 rounded-lg relative">
                <pre className="text-xs text-foreground overflow-x-auto whitespace-pre-wrap font-mono">{snippet}</pre>
                <button onClick={copySnippet} className="absolute top-2 right-2 p-1.5 bg-card rounded hover:bg-accent transition-colors">
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <Button onClick={finishSetup} className="w-full bg-success text-success-foreground hover:bg-success/90">
                <CheckCircle className="w-4 h-4 mr-2" /> Concluir Setup
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
