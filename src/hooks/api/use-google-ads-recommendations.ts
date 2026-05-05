/**
 * Hooks pra AI Co-Pilot do Google Ads.
 * - useGoogleAdsRecommendations: busca recomendações estruturadas via edge fn.
 * - useApplyRecommendation: aplica uma recomendação (insere log + chama mutate).
 * - useRollbackAction: reverte uma ação aplicada.
 * - useAIActionsLog: lista histórico de ações.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RecPeriod = "7d" | "14d" | "30d" | "90d";

export interface Recommendation {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  type: "pause" | "scale_up" | "scale_down" | "budget_change" | "bid_change" | "negative_keyword" | "review";
  target: { level: "account" | "campaign" | "adset"; account_id: string; campaign_id?: string; campaign_name?: string };
  diagnosis: string;
  action: { description: string; mutation: Record<string, unknown>; requires_approval: boolean };
  impact_estimate: { metric: string; direction: "increase" | "decrease"; magnitude: "low" | "medium" | "high"; explanation: string };
  confidence: number;
}

export interface RecommendationsResponse {
  ok: true;
  summary: string;
  health_score: number;
  recommendations: Recommendation[];
  generated_at: string;
  period: RecPeriod;
}

export function useGoogleAdsRecommendations(workspaceId: string | undefined, period: RecPeriod, enabled = true) {
  return useQuery<RecommendationsResponse>({
    queryKey: ["google-ads-recs", workspaceId, period],
    enabled: enabled && !!workspaceId,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-ads-ai-optimizer", {
        body: { mode: "recommend", workspace_id: workspaceId, period },
      });
      if (error) {
        let info: any = null;
        try { info = await (error as any)?.context?.json?.(); } catch { /* */ }
        throw new Error(info?.error || error.message);
      }
      return data as RecommendationsResponse;
    },
  });
}

export function useApplyRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rec, workspaceId }: { rec: Recommendation; workspaceId: string }) => {
      const mutation: Record<string, any> = { customer_id: rec.target.account_id, ...(rec.action.mutation as Record<string, unknown>) };
      // Snapshot before-state when possible
      let before: any = null;
      if (mutation.action === "update_campaign_status") before = { status: mutation.status === "PAUSED" ? "ENABLED" : "PAUSED" };

      const { data: log, error: logErr } = await supabase.from("ai_actions_log").insert({
        workspace_id: workspaceId,
        action_type: rec.type,
        target_platform: "google_ads",
        target_account_id: rec.target.account_id,
        target_campaign_id: rec.target.campaign_id ?? null,
        target_campaign_name: rec.target.campaign_name ?? null,
        diagnosis: rec.diagnosis,
        mutation_payload: mutation as any,
        before_snapshot: before as any,
        status: "approved",
        approved_at: new Date().toISOString(),
      }).select().single();
      if (logErr || !log) throw new Error(logErr?.message || "Failed to log action");

      const { data: result, error: mutErr } = await supabase.functions.invoke("google-ads-mutate", {
        body: { workspace_id: workspaceId, ...mutation },
      });

      const finalStatus = mutErr ? "failed" : "applied";
      await supabase.from("ai_actions_log").update({
        status: finalStatus,
        applied_at: new Date().toISOString(),
        mutation_response: result || { error: mutErr?.message },
      }).eq("id", log.id);

      if (mutErr) throw new Error(mutErr.message);
      return { logId: log.id, result };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google-ads-recs"] });
      qc.invalidateQueries({ queryKey: ["ai-actions-log"] });
    },
  });
}

export function useRollbackAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action_log_id: string) => {
      const { data, error } = await supabase.functions.invoke("google-ads-rollback", {
        body: { action_log_id },
      });
      if (error) {
        let info: any = null;
        try { info = await (error as any)?.context?.json?.(); } catch { /* */ }
        throw new Error(info?.error || error.message);
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-actions-log"] }),
  });
}

export function useAIActionsLog(workspaceId: string | undefined, statusFilter?: string) {
  return useQuery({
    queryKey: ["ai-actions-log", workspaceId, statusFilter],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase.from("ai_actions_log").select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter) q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAICopilotChat() {
  return useMutation({
    mutationFn: async ({ workspaceId, messages, period = "30d" }: { workspaceId: string; messages: { role: "user" | "assistant"; content: string }[]; period?: RecPeriod }) => {
      const { data, error } = await supabase.functions.invoke("google-ads-ai-optimizer", {
        body: { mode: "chat", workspace_id: workspaceId, messages, period },
      });
      if (error) {
        let info: any = null;
        try { info = await (error as any)?.context?.json?.(); } catch { /* */ }
        throw new Error(info?.error || error.message);
      }
      return data as { ok: true; content: string };
    },
  });
}
