import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineHelp } from "@/components/InlineHelp";
import { PROVIDER_CONFIGS, getProvidersByCountry, type IntegrationType } from "@/lib/integration-help-config";
import { Copy, ExternalLink, AlertTriangle, ChevronRight, Zap, Globe, Key, Webhook, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface IntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { provider: string; name: string; credentials: string; webhookSecret: string; environment: string }) => void;
  isPending: boolean;
  supabaseUrl: string;
  workspaceId: string;
}

const TYPE_META: Record<IntegrationType, { label: string; icon: typeof Key; color: string; desc: string }> = {
  external_api: { label: "API Externa", icon: Key, color: "bg-blue-500/15 text-blue-400 border-blue-500/30", desc: "Você fornece credenciais da plataforma externa" },
  webhook_only: { label: "Webhook Automático", icon: Webhook, color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", desc: "Apenas copie a URL gerada e cadastre na plataforma" },
  hybrid: { label: "Híbrido", icon: Globe, color: "bg-amber-500/15 text-amber-400 border-amber-500/30", desc: "Você fornece credenciais e recebe uma URL de webhook" },
  auto_token: { label: "Token Automático", icon: Zap, color: "bg-purple-500/15 text-purple-400 border-purple-500/30", desc: "Credenciais geradas automaticamente" },
};

const MIN_NAME_LENGTH = 3;

export function IntegrationDialog({ open, onOpenChange, onSubmit, isPending, supabaseUrl, workspaceId }: IntegrationDialogProps) {
  const [provider, setProvider] = useState("stripe");
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [nameError, setNameError] = useState("");

  const config = PROVIDER_CONFIGS[provider];
  const brProviders = getProvidersByCountry("br");
  const intProviders = getProvidersByCountry("int");

  const reset = () => {
    setName("");
    setCredentials("");
    setWebhookSecret("");
    setEnvironment("production");
    setNameError("");
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (trimmedName.length < MIN_NAME_LENGTH) {
      setNameError(`Nome deve ter pelo menos ${MIN_NAME_LENGTH} caracteres`);
      toast.error(`Nome deve ter pelo menos ${MIN_NAME_LENGTH} caracteres`);
      return;
    }
    setNameError("");

    if (config?.integrationType !== "webhook_only") {
      const missingRequired = config?.fields.filter(f => f.required && !fieldValues[f.key]);
      if (missingRequired && missingRequired.length > 0) {
        toast.error(`Preencha o campo obrigatório: ${missingRequired[0].label}`);
        return;
      }
    }
    onSubmit({ provider, name: trimmedName, credentials, webhookSecret, environment });
    reset();
  };

  const copyValue = (val: string) => {
    navigator.clipboard.writeText(val);
    toast.success("Copiado!");
  };

  const fieldValues: Record<string, string> = { credentials, webhookSecret };
  const fieldSetters: Record<string, (v: string) => void> = {
    credentials: setCredentials,
    webhookSecret: setWebhookSecret,
  };

  const typeMeta = config ? TYPE_META[config.integrationType] : null;
  const TypeIcon = typeMeta?.icon || Key;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {config && <span className="text-2xl">{config.emoji}</span>}
            Adicionar Gateway de Pagamento
          </DialogTitle>
        </DialogHeader>

        {/* Provider selector */}
        <Tabs defaultValue="br">
          <TabsList className="w-full">
            <TabsTrigger value="br" className="flex-1">🇧🇷 Brasil ({brProviders.length})</TabsTrigger>
            <TabsTrigger value="int" className="flex-1">🌎 Internacional ({intProviders.length})</TabsTrigger>
          </TabsList>
          {(["br", "int"] as const).map(tab => (
            <TabsContent key={tab} value={tab}>
              <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto pr-1">
                {(tab === "br" ? brProviders : intProviders).map(p => (
                  <button
                    key={p.value}
                    onClick={() => { setProvider(p.value); reset(); }}
                    className={`p-2.5 rounded-lg border text-center text-xs transition-all ${provider === p.value ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30" : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"}`}
                  >
                    <span className="text-lg block mb-0.5">{p.emoji}</span>
                    <span className="truncate block">{p.label}</span>
                  </button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {config && (
          <div className="space-y-4 mt-1">
            {/* Integration type badge */}
            {typeMeta && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[11px] gap-1 px-2 py-0.5 ${typeMeta.color}`}>
                  <TypeIcon className="w-3 h-3" />
                  {typeMeta.label}
                </Badge>
                <span className="text-[11px] text-muted-foreground leading-tight">{typeMeta.desc}</span>
              </div>
            )}

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-relaxed">{config.description}</p>

            {/* Visual step flow */}
            {config.checklist.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground mb-2.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  O que você precisa fazer:
                </p>
                <div className="space-y-0">
                  {config.checklist.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5 relative">
                      {i < config.checklist.length - 1 && (
                        <div className="absolute left-[9px] top-5 w-px h-[calc(100%-4px)] bg-border" />
                      )}
                      <span className="relative z-10 flex-shrink-0 w-[18px] h-[18px] rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs text-foreground/80 leading-relaxed pb-2.5">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Name field — required with validation */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label className="text-xs">Nome interno</Label>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                  Obrigatório
                </Badge>
              </div>
              <Input
                placeholder={`Ex: ${config.label} Principal`}
                value={name}
                onChange={e => { setName(e.target.value); if (nameError) setNameError(""); }}
                className={`${nameError ? "border-destructive ring-1 ring-destructive/30" : ""}`}
              />
              {nameError ? (
                <p className="text-[11px] text-destructive mt-1">{nameError}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">Nome para identificar esta integração no painel (mín. {MIN_NAME_LENGTH} caracteres).</p>
              )}
            </div>

            {/* Webhook-only message */}
            {config.integrationType === "webhook_only" && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-xs font-medium text-emerald-400">Integração automática</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Esta integração não requer credenciais manuais. Basta criar a integração, copiar a URL de webhook gerada abaixo e cadastrar na plataforma.
                </p>
              </div>
            )}

            {/* Dynamic fields from config */}
            {config.fields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-xs">{field.label}</Label>
                  <Badge variant="outline" className={`text-[10px] px-1.5 ${field.required ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground"}`}>
                    {field.required ? "Obrigatório" : "Opcional"}
                  </Badge>
                  {field.direction === "paste_here" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 bg-blue-500/10 text-blue-400 border-blue-500/20 gap-0.5">
                      <ArrowRight className="w-2.5 h-2.5" />
                      Colar aqui
                    </Badge>
                  )}
                </div>
                <Input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={fieldValues[field.key] || ""}
                  onChange={e => fieldSetters[field.key]?.(e.target.value)}
                />
                {field.securityWarning && (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[11px] text-amber-500">{field.securityWarning}</span>
                  </div>
                )}
                {field.help && (
                  <InlineHelp
                    label={field.help.title}
                    steps={field.help.steps.map(text => ({ text }))}
                    note={field.help.note}
                    link={field.help.link}
                  />
                )}
              </div>
            ))}

            {/* Environment */}
            <div>
              <Label className="text-xs">Ambiente</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Produção</SelectItem>
                  <SelectItem value="sandbox">Sandbox / Teste</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Generated outputs */}
            {config.generatedOutputs.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-border">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0" />
                  {config.integrationType === "webhook_only"
                    ? "Copie esta URL e cadastre na plataforma"
                    : "Próximo passo: copiar e cadastrar na plataforma"}
                </p>
                {config.generatedOutputs.map((out, i) => {
                  const value = out.buildValue({ supabaseUrl, workspaceId, provider, integrationId: "" });
                  return (
                    <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-medium text-foreground">{out.label}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-0.5">
                          <Copy className="w-2.5 h-2.5" />
                          Copiar daqui
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{out.helpText}</p>
                      <div className="flex items-center gap-2">
                        <Input readOnly value={value} className="text-xs font-mono bg-muted/50 truncate" />
                        <Button variant="outline" size="sm" className="shrink-0 h-9 w-9 p-0" onClick={() => copyValue(value)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {out.pasteInstructions && out.pasteInstructions.length > 0 && (
                        <InlineHelp
                          label="Onde colar esta URL?"
                          steps={out.pasteInstructions.map(text => ({ text }))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Next Steps block */}
            {config.nextSteps && config.nextSteps.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Após salvar a integração
                </p>
                <ol className="space-y-1.5">
                  {config.nextSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-foreground/80">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* External docs link */}
            {config.docsLink && (
              <a
                href={config.docsLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {config.docsLink.label}
              </a>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Criando..." : "Criar Integração"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
