/**
 * Hook for the automation_rules table — list, create, toggle, delete,
 * and trigger an on-demand evaluation via the `automation-rule-evaluate` edge fn.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AutomationRule {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  campaign_id: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  condition_json: Record<string, unknown>;
  action_json: Record<string, unknown>;
  last_evaluated_at: string | null;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
}

interface ListArgs {
  workspaceId: string | undefined;
  campaignId?: string;
}

export function useAutomationRules({ workspaceId, campaignId }: ListArgs) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["automation-rules", workspaceId, campaignId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<AutomationRule[]> => {
      let q = supabase.from("automation_rules").select("*").eq("workspace_id", workspaceId!);
      if (campaignId) q = q.or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data as AutomationRule[]) || [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["automation-rules"] });

  const create = useMutation({
    mutationFn: async (rule: Omit<AutomationRule, "id" | "created_at" | "last_evaluated_at" | "last_triggered_at" | "trigger_count">) => {
      const { data, error } = await supabase.from("automation_rules").insert(rule).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Regra criada"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("automation_rules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Regra removida"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const evaluateNow = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("automation-rule-evaluate", { body: { rule_id: id } });
      if (error) throw new Error(error.message);
      return data as { matched: number; executed: number; skipped: number };
    },
    onSuccess: (res) => {
      toast.success(`Avaliação: ${res.matched} matched · ${res.executed} executados`);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  return { list, create, toggle, remove, evaluateNow };
}
