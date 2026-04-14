import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, ArrowLeft, Server, ExternalLink, Copy, Check, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SERVER_PROVIDERS, type ServerProvider } from "./server-steps";
import type { WizardStep } from "./PlatformWizard";

interface ServerSelectorProps {
  onComplete: () => void;
  completed: boolean;
}

export default function ServerSelector({ onComplete, completed }: ServerSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<ServerProvider | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const step = selectedProvider ? selectedProvider.steps[currentStep] : null;
  const totalSteps = selectedProvider?.steps.length || 0;
  const isLast = currentStep === totalSteps - 1;
  const allDone = selectedProvider && completedSteps.size === totalSteps;

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copiado!");
    setTimeout(() => setCopied(false), 2000);
  }

  function validateInputs(): boolean {
    if (!step?.inputs || step.inputs.length === 0) return true;
    const errors: Record<string, string> = {};
    let valid = true;
    for (const input of step.inputs) {
      const val = (inputValues[input.id] || "").trim();
      if (!val) { errors[input.id] = "Campo obrigatório"; valid = false; }
      else if (input.validation && !input.validation.test(val)) {
        errors[input.id] = input.validationMessage || "Formato inválido"; valid = false;
      }
    }
    setInputErrors(errors);
    return valid;
  }

  function markAndNext() {
    if (!validateInputs()) { toast.error("Preencha todos os campos"); return; }
    const next = new Set(completedSteps);
    next.add(currentStep);
    setCompletedSteps(next);
    if (isLast) {
      onComplete();
      toast.success(`✅ Servidor ${selectedProvider!.name} configurado!`);
    } else {
      setCurrentStep(currentStep + 1);
    }
  }

  function handleInputChange(id: string, value: string) {
    setInputValues((prev) => ({ ...prev, [id]: value }));
    if (inputErrors[id]) setInputErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  if (completed && !selectedProvider) {
    return (
      <Card className="glass-card border-emerald-500/20 bg-emerald-500/[0.03]">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-foreground">Servidor configurado</h4>
            <p className="text-xs text-muted-foreground">Prossiga com a configuração da plataforma abaixo.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Provider selection
  if (!selectedProvider) {
    return (
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Escolha seu servidor</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Onde seus eventos serão recebidos e processados antes de serem enviados para as plataformas.
          </p>

          <div className="grid gap-2">
            {SERVER_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setSelectedProvider(provider)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all text-left group"
              >
                <span className="text-xl">{provider.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                    {provider.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{provider.description}</p>
                </div>
                <Badge variant="outline" className="text-[9px] shrink-0">
                  {provider.steps.length} {provider.steps.length === 1 ? "etapa" : "etapas"}
                </Badge>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Provider wizard steps
  return (
    <div className="space-y-4">
      {/* Back to selection + progress */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-7 px-2" onClick={() => { setSelectedProvider(null); setCurrentStep(0); setCompletedSteps(new Set()); }}>
          <ArrowLeft className="w-3 h-3" /> Trocar servidor
        </Button>
        <Badge variant="outline" className="text-[10px] gap-1">
          <span>{selectedProvider.icon}</span> {selectedProvider.name}
        </Badge>
        {totalSteps > 1 && (
          <div className="flex items-center gap-1 ml-auto">
            {selectedProvider.steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${completedSteps.has(i) ? "bg-emerald-400" : i === currentStep ? "bg-primary" : "bg-muted-foreground/30"}`} />
            ))}
          </div>
        )}
      </div>

      {/* Step card */}
      {step && (
        <Card className="glass-card ring-1 ring-primary/20 bg-primary/[0.03]">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] mb-2">
                  Servidor — Etapa {currentStep + 1} de {totalSteps}
                </Badge>
                <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{step.subtitle}</p>
              </div>
              {completedSteps.has(currentStep) && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                  <CheckCircle className="w-3 h-3 mr-1" /> Concluído
                </Badge>
              )}
            </div>

            {/* Explanation */}
            <div className="space-y-2.5">
              {step.explanation.map((text, i) => (
                <div key={i}>
                  {text.startsWith("```") ? (
                    <pre className="bg-muted/30 border border-border/30 rounded-lg p-3 text-[11px] font-mono text-foreground overflow-x-auto leading-relaxed">
                      {text.replace(/```\w*\n?/g, "").replace(/```$/g, "")}
                    </pre>
                  ) : text.startsWith("•") || text.startsWith("-") ? (
                    <p className="text-xs text-muted-foreground leading-relaxed pl-3">{text}</p>
                  ) : text.startsWith("**") ? (
                    <p className="text-xs text-foreground font-semibold leading-relaxed">{text.replace(/\*\*/g, "")}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Inputs */}
            {step.inputs && step.inputs.length > 0 && (
              <div className="space-y-3 p-4 rounded-lg bg-muted/20 border border-border/30">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">📝 Preencha para continuar</p>
                {step.inputs.map((input) => (
                  <div key={input.id} className="space-y-1.5">
                    <Label htmlFor={input.id} className="text-xs text-muted-foreground">{input.label}</Label>
                    <Input
                      id={input.id}
                      type={input.type || "text"}
                      placeholder={input.placeholder}
                      value={inputValues[input.id] || ""}
                      onChange={(e) => handleInputChange(input.id, e.target.value)}
                      className={`h-9 text-xs bg-background/50 ${inputErrors[input.id] ? "border-destructive ring-1 ring-destructive/30" : ""}`}
                    />
                    {input.helpText && !inputErrors[input.id] && <p className="text-[10px] text-muted-foreground">{input.helpText}</p>}
                    {inputErrors[input.id] && <p className="text-[10px] text-destructive">{inputErrors[input.id]}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Tip */}
            {step.tip && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">Dica: </span>{step.tip}
                  </p>
                </div>
              </div>
            )}

            {/* Copy snippet */}
            {step.copySnippet && (
              <div className="relative">
                <pre className="bg-muted/30 border border-border/30 rounded-lg p-3 pr-10 text-[11px] font-mono text-foreground overflow-x-auto leading-relaxed">
                  {step.copySnippet}
                </pre>
                <button onClick={() => handleCopy(step.copySnippet!)} className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
            )}

            {/* Reference links */}
            {step.referenceLinks && step.referenceLinks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {step.referenceLinks.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    {link.label}
                  </a>
                ))}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2 border-t border-border/20">
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs" disabled={currentStep === 0} onClick={() => setCurrentStep(currentStep - 1)}>
                <ArrowLeft className="w-3.5 h-3.5" /> Anterior
              </Button>
              <Button size="sm" className="gap-1.5 text-xs" onClick={markAndNext}>
                {completedSteps.has(currentStep) ? (
                  isLast ? "✅ Servidor Configurado" : <>Próxima <ArrowRight className="w-3.5 h-3.5" /></>
                ) : (
                  isLast ? "Concluir Setup do Servidor" : <>Concluí esta etapa <ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All done */}
      {allDone && (
        <Card className="glass-card border-emerald-500/20 bg-emerald-500/[0.03] animate-fade-in">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-foreground">🎉 Servidor pronto!</h4>
              <p className="text-xs text-muted-foreground">Agora configure a plataforma de destino abaixo.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
