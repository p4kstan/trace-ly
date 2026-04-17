import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Plus, Trash2, Loader2, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Domain {
  id: string;
  domain: string;
}

function normalize(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // valida algo tipo dominio.com / sub.dominio.com / *.dominio.com
  if (!/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

export function AllowedDomainsManager() {
  const { data: workspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [items, setItems] = useState<Domain[]>([]);
  const [newDomain, setNewDomain] = useState("");

  const load = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("workspace_allowed_domains")
      .select("id, domain")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true });
    setItems((data as Domain[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  const add = async () => {
    if (!workspace?.id) return;
    const clean = normalize(newDomain);
    if (!clean) {
      toast.error("Domínio inválido", { description: "Ex: meusite.com.br ou *.meusite.com" });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("workspace_allowed_domains").insert({
      workspace_id: workspace.id,
      domain: clean,
    });
    setAdding(false);
    if (error) {
      toast.error(
        error.message.includes("duplicate") ? "Esse domínio já está na lista" : "Erro ao adicionar",
        { description: error.message }
      );
      return;
    }
    setNewDomain("");
    toast.success(`✅ ${clean} liberado`);
    load();
  };

  const remove = async (id: string, domain: string) => {
    const { error } = await supabase.from("workspace_allowed_domains").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover", { description: error.message });
      return;
    }
    toast.success(`Removido ${domain}`);
    load();
  };

  const addQuick = (domain: string) => {
    setNewDomain(domain);
    setTimeout(() => add(), 0);
  };

  const suggestions = [
    "lovableproject.com",
    "lovable.app",
  ];

  return (
    <Card className="glass-card border-primary/30">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          7. Domínios autorizados
          <Badge variant="outline" className="ml-1 text-[10px]">
            {items.length} {items.length === 1 ? "domínio" : "domínios"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Sites autorizados a enviar eventos para o CapiTrack com a sua API Key.
          Use <code>*.dominio.com</code> para liberar todos os subdomínios.
          Se a lista estiver vazia, qualquer domínio é aceito (não recomendado em produção).
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="meusite.com.br ou *.meusite.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            disabled={adding}
            className="font-mono text-xs"
          />
          <Button onClick={add} disabled={adding || !newDomain.trim()}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Adicionar</>}
          </Button>
        </div>

        {/* Sugestões rápidas */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] text-muted-foreground self-center mr-1">Sugestões:</span>
          {suggestions
            .filter((s) => !items.some((i) => i.domain === s || i.domain === `*.${s}`))
            .map((s) => (
              <button
                key={s}
                onClick={() => addQuick(`*.${s}`)}
                className="text-[10px] px-2 py-0.5 rounded-md bg-accent/20 hover:bg-accent/40 text-foreground border border-border/40 transition"
              >
                + *.{s}
              </button>
            ))}
        </div>

        {/* Lista */}
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-foreground flex gap-2">
              <Info className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <div>
                <b>Nenhum domínio cadastrado.</b> Atualmente qualquer site com a sua API key consegue enviar eventos.
                Adicione pelo menos o domínio do seu site cliente.
              </div>
            </div>
          ) : (
            items.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-md bg-background/40 border border-border/40 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                  <code className="text-xs font-mono truncate">{d.domain}</code>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(d.id, d.domain)}
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="rounded-lg bg-accent/10 border border-accent/30 p-3 text-[11px] text-muted-foreground">
          ℹ️ A allowlist é validada via header <code>Origin</code> nas chamadas para <code>/track</code>.
          Mudanças levam até 5 min para refletir (cache).
        </div>
      </CardContent>
    </Card>
  );
}
