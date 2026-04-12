import { useState } from "react";
import { ChevronDown, Copy, Check, ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Step {
  text: string;
}

interface InlineHelpProps {
  label: string;
  steps?: Step[];
  note?: string;
  snippet?: string;
  link?: { url: string; label: string };
  cards?: { title: string; steps: string[] }[];
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copiado!");
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

export function InlineHelp({ label, steps, note, snippet, link, cards }: InlineHelpProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors group"
      >
        <Info className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
        <span>{label}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-3 animate-fade-in">
          {note && (
            <p className="text-xs text-muted-foreground leading-relaxed">{note}</p>
          )}

          {steps && (
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs text-foreground/80 leading-relaxed">{s.text}</span>
                </li>
              ))}
            </ol>
          )}

          {snippet && (
            <div className="rounded-md border border-border bg-muted/50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1 border-b border-border">
                <span className="text-[10px] font-mono text-muted-foreground">endpoint</span>
                <CopyBtn text={snippet} />
              </div>
              <pre className="p-2.5 text-[11px] font-mono text-foreground/85 overflow-x-auto whitespace-pre-wrap break-all">{snippet}</pre>
            </div>
          )}

          {cards && (
            <div className="grid gap-2 sm:grid-cols-2">
              {cards.map((c) => (
                <div key={c.title} className="rounded-md border border-border bg-card p-2.5">
                  <p className="text-xs font-medium text-foreground mb-1.5">{c.title}</p>
                  <ol className="space-y-1">
                    {c.steps.map((s, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary font-semibold">{i + 1}.</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {link && (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              {link.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
