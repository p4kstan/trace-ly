import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Tag, Layers, X, Plus } from "lucide-react";

export type RoutingMode = "all" | "domain" | "tag";

export interface RoutingRules {
  routing_mode: RoutingMode;
  routing_domains: string[];
  routing_tags: string[];
}

interface Props {
  value: RoutingRules;
  onChange: (next: RoutingRules) => void;
  disabled?: boolean;
}

const MODE_OPTS: { id: RoutingMode; label: string; desc: string; icon: any }[] = [
  { id: "all", label: "Todos eventos", desc: "Recebe tudo (padrão)", icon: Layers },
  { id: "domain", label: "Por domínio", desc: "Filtra por URL do site", icon: Globe },
  { id: "tag", label: "Por tag", desc: "Filtra por account_tag no SDK", icon: Tag },
];

export default function RoutingRulesEditor({ value, onChange, disabled }: Props) {
  const [domainInput, setDomainInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  const addDomain = () => {
    const d = domainInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d || value.routing_domains.includes(d)) return;
    onChange({ ...value, routing_domains: [...value.routing_domains, d] });
    setDomainInput("");
  };
  const removeDomain = (d: string) =>
    onChange({ ...value, routing_domains: value.routing_domains.filter((x) => x !== d) });

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || value.routing_tags.includes(t)) return;
    onChange({ ...value, routing_tags: [...value.routing_tags, t] });
    setTagInput("");
  };
  const removeTag = (t: string) =>
    onChange({ ...value, routing_tags: value.routing_tags.filter((x) => x !== t) });

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs mb-2 block">Modo de roteamento</Label>
        <div className="grid grid-cols-3 gap-2">
          {MODE_OPTS.map((m) => {
            const active = value.routing_mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, routing_mode: m.id })}
                className={`text-left rounded-lg border p-2.5 transition-all ${
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/40 bg-muted/20 hover:bg-muted/40"
                } disabled:opacity-50`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <m.icon className={`w-3.5 h-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-medium ${active ? "text-primary" : "text-foreground"}`}>
                    {m.label}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {value.routing_mode === "domain" && (
        <div className="space-y-2">
          <Label className="text-xs">Domínios autorizados</Label>
          <div className="flex gap-2">
            <Input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDomain())}
              placeholder="exemplo.com.br"
              disabled={disabled}
              className="text-sm"
            />
            <Button type="button" size="sm" variant="secondary" onClick={addDomain} disabled={disabled}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {value.routing_domains.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.routing_domains.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1">
                  {d}
                  <button onClick={() => removeDomain(d)} disabled={disabled} className="hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">Subdomínios incluídos automaticamente.</p>
        </div>
      )}

      {value.routing_mode === "tag" && (
        <div className="space-y-2">
          <Label className="text-xs">Tags (envie account_tag no payload do evento)</Label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              placeholder="produto-a"
              disabled={disabled}
              className="text-sm"
            />
            <Button type="button" size="sm" variant="secondary" onClick={addTag} disabled={disabled}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {value.routing_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.routing_tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button onClick={() => removeTag(t)} disabled={disabled} className="hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
