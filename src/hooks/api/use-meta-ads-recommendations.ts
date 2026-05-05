/**
 * Hooks pra AI Co-Pilot do Meta Ads. Espelha use-google-ads-recommendations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RecPeriod } from "./use-google-ads-recommendations";

export type MetaRecType =
  | "pause_campaign" | "pause_adset" | "scale_up" | "scale_down"
  | "budget_change" | "creative_swap" | "audience_review" | "review";

export interface MetaRecommendation {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  type: MetaRecType;
  target: {
    level: "account" | "campaign" | "adset" | "ad";
    account_id: string;
    campaign_id?: string;
    campaign_name?: string;
    adset_id?: string;
    adset_name?: string;
    ad_id?: string;
  };
  diagnosis: string;
  action: { description: string; mutation: Record<string, unknown>; requires_approval: boolean };
  impact_estimate: { metric: string; direction: "increase" | "decrease"; magnitude: "low" | "medium" | "high"; explanation: string };
  confidence: number;
}

export interface MetaRecommendationsResponse {
  ok: true;
  platform: "meta";
  summary: string;
  health_score: number;
  recommendations: MetaRecommendation[];
  generated_at: string;
  period: RecPeriod;
}

export function useMetaAdsRecommendations(workspaceId: string | undefined, period: RecPeriod, enabled = true) {
  return useQuery<MetaRecommendationsResponse>({
    queryKey: ["meta-ads-recs", workspaceId, period],
    enabled: enabled && !!workspaceId,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-ads-ai-optimizer", {
        body: { mode: "recommend", workspace_id: workspaceId, period },
      });
      if (error) {
        let info: any = null;
        try { info = await (error as any)?.context?.json?.(); } catch { /* */ }
        throw new Error(info?.error || error.message);
      }
      return data as MetaRecommendationsResponse;
    },
  });
}

export function useApplyMetaRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rec, workspaceId }: { rec: MetaRecommendation; workspaceId: string }) => {
      const mutation: Record<string, any> = { account_id: rec.target.account_id, ...(rec.action.mutation as Record<string, unknown>) };

      let before: any = null;
      if (mutation.action === "update_campaign_status" || mutation.action === "update_adset_status") {
        before = { status: mutation.status === "PAUSED" ? "ACTIVE" : "PAUSED" };
      }

      const { data: log, error: logErr } = await supabase.from("ai_actions_log").insert({
        workspace_id: workspaceId,
        action_type: rec.type,
        target_platform: "meta_ads",
        target_account_id: rec.target.account_id,
        target_campaign_id: rec.target.campaign_id ?? rec.target.adset_id ?? null,
        target_campaign_name: rec.target.campaign_name ?? rec.target.adset_name ?? null,
        diagnosis: rec.diagnosis,
        mutation_payload: mutation as any,
        before_snapshot: before as any,
        status: "approved",
        approved_at: new Date().toISOString(),
      }).select().single();
      if (logErr || !log) throw new Error(logErr?.message || "Failed to log action");

      const { data: result, error: mutErr } = await supabase.functions.invoke("meta-ads-mutate", {
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
      qc.invalidateQueries({ queryKey: ["meta-ads-recs"] });
      qc.invalidateQueries({ queryKey: ["ai-actions-log"] });
    },
  });
}

export function useRollbackMetaAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action_log_id: string) => {
      const { data, error } = await supabase.functions.invoke("meta-ads-rollback", {
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
