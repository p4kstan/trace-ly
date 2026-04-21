/**
 * No-code automation rules panel.
 * - Lists existing rules (scoped to current campaign or workspace-wide).
 * - Lets user create a rule via a simple builder: pick a metric + operator + threshold,
 *   pick an action (pause keyword, pause ad group, pause campaign), and a window.
 * - Lets user toggle / remove / "Avaliar agora" (manual trigger) / Backtest.
 *
 * Rules are evaluated on-demand by the `automation-rule-evaluate` edge function.
 * The Backtest dialog calls `automation-rule-backtest` (read-only).
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Trash2, Zap, Plus, FlaskConical } from "lucide-react";
import { useAutomationRules, type AutomationRule } from "@/hooks/api/use-automation-rules";
import { BacktestRuleDialog } from "./BacktestRuleDialog";

type Metric = "cpa" | "ctr" | "cost" | "roas" | "conversions";
type Operator = ">" | "<" | ">=" | "<=";
type Action = "pause_keyword" | "pause_ad_group" | "pause_campaign";
type WindowDays = 1 | 3 | 7 | 14 | 30;

const METRIC_LABELS: Record<Metric, string> = {
  cpa: "CPA (R$)", ctr: "CTR (%)", cost: "Custo (R$)", roas: "ROAS", conversions: "Conversões",
};
const ACTION_LABELS: Record<Action, string> = {
  pause_keyword: "Pausar palavra-chave (afeta keywords que batem condição)",
  pause_ad_group: "Pausar grupo de anúncios",
  pause_campaign: "Pausar campanha inteira",
};

interface Props {
  workspaceId: string | undefined;
  customerId: string;
  campaignId: string;
}

export function AutomationRulesPanel({ workspaceId, customerId, campaignId }: Props) {
  const rules = useAutomationRules({ workspaceId, campaignId });
  const [open, setOpen] = useState(false);
  const [backtestRuleId, setBacktestRuleId] = useState<string | null>(null);
  const [backtestRuleName, setBacktestRuleName] = useState<string>("");
  const [backtestDraftOpen, setBacktestDraftOpen] = useState(false);

  // Builder state
  const [name, setName] = useState("");
  const [metric, setMetric] = useState<Metric>("cpa");
  const [operator, setOperator] = useState<Operator>(">");
  const [threshold, setThreshold] = useState("");
  const [windowDays, setWindowDays] = useState<WindowDays>(3);
  const [action, setAction] = useState<Action>("pause_keyword");

  const reset = () => {
    setName(""); setMetric("cpa"); setOperator(">"); setThreshold("");
    setWindowDays(3); setAction("pause_keyword"); setOpen(false);
  };

  const scopeFromAction = (a: Action) =>
    a === "pause_campaign" ? "ad_group" : a === "pause_ad_group" ? "ad_group" : "keyword";

  const submit = () => {
    if (!workspaceId || !name.trim() || !threshold) return;
    rules.create.mutate(
      {
        workspace_id: workspaceId,
        customer_id: customerId,
        campaign_id: campaignId,
        name: name.trim(),
        description: `${METRIC_LABELS[metric]} ${operator} ${threshold} em ${windowDays}d → ${ACTION_LABELS[action]}`,
        enabled: true,
        condition_json: { metric, operator, threshold: Number(threshold), window_days: windowDays, scope: scopeFromAction(action) },
        action_json: { type: action, action, scope: action === "pause_campaign" ? "campaign" : action === "pause_ad_group" ? "ad_group" : "keyword" },
      },
      { onSuccess: () => reset() },
    );
  };

  const list = rules.list.data || [];

  return (
    <Card className="glass-card">
      <CardHeader className="py-3 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Regras de automação</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">Crie regras tipo "se CPA &gt; R$50 em 3d, pausa keyword". Disparo manual via "Avaliar agora". Use Backtest para simular antes.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {open ? "Fechar" : "Nova regra"}
        </Button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 border-t border-border/40 pt-4">
          <div>
            <Label className="text-xs">Nome da regra</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Ex: "Pausar keyword com CPA alto"' className="mt-1 h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Métrica</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METRIC_LABELS) as Metric[]).map((k) => <SelectItem key={k} value={k}>{METRIC_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operador</Label>
              <Select value={operator} onValueChange={(v) => setOperator(v as Operator)}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=">">{">"} maior que</SelectItem>
                  <SelectItem value=">=">{"≥"} maior ou igual</SelectItem>
                  <SelectItem value="<">{"<"} menor que</SelectItem>
                  <SelectItem value="<=">{"≤"} menor ou igual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor (limite)</Label>
              <Input type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Ex: 50" className="mt-1 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Janela (dias)</Label>
              <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v) as WindowDays)}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 3, 7, 14, 30].map((d) => <SelectItem key={d} value={String(d)}>{d} dia(s)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Ação</Label>
            <Select value={action} onValueChange={(v) => setAction(v as Action)}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACTION_LABELS) as Action[]).map((k) => <SelectItem key={k} value={k}>{ACTION_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end flex-wrap">
            <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
            <Button size="sm" variant="outline" onClick={() => setBacktestDraftOpen(true)}
              disabled={!threshold || !workspaceId}>
              <FlaskConical className="w-3.5 h-3.5 mr-1" /> Backtest antes
            </Button>
            <Button size="sm" onClick={submit} disabled={!name.trim() || !threshold || rules.create.isPending}>
              {rules.create.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Criar regra
            </Button>
          </div>
        </CardContent>
      )}

      <CardContent className="p-0">
        {rules.list.isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Nenhuma regra ainda. Crie a primeira acima.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {list.map((r) => (
              <RuleRow
                key={r.id} rule={r} rules={rules}
                onBacktest={() => { setBacktestRuleId(r.id); setBacktestRuleName(r.name); }}
              />
            ))}
          </div>
        )}
      </CardContent>

      <BacktestRuleDialog
        open={!!backtestRuleId}
        onOpenChange={(o) => { if (!o) setBacktestRuleId(null); }}
        ruleId={backtestRuleId || undefined}
        title={backtestRuleName}
      />
      <BacktestRuleDialog
        open={backtestDraftOpen}
        onOpenChange={setBacktestDraftOpen}
        ruleDraft={workspaceId ? {
          workspace_id: workspaceId,
          customer_id: customerId,
          campaign_id: campaignId,
          condition_json: { metric, operator, threshold: Number(threshold) || 0, window_days: windowDays, scope: scopeFromAction(action) },
          action_json: { type: action, action, scope: action === "pause_campaign" ? "campaign" : action === "pause_ad_group" ? "ad_group" : "keyword" },
        } : undefined}
        title={name || "Nova regra (rascunho)"}
      />
    </Card>
  );
}

function RuleRow({ rule, rules, onBacktest }: { rule: AutomationRule; rules: ReturnType<typeof useAutomationRules>; onBacktest: () => void }) {
  return (
    <div className="p-3 flex items-start justify-between gap-3 hover:bg-muted/20">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Switch checked={rule.enabled} onCheckedChange={(v) => rules.toggle.mutate({ id: rule.id, enabled: v })} />
          <p className="text-sm font-semibold truncate">{rule.name}</p>
        </div>
        {rule.description && <p className="text-[11px] text-muted-foreground mt-1 ml-10">{rule.description}</p>}
        <p className="text-[10px] text-muted-foreground mt-1 ml-10">
          Disparada {rule.trigger_count}x
          {rule.last_triggered_at && ` · última: ${new Date(rule.last_triggered_at).toLocaleString("pt-BR")}`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0 flex-wrap">
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          onClick={onBacktest}
          title="Simular nos últimos 30 dias antes de aplicar"
        >
          <FlaskConical className="w-3 h-3 mr-1" /> Backtest
        </Button>
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          disabled={rules.evaluateNow.isPending}
          onClick={() => rules.evaluateNow.mutate(rule.id)}
        >
          {rules.evaluateNow.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
          Avaliar agora
        </Button>
        <Button
          size="icon" variant="ghost" className="h-7 w-7"
          disabled={rules.remove.isPending}
          onClick={() => { if (confirm(`Remover regra "${rule.name}"?`)) rules.remove.mutate(rule.id); }}
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
        </Button>
      </div>
    </div>
  );
}
