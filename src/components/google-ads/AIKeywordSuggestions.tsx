/**
 * AIKeywordSuggestions — calls the google-ads-keyword-suggest edge function
 * with the campaign's converting search terms + existing keywords, and lets
 * the user create suggested keywords with a single click (or all at once).
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Plus, Check, X } from "lucide-react";
import type { CampaignEdits } from "@/hooks/api/use-campaign-edits";

interface Suggestion {
  keyword_text: string;
  match_type: "EXACT" | "PHRASE" | "BROAD";
  ad_group_id: string;
  reason: string;
  intent_score: number;
}

interface Props {
  searchTerms: any[] | undefined;
  existingKeywords: any[] | undefined;
  adGroups: { id: string; name: string }[];
  edits: CampaignEdits;
}

export function AIKeywordSuggestions({ searchTerms, existingKeywords, adGroups, edits }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<Set<string>>(new Set());

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-ads-keyword-suggest", {
        body: {
          search_terms: searchTerms || [],
          existing_keywords: (existingKeywords || []).map((k) => ({ name: k.name, ad_group_id: k.ad_group_id })),
          ad_groups: adGroups,
          max_suggestions: 12,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return (data?.suggestions || []) as Suggestion[];
    },
    onSuccess: (data) => {
      setSuggestions(data);
      setDismissed(new Set());
      setCreated(new Set());
      if (data.length === 0) toast.info("Nenhuma sugestão nova encontrada");
      else toast.success(`${data.length} sugestão(ões) geradas`);
    },
    onError: (e: Error) => toast.error(`Falha ao gerar: ${e.message}`),
  });

  const visible = (suggestions || []).filter((s) => !dismissed.has(s.keyword_text));

  const createOne = (s: Suggestion) => {
    edits.createKeyword.mutate(
      { ad_group_id: s.ad_group_id, keyword_text: s.keyword_text, match_type: s.match_type },
      { onSuccess: () => setCreated((prev) => new Set(prev).add(s.keyword_text)) },
    );
  };
  const createAll = () => {
    visible.filter((s) => !created.has(s.keyword_text)).forEach(createOne);
  };

  const noSearchTerms = !searchTerms?.length;

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader className="py-3 flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <div>
            <CardTitle className="text-sm">Sugestões de keywords (IA)</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              A IA analisa os termos pesquisados que estão convertendo e sugere novas palavras-chave.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {visible.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={createAll}
              disabled={edits.createKeyword.isPending}>
              <Plus className="w-3 h-3 mr-1" /> Criar todas
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={() => generate.mutate()}
            disabled={generate.isPending || noSearchTerms}>
            {generate.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
            {suggestions ? "Gerar novamente" : "Gerar sugestões"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {noSearchTerms && (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">
            Sem termos pesquisados para analisar nesta campanha.
          </p>
        )}
        {suggestions && visible.length === 0 && !generate.isPending && (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">
            Nenhuma sugestão pendente. Clique em "Gerar novamente" para repetir a análise.
          </p>
        )}
        {visible.length > 0 && (
          <div className="divide-y divide-border/40">
            {visible.map((s) => {
              const adGroup = adGroups.find((g) => g.id === s.ad_group_id);
              const wasCreated = created.has(s.keyword_text);
              const intentPct = Math.round(s.intent_score * 100);
              return (
                <div key={s.keyword_text} className="p-3 flex items-start gap-3 hover:bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{s.keyword_text}</span>
                      <Badge variant="outline" className="text-[10px]">{s.match_type}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{adGroup?.name || s.ad_group_id}</Badge>
                      <span className={`text-[10px] tabular-nums ${intentPct >= 70 ? "text-emerald-400" : intentPct >= 40 ? "text-amber-400" : "text-muted-foreground"}`}>
                        intenção {intentPct}%
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{s.reason}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {wasCreated ? (
                      <Badge className="h-7 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <Check className="w-3 h-3 mr-1" /> Criada
                      </Badge>
                    ) : (
                      <>
                        <Button size="sm" variant="default" className="h-7 text-xs"
                          onClick={() => createOne(s)} disabled={edits.createKeyword.isPending}>
                          <Plus className="w-3 h-3 mr-1" /> Criar
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setDismissed((p) => new Set(p).add(s.keyword_text))} title="Descartar">
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
