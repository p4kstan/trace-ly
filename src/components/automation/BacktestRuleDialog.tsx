/**
 * BacktestRuleDialog — runs `automation-rule-backtest` for an existing rule
 * (or a draft, before creation) and shows what WOULD have happened.
 *
 * Read-only: never triggers mutations. Used to give the user confidence
 * before activating an automation rule.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, AlertCircle } from "lucide-react";

interface BacktestResult {
  total_items: number;
  matched: number;
  backtest_days: number;
  sample: Array<{
    id: string; name: string; ad_group_id: string;
    clicks: number; cost: number; conversions: number; metric_value: number;
  }>;
  impact: { cost: number; conversions: number };
  condition_summary: { metric: string; operator: string; threshold: number; scope: string };
  action_preview: { type?: string; action?: string };
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Existing rule id (preferred). */
  ruleId?: string;
  /** OR a draft (used in the rule builder before saving). */
  ruleDraft?: Record<string, unknown>;
  /** Friendly title displayed at the top. */
  title?: string;
}

const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function BacktestRuleDialog({ open, onOpenChange, ruleId, ruleDraft, title }: Props) {
  const [days, setDays] = useState<number>(30);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { backtest_days: days };
      if (ruleId) body.rule_id = ruleId;
      else if (ruleDraft) body.rule_draft = ruleDraft;
      const { data, error } = await supabase.functions.invoke("automation-rule-backtest", { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as BacktestResult;
    },
    onSuccess: (data) => setResult(data),
  });

  const matchPct = result && result.total_items > 0
    ? Math.round((result.matched / result.total_items) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setResult(null); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-amber-400" />
            Backtest da regra {title && <span className="text-muted-foreground font-normal">— {title}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Simular nos últimos:</span>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[7, 14, 30, 60, 90].map((d) => <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-7 text-xs" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FlaskConical className="w-3 h-3 mr-1" />}
              Rodar simulação
            </Button>
          </div>

          {run.error && (
            <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="break-all">{(run.error as Error).message}</p>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Itens analisados" value={result.total_items.toLocaleString("pt-BR")} />
                <Stat label="Acionariam" value={`${result.matched.toLocaleString("pt-BR")} (${matchPct}%)`}
                  tone={result.matched === 0 ? "muted" : matchPct > 50 ? "warn" : "ok"} />
                <Stat label="Custo afetado" value={fmtMoney(result.impact.cost)} />
                <Stat label="Conversões afetadas" value={result.impact.conversions.toFixed(1)}
                  tone={result.impact.conversions > 0 ? "warn" : "muted"} />
              </div>

              {result.matched === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  ✅ Nada bateria a condição nos últimos {result.backtest_days} dias. Pode ativar com segurança.
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Top 20 itens que <strong>seriam afetados</strong> pela ação <Badge variant="outline" className="text-[10px] ml-1">{result.action_preview.type || result.action_preview.action || "?"}</Badge>:
                  </p>
                  <div className="border border-border/40 rounded max-h-72 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Item</th>
                          <th className="text-right p-2">Cliques</th>
                          <th className="text-right p-2">Custo</th>
                          <th className="text-right p-2">Conv.</th>
                          <th className="text-right p-2">{result.condition_summary.metric.toUpperCase()}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.sample.map((it) => (
                          <tr key={it.id} className="border-t border-border/30 hover:bg-muted/20">
                            <td className="p-2 truncate max-w-xs" title={it.name}>{it.name || it.id}</td>
                            <td className="p-2 text-right tabular-nums">{it.clicks}</td>
                            <td className="p-2 text-right tabular-nums">{fmtMoney(it.cost)}</td>
                            <td className="p-2 text-right tabular-nums">{it.conversions.toFixed(1)}</td>
                            <td className="p-2 text-right tabular-nums font-semibold">{it.metric_value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.impact.conversions > 0 && (
                    <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded p-2">
                      ⚠️ Atenção: a regra afetaria {result.impact.conversions.toFixed(1)} conversão(ões). Revise o threshold antes de ativar.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: string; tone?: "ok" | "warn" | "muted" }) {
  const colorClass = tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="border border-border/40 rounded p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${colorClass}`}>{value}</p>
    </div>
  );
}
