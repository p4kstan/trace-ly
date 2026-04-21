/**
 * Hook para canais de notificação de uma regra de automação.
 * Suporta Slack (webhook), Email e Webhook genérico.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AlertChannel = "slack" | "email" | "webhook";

export interface RuleAlert {
  id: string;
  rule_id: string;
  workspace_id: string;
  channel: AlertChannel;
  target: string;
  enabled: boolean;
  only_on_action: boolean;
  last_sent_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
}

export function useRuleAlerts(ruleId: string | undefined) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["rule-alerts", ruleId],
    enabled: !!ruleId,
    queryFn: async (): Promise<RuleAlert[]> => {
      const { data, error } = await supabase
        .from("automation_rule_alerts")
        .select("*").eq("rule_id", ruleId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as RuleAlert[]) || [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["rule-alerts", ruleId] });

  const create = useMutation({
    mutationFn: async (a: { workspace_id: string; channel: AlertChannel; target: string; only_on_action?: boolean }) => {
      const { error } = await supabase.from("automation_rule_alerts").insert({
        rule_id: ruleId!, workspace_id: a.workspace_id, channel: a.channel,
        target: a.target, only_on_action: a.only_on_action ?? true, enabled: true,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Canal adicionado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("automation_rule_alerts").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_rule_alerts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Canal removido"); invalidate(); },
  });

  const test = useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase.functions.invoke("automation-rule-notify", {
        body: {
          rule_id: ruleId, alert_id: alertId, test: true,
          payload: {
            matched: 3, executed: 2, skipped: 1,
            items: [
              { id: "demo:1", name: "[demo] keyword exemplo", value: 87.5, executed: "pause_keyword" },
              { id: "demo:2", name: "[demo] outra keyword", value: 65.0, executed: "pause_keyword" },
            ],
          },
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (res) => {
      const r = (res?.results || [])[0];
      if (r?.ok) toast.success("Teste enviado com sucesso");
      else toast.error(`Teste falhou: ${r?.error || "erro desconhecido"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Teste falhou: ${e.message}`),
  });

  return { list, create, toggle, remove, test };
}
