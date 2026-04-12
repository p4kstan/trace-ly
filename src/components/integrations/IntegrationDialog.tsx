import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineHelp } from "@/components/InlineHelp";
import { PROVIDER_CONFIGS, getProvidersByCountry } from "@/lib/integration-help-config";
import { CheckCircle, Copy, ExternalLink, AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface IntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { provider: string; name: string; credentials: string; webhookSecret: string; environment: string }) => void;
  isPending: boolean;
  supabaseUrl: string;
  workspaceId: string;
}

export function IntegrationDialog({ open, onOpenChange, onSubmit, isPending, supabaseUrl, workspaceId }: IntegrationDialogProps) {
  const [provider, setProvider] = useState("stripe");
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [environment, setEnvironment] = useState("production");

  const config = PROVIDER_CONFIGS[provider];
  const brProviders = getProvidersByCountry("br");
  const intProviders = getProvidersByCountry("int");

  const reset = () => {
    setName("");
    setCredentials("");
    setWebhookSecret("");
    setEnvironment("production");
  };

  const handleSubmit = () => {
    onSubmit({ provider, name: name || config?.label || provider, credentials, webhookSecret, environment });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
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
          <TabsContent value="br">
            <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto">
              {brProviders.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setProvider(p.value); reset(); }}
                  className={`p-2 rounded-lg border text-center text-xs transition-colors ${provider === p.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground/30"}`}
                >
                  <span className="text-lg block">{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="int">
            <div className="grid grid-cols-3 gap-2 mt-2">
              {intProviders.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setProvider(p.value); reset(); }}
                  className={`p-2 rounded-lg border text-center text-xs transition-colors ${provider === p.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground/30"}`}
                >
                  <span className="text-lg block">{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {config && (
          <div className="space-y-4 mt-2">
            {/* Description */}
            <p className="text-xs text-muted-foreground">{config.description}</p>

            {/* Checklist */}
            {config.checklist.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground mb-2">O que você precisa fazer:</p>
                <ol className="space-y-1.5">
                  {config.checklist.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Name field */}
            <div>
              <Label>Nome interno</Label>
              <Input
                placeholder={`Ex: ${config.label} Produção`}
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Nome para identificar esta integração no painel.</p>
            </div>

            {/* Dynamic fields from config */}
            {config.fields.map(field => (
              <div key={field.key}>
                <div className="flex items-center gap-2">
                  <Label>{field.label}</Label>
                  <Badge variant="outline" className={`text-[10px] ${field.required ? "bg-primary/10 text-primary border-primary/30" : ""}`}>
                    {field.required ? "Obrigatório" : "Opcional"}
                  </Badge>
                </div>
                <Input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={fieldValues[field.key] || ""}
                  onChange={e => fieldSetters[field.key]?.(e.target.value)}
                />
                {field.securityWarning && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
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
              <Label>Ambiente</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Produção</SelectItem>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Generated outputs — "copiar daqui e colar lá" */}
            {config.generatedOutputs.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-primary" />
                  Próximo passo: copiar e cadastrar na plataforma
                </p>
                {config.generatedOutputs.map((out, i) => {
                  const value = out.buildValue({ supabaseUrl, workspaceId, provider, integrationId: "" });
                  return (
                    <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground">{out.label}</p>
                      <p className="text-[11px] text-muted-foreground">{out.helpText}</p>
                      <div className="flex items-center gap-2">
                        <Input readOnly value={value} className="text-xs font-mono bg-muted/50" />
                        <Button variant="outline" size="sm" className="shrink-0" onClick={() => copyValue(value)}>
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

            {/* External docs link */}
            {config.docsLink && (
              <a
                href={config.docsLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                {config.docsLink.label}
              </a>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Criando..." : "Criar Integração"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
