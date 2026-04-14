import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, ArrowLeft, CheckCircle, ExternalLink,
  Zap, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";

export interface WizardStep {
  title: string;
  subtitle: string;
  explanation: string[];
  tip?: string;
  referenceLinks?: { label: string; url: string }[];
  actionLabel?: string;
  actionRoute?: string;
  copySnippet?: string;
}

interface PlatformWizardProps {
  steps: WizardStep[];
  platformColor: string;
  platformBg: string;
  platformBorder: string;
}

export default function PlatformWizard({ steps, platformColor, platformBg, platformBorder }: PlatformWizardProps) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const step = steps[current];
  const isLast = current === steps.length - 1;
  const allDone = completed.size === steps.length;

  function markAndNext() {
    setCompleted((prev) => new Set(prev).add(current));
    if (!isLast) setCurrent(current + 1);
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copiado!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className="flex items-center gap-1.5 group"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                completed.has(i)
                  ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                  : i === current
                  ? `${platformBg} ${platformColor} ring-1 ${platformBorder}`
                  : "bg-muted/30 text-muted-foreground"
              }`}
            >
              {completed.has(i) ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-6 h-0.5 ${completed.has(i) ? "bg-emerald-500/40" : "bg-border/30"}`} />
            )}
          </button>
        ))}
      </div>

      {/* Current step card */}
      <Card className={`glass-card ring-1 ${platformBorder} ${platformBg}`}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Badge className={`${platformBg} ${platformColor} ${platformBorder} text-[10px] mb-2`}>
                Etapa {current + 1} de {steps.length}
              </Badge>
              <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{step.subtitle}</p>
            </div>
            {completed.has(current) && (
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

          {/* Tip */}
          {step.tip && (
            <div className={`${platformBg} border ${platformBorder} rounded-lg p-3`}>
              <div className="flex items-start gap-2">
                <Zap className={`w-4 h-4 ${platformColor} mt-0.5 shrink-0`} />
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
              <button
                onClick={() => handleCopy(step.copySnippet!)}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </div>
          )}

          {/* Reference links */}
          {step.referenceLinks && step.referenceLinks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {step.referenceLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {/* Action link */}
          {step.actionLabel && step.actionRoute && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-xs"
              onClick={() => navigate(step.actionRoute!)}
            >
              {step.actionLabel} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t border-border/20">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              disabled={current === 0}
              onClick={() => setCurrent(current - 1)}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Anterior
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={markAndNext}
            >
              {completed.has(current) ? (
                isLast ? "✅ Finalizado" : <>Próxima <ArrowRight className="w-3.5 h-3.5" /></>
              ) : (
                isLast ? "Concluir Setup" : <>Concluí esta etapa <ArrowRight className="w-3.5 h-3.5" /></>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* All done */}
      {allDone && (
        <Card className="glass-card border-emerald-500/20 bg-emerald-500/[0.03] animate-fade-in">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-foreground">🎉 Setup completo!</h4>
              <p className="text-xs text-muted-foreground">Todas as etapas foram concluídas. Seus eventos já podem ser rastreados.</p>
            </div>
            <Button size="sm" className="shrink-0 ml-auto gap-1.5 text-xs" onClick={() => navigate("/event-logs")}>
              Ver Event Logs <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
