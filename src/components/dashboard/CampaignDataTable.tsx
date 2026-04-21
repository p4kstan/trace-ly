/**
 * Generic table used across the Google Ads campaign detail page.
 * Renders columns with formatting based on column key (metric, money, percent, status, etc).
 */
import { Loader2, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

const fmtNumber = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const fmtFloat = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

const DEFAULT_LABELS: Record<string, string> = {
  name: "Nome",
  impressions: "Impressões",
  clicks: "Cliques",
  ctr: "CTR",
  cpc: "CPC",
  cost: "Custo",
  conversions: "Conv.",
  cpa: "CPA",
  roas: "ROAS",
  status: "Status",
  type: "Tipo",
  quality_score: "QS",
};

const COL_HELP: Record<string, string> = {
  name: "Identificador do item (palavra-chave, anúncio, grupo, etc.).",
  status: "Estado atual no Google Ads: Ativada, Pausada ou Removida.",
  quality_score: "Quality Score (1-10): nota do Google avaliando relevância do anúncio, experiência da landing page e CTR esperado. ≥7 é bom, 4-6 médio, <4 ruim.",
  impressions: "Quantas vezes seu anúncio foi exibido na tela do usuário.",
  clicks: "Número de cliques recebidos no anúncio.",
  ctr: "Click-Through Rate = Cliques ÷ Impressões. Mede o quanto o anúncio atrai cliques.",
  cpc: "Custo por Clique médio = Custo ÷ Cliques.",
  cost: "Quanto foi gasto no período (em R$).",
  conversions: "Número de conversões (compras, leads, etc.) atribuídas ao anúncio.",
  conv_rate: "Taxa de Conversão = Conversões ÷ Cliques.",
  cpa: "Custo por Aquisição = Custo ÷ Conversões. Quanto custou cada conversão.",
  roas: "Return on Ad Spend = Receita ÷ Custo. Quantos R$ você ganha por cada R$ investido.",
  type: "Tipo do item (ex: público, conversão, dispositivo).",
  match_type: "Tipo de correspondência: EXACT (exata), PHRASE (frase) ou BROAD (ampla).",
  matched_keyword: "Palavra-chave que disparou o anúncio para esse termo de busca.",
  bid_modifier: "Ajuste percentual sobre o lance padrão (+ aumenta, − reduz).",
  negative: "Indica se o segmento está excluído da campanha.",
  primary: "Conversão principal — usada pelo Google para otimizar lances automáticos.",
  default_value: "Valor padrão atribuído à conversão quando não vem dinâmico do site.",
  currency: "Moeda usada nos valores reportados.",
  category: "Categoria da ação de conversão (Compra, Lead, Cadastro, etc.).",
  level: "Escopo da palavra negativa (Campanha ou Grupo de anúncios).",
  ad_group_name: "Nome do grupo de anúncios ao qual o item pertence.",
  shared_set_name: "Nome da lista compartilhada de palavras negativas.",
};

function formatCell(col: string, val: unknown): React.ReactNode {
  if (val == null || val === "") return "—";
  if (col === "ctr" || col === "conv_rate") return fmtPct(Number(val));
  if (col === "cost" || col === "cpc" || col === "cpa" || col === "default_value") return fmtMoney(Number(val));
  if (col === "conversions" || col === "roas") return fmtFloat(Number(val));
  if (col === "impressions" || col === "clicks") return fmtNumber(Number(val));
  if (col === "status") return <CampaignStatusBadge status={String(val)} />;
  if (col === "bid_modifier") {
    const v = Number(val);
    const pct = (v - 1) * 100;
    const cls = pct > 0 ? "text-emerald-400" : pct < 0 ? "text-rose-400" : "text-muted-foreground";
    return <span className={cn("font-bold tabular-nums", cls)}>{pct > 0 ? "+" : ""}{pct.toFixed(0)}%</span>;
  }
  if (col === "negative" || col === "primary") {
    return val ? <Badge variant="outline" className="text-[10px]">Sim</Badge> : <span className="text-muted-foreground">Não</span>;
  }
  if (col === "quality_score" && val) {
    const v = Number(val);
    const cls = v >= 7 ? "text-emerald-400" : v >= 4 ? "text-amber-400" : "text-rose-400";
    return <span className={cn("font-bold", cls)}>{v}/10</span>;
  }
  if (typeof val === "string" && val.length > 60) return val.slice(0, 60) + "…";
  return String(val);
}

interface Props {
  loading: boolean;
  rows?: any[];
  columns: string[];
  labels?: Record<string, string>;
  /** Optional renderer for an actions column appended to the right of every row */
  rowActions?: (row: any) => React.ReactNode;
  actionsLabel?: string;
}

export function CampaignDataTable({ loading, rows, columns, labels, rowActions, actionsLabel = "" }: Props) {
  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!rows?.length) return <div className="p-8 text-center text-sm text-muted-foreground">Sem dados</div>;

  const colLabel = (c: string) => labels?.[c] || DEFAULT_LABELS[c] || c;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-b border-border/50 bg-muted/20">
            <tr>
              {columns.map((c) => {
                const help = COL_HELP[c];
                const isLeft = c === "name" || c === "matched_keyword";
                return (
                  <th key={c} className={cn("py-2.5 px-2 font-semibold", isLeft ? "text-left" : "text-right")}>
                    {help ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help border-b border-dotted border-muted-foreground/40">
                            {colLabel(c)}
                            <HelpCircle className="w-3 h-3 opacity-60" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                          {help}
                        </TooltipContent>
                      </Tooltip>
                    ) : colLabel(c)}
                  </th>
                );
              })}
              {rowActions && <th className="py-2.5 px-2 font-semibold text-right w-[80px]">{actionsLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className="border-b border-border/30 hover:bg-muted/20">
                {columns.map((c) => (
                  <td key={c} className={cn("py-2 px-2 tabular-nums", c === "name" || c === "matched_keyword" ? "text-left" : "text-right")}>
                    {formatCell(c, r[c])}
                  </td>
                ))}
                {rowActions && (
                  <td className="py-1 px-2 text-right">
                    <div className="inline-flex items-center justify-end gap-0.5">{rowActions(r)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

