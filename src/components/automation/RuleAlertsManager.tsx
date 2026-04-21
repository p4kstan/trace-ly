/**
 * RuleAlertsManager — gerenciador de canais de notificação para uma regra.
 * Permite adicionar Slack (webhook), Email e Webhook genérico.
 *
 * Cada canal pode ser ligado/desligado, testado e removido.
 * "Só notificar quando houver ação" evita spam quando a regra avalia mas nada bate.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, Send, Trash2, Plus, MessageSquare, Mail, Webhook, AlertCircle } from "lucide-react";
import { useRuleAlerts, type AlertChannel, type RuleAlert } from "@/hooks/api/use-rule-alerts";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ruleId: string | undefined;
  ruleName: string;
  workspaceId: string | undefined;
}

const PLACEHOLDERS: Record<AlertChannel, string> = {
  slack: "https://hooks.slack.com/services/T.../B.../...",
  email: "voce@empresa.com",
  webhook: "https://api.suaempresa.com/hooks/automation",
};
const HELP: Record<AlertChannel, string> = {
  slack: "Crie um Incoming Webhook no Slack (App Directory → Incoming Webhooks) e cole a URL aqui.",
  email: "Email do destinatário. Requer integração Resend configurada.",
  webhook: "POST com JSON {event, rule_id, matched, executed, items, ...}.",
};

const ICONS: Record<AlertChannel, typeof MessageSquare> = {
  slack: MessageSquare, email: Mail, webhook: Webhook,
};

function validate(channel: AlertChannel, target: string): string | null {
  const t = target.trim();
  if (!t) return "Preencha o destino";
  if (channel === "slack" && !/^https:\/\/hooks\.slack\.com\//.test(t)) return "URL deve começar com https://hooks.slack.com/";
  if (channel === "webhook" && !/^https?:\/\//.test(t)) return "URL deve começar com http(s)://";
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "Email inválido";
  return null;
}

export function RuleAlertsManager({ open, onOpenChange, ruleId, ruleName, workspaceId }: Props) {
  const alerts = useRuleAlerts(ruleId);
  const [channel, setChannel] = useState<AlertChannel>("slack");
  const [target, setTarget] = useState("");
  const [onlyAction, setOnlyAction] = useState(true);

  const list = alerts.list.data || [];
  const err = validate(channel, target);

  const add = () => {
    if (!workspaceId || !ruleId || err) return;
    alerts.create.mutate(
      { workspace_id: workspaceId, channel, target: target.trim(), only_on_action: onlyAction },
      { onSuccess: () => { setTarget(""); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            Alertas — <span className="text-muted-foreground font-normal truncate">{ruleName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Add new */}
          <div className="border border-border/40 rounded p-3 space-y-2 bg-muted/10">
            <p className="text-xs font-semibold flex items-center gap-1"><Plus className="w-3 h-3" /> Novo canal</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] uppercase">Canal</Label>
                <Select value={channel} onValueChange={(v) => { setChannel(v as AlertChannel); setTarget(""); }}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slack">💬 Slack</SelectItem>
                    <SelectItem value="email">✉️ Email</SelectItem>
                    <SelectItem value="webhook">🔗 Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-[10px] uppercase">Destino</Label>
                <Input value={target} onChange={(e) => setTarget(e.target.value)}
                  placeholder={PLACEHOLDERS[channel]} className="h-8 text-xs mt-1 font-mono" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">{HELP[channel]}</p>
            {target && err && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{err}</p>
            )}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                <Switch checked={onlyAction} onCheckedChange={setOnlyAction} />
                Só notificar quando houver ação executada
              </label>
              <Button size="sm" onClick={add} disabled={!!err || !target || alerts.create.isPending}>
                {alerts.create.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Adicionar
              </Button>
            </div>
          </div>

          {/* List */}
          {alerts.list.isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum canal configurado.</p>
          ) : (
            <div className="space-y-2">
              {list.map((a) => <AlertRow key={a.id} alert={a} alerts={alerts} />)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AlertRow({ alert, alerts }: { alert: RuleAlert; alerts: ReturnType<typeof useRuleAlerts> }) {
  const Icon = ICONS[alert.channel];
  return (
    <div className="border border-border/40 rounded p-2 flex items-center gap-2">
      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase">{alert.channel}</Badge>
          <p className="text-xs font-mono truncate">{alert.target}</p>
        </div>
        {alert.last_status && (
          <p className={`text-[10px] mt-0.5 ${alert.last_status === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
            {alert.last_status === "ok" ? "✓ enviado" : `✗ ${alert.last_error || "erro"}`}
            {alert.last_sent_at && ` · ${new Date(alert.last_sent_at).toLocaleString("pt-BR")}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Switch checked={alert.enabled} onCheckedChange={(v) => alerts.toggle.mutate({ id: alert.id, enabled: v })} />
        <Button size="icon" variant="ghost" className="h-7 w-7"
          disabled={alerts.test.isPending}
          onClick={() => alerts.test.mutate(alert.id)} title="Enviar teste">
          {alerts.test.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7"
          onClick={() => { if (confirm("Remover canal?")) alerts.remove.mutate(alert.id); }}>
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
        </Button>
      </div>
    </div>
  );
}
