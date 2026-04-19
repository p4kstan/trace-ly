/**
 * ConversionDistribution — Search Impression Share + Conversion Actions
 * tabs content for the Google Ads Campaign Detail page.
 */
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignDataTable as SimpleTable } from "@/components/dashboard/CampaignDataTable";
import { cn } from "@/lib/utils";

const fmtPct = (n: number): string => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

interface QueryLike<T = unknown> {
  isLoading: boolean;
  data?: { rows?: T[] } | undefined;
}

interface QualityRow {
  search_impression_share?: number | null;
  search_top_impression_share?: number | null;
  search_absolute_top_impression_share?: number | null;
  search_budget_lost_impression_share?: number | null;
  search_rank_lost_impression_share?: number | null;
  search_budget_lost_top_impression_share?: number | null;
  search_rank_lost_top_impression_share?: number | null;
}

interface ConversionDistributionProps {
  conversionActions: QueryLike;
  qualityShare: QueryLike<QualityRow>;
}

export function ConversionDistribution({ conversionActions, qualityShare }: ConversionDistributionProps) {
  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Ações de conversão configuradas</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">Quais conversões a conta está rastreando.</p>
        </CardHeader>
        <CardContent className="p-0">
          <SimpleTable
            loading={conversionActions.isLoading}
            rows={conversionActions.data?.rows}
            columns={["name", "category", "type", "status", "primary", "default_value", "currency"]}
            labels={{ name: "Ação", category: "Categoria", type: "Tipo", primary: "Principal", default_value: "Valor padrão", currency: "Moeda" }}
          />
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Parcela de impressões (Search Impression Share)</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Quanto da sua audiência potencial você está alcançando — e por que está perdendo.
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {qualityShare.isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : !qualityShare.data?.rows?.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sem dados</div>
          ) : (() => {
            const q = qualityShare.data.rows[0];
            const items: Array<{ label: string; value: number | null | undefined; hint: string; warn?: boolean }> = [
              { label: "Imp. Share", value: q.search_impression_share, hint: "Total de impressões obtidas" },
              { label: "Top Imp. Share", value: q.search_top_impression_share, hint: "Aparecendo acima dos resultados" },
              { label: "Abs. Top Imp. Share", value: q.search_absolute_top_impression_share, hint: "Aparecendo na 1ª posição" },
              { label: "Perdida (orçamento)", value: q.search_budget_lost_impression_share, hint: "Faltou orçamento", warn: true },
              { label: "Perdida (rank)", value: q.search_rank_lost_impression_share, hint: "Lance/QS baixo", warn: true },
              { label: "Top perdida (orçamento)", value: q.search_budget_lost_top_impression_share, hint: "—", warn: true },
              { label: "Top perdida (rank)", value: q.search_rank_lost_top_impression_share, hint: "—", warn: true },
            ];
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {items.map((it) => (
                  <div key={it.label} className="rounded-md border border-border/40 p-3 bg-muted/10">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{it.label}</p>
                    <p className={cn(
                      "text-lg font-bold tabular-nums mt-1",
                      it.warn && it.value != null && it.value > 0.1 ? "text-rose-400" : "text-foreground"
                    )}>
                      {it.value != null ? fmtPct(it.value) : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{it.hint}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
