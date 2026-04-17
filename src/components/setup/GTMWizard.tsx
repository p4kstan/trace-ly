import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Download, ExternalLink, Loader2, RefreshCw, Zap } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { downloadGtmContainer } from "@/lib/gtm-container-generator";
import { toast } from "sonner";

interface Props {
  publicKey: string;
  supabaseUrl: string;
  sdkUrl: string;
}

interface ValidationResult {
  connected: boolean;
  total: number;
  events_by_name?: Record<string, number>;
  events_by_source?: Record<string, number>;
  detected?: { sdk_web: boolean; gtm_server: boolean; purchase: boolean; page_view: boolean };
}

const STEPS = [
  { id: 1, title: "Baixar container GTM", desc: "JSON pronto para importar" },
  { id: 2, title: "Importar no GTM", desc: "Tag Manager → Admin → Importar container" },
  { id: 3, title: "Publicar container", desc: "Workspace → Submit → Publish" },
  { id: 4, title: "Validação automática", desc: "Detectamos eventos chegando em tempo real" },
];

export function GTMWizard({ publicKey, supabaseUrl, sdkUrl }: Props) {
  const [completed, setCompleted] = useState<number[]>([]);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const endpoint = `${supabaseUrl}/functions/v1/track`;
  const validateUrl = `${supabaseUrl}/functions/v1/tracking-validate?api_key=${publicKey}&minutes=10`;

  const toggle = (id: number) =>
    setCompleted((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleDownload = () => {
    if (!publicKey || publicKey.startsWith("pk_live_SUA")) {
      toast.error("Crie uma API Key primeiro em 'API Keys'");
      return;
    }
    downloadGtmContainer({ publicKey, endpoint, sdkUrl });
    toast.success("Container baixado! Importe no GTM");
    if (!completed.includes(1)) setCompleted((p) => [...p, 1]);
  };

  const runValidation = async () => {
    setValidating(true);
    try {
      const res = await fetch(validateUrl);
      const data = await res.json();
      setValidation(data);
      if (data.connected) {
        toast.success(`✅ ${data.total} eventos detectados!`);
        if (!completed.includes(4)) setCompleted((p) => [...p, 4]);
      } else {
        toast.message("Nenhum evento ainda. Visite seu site e tente de novo.");
      }
    } catch (e) {
      toast.error("Erro ao validar");
    } finally {
      setValidating(false);
    }
  };

  // Auto-poll validation every 15s when on step 4
  useEffect(() => {
    if (completed.length < 3 || completed.includes(4)) return;
    const interval = setInterval(runValidation, 15000);
    return () => clearInterval(interval);
  }, [completed]);

  const progress = (completed.length / STEPS.length) * 100;

  return (
    <div className="space-y-4">
      {/* Header com progresso */}
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Setup automatizado GTM
            </CardTitle>
            <Badge variant="outline">{completed.length}/{STEPS.length} concluídos</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Passo 1 */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <button onClick={() => toggle(1)} className="mt-1">
                {completed.includes(1) ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              <div>
                <CardTitle className="text-sm">Passo 1 — Baixar container pronto</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Geramos um container GTM com a tag CapiTrack pré-configurada usando sua API Key.
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDownload} className="w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" /> Baixar container .json
          </Button>
        </CardContent>
      </Card>

      {/* Passo 2 */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <button onClick={() => toggle(2)} className="mt-1">
              {completed.includes(2) ? (
                <CheckCircle2 className="w-5 h-5 text-primary" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            <div className="flex-1">
              <CardTitle className="text-sm">Passo 2 — Importar no GTM</CardTitle>
              <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                <li>Acesse <strong>tagmanager.google.com</strong></li>
                <li>Selecione seu container Web</li>
                <li>Vá em <strong>Admin → Importar container</strong></li>
                <li>Escolha o arquivo baixado e <strong>"Mesclar"</strong> com seu workspace</li>
              </ol>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" asChild>
            <a href="https://tagmanager.google.com" target="_blank" rel="noopener">
              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir Tag Manager
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Passo 3 */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <button onClick={() => toggle(3)} className="mt-1">
              {completed.includes(3) ? (
                <CheckCircle2 className="w-5 h-5 text-primary" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            <div className="flex-1">
              <CardTitle className="text-sm">Passo 3 — Publicar container</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                No GTM clique em <strong>Submit</strong> → adicione um nome de versão → <strong>Publish</strong>.
                A tag <em>CapiTrack — Init</em> será carregada em todas as páginas (Initialization - All Pages).
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Passo 4 — Validação ao vivo */}
      <Card className="glass-card border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <button onClick={() => toggle(4)} className="mt-1">
                {completed.includes(4) ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              <div>
                <CardTitle className="text-sm">Passo 4 — Validação automática</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Visite seu site e clique em "Validar". Detectamos eventos dos últimos 10 min.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={runValidation} disabled={validating}>
              {validating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
              Validar agora
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {validation ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Status" value={validation.connected ? "✅ Conectado" : "⏳ Aguardando"} />
                <Stat label="Eventos" value={String(validation.total)} />
                <Stat label="SDK Web" value={validation.detected?.sdk_web ? "✅" : "❌"} />
                <Stat label="GTM Server" value={validation.detected?.gtm_server ? "✅" : "—"} />
              </div>
              {validation.events_by_name && Object.keys(validation.events_by_name).length > 0 && (
                <div className="bg-muted/30 border border-border/30 rounded-lg p-3">
                  <p className="text-xs font-medium mb-2">Eventos recebidos:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(validation.events_by_name).map(([name, count]) => (
                      <Badge key={name} variant="secondary" className="text-xs">
                        {name} <span className="ml-1 opacity-60">×{count}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Clique em "Validar agora" após publicar o container e visitar o site.</p>
          )}
        </CardContent>
      </Card>

      {/* Endpoint manual (caso precise) */}
      <Card className="glass-card border-border/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground">
            Endpoint de validação (uso avançado)
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            Este endpoint é só para <b>diagnóstico</b> — ele <b>não vai no GTM nem no site</b>. Use para auditar via curl, Postman, n8n ou monitoramento externo.
            ⚠️ Contém sua API key pública — não compartilhe.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <CodeBlock code={validateUrl} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={validateUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir no navegador
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={runValidation} disabled={validating}>
              {validating ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1" />
              )}
              Testar agora
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(`curl "${validateUrl}"`);
                toast.success("Comando curl copiado!");
              }}
            >
              Copiar como curl
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 border border-border/30 rounded-lg p-2.5">
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
