/**
 * Centralizes all in-app Google Ads edit mutations:
 * - toggle status of ads & keywords
 * - update keyword CPC bid
 * - add negative keyword (campaign or ad-group level)
 *
 * All mutations invalidate the gads-detail query cache so tables refresh.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Args {
  workspaceId: string | undefined;
  customerId: string;
  campaignId: string;
}

type Status = "ENABLED" | "PAUSED";

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("google-ads-mutate", { body });
  if (error) {
    let info: { error?: string } | null = null;
    try {
      info = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.() || null;
    } catch { /* ignore */ }
    throw new Error(info?.error || error.message);
  }
  return data;
}

export function useCampaignEdits({ workspaceId, customerId, campaignId }: Args) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["gads-detail"] });

  const toggleAd = useMutation({
    mutationFn: async ({ ad_id, ad_group_id, status }: { ad_id: string; ad_group_id: string; status: Status }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({ workspace_id: workspaceId, customer_id: customerId, action: "update_ad_status", ad_id, ad_group_id, status });
    },
    onSuccess: () => { toast.success("Status do anúncio atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const toggleKeyword = useMutation({
    mutationFn: async ({ ad_group_criterion_id, ad_group_id, status }: { ad_group_criterion_id: string; ad_group_id: string; status: Status }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({ workspace_id: workspaceId, customer_id: customerId, action: "update_keyword_status", ad_group_criterion_id, ad_group_id, status });
    },
    onSuccess: () => { toast.success("Status da palavra-chave atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const updateKeywordBid = useMutation({
    mutationFn: async ({ ad_group_criterion_id, ad_group_id, cpc_brl }: { ad_group_criterion_id: string; ad_group_id: string; cpc_brl: number }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      const cpc_bid_micros = Math.round(cpc_brl * 1_000_000);
      return invoke({ workspace_id: workspaceId, customer_id: customerId, action: "update_keyword_bid", ad_group_criterion_id, ad_group_id, cpc_bid_micros });
    },
    onSuccess: () => { toast.success("Lance atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const addNegative = useMutation({
    mutationFn: async ({
      keyword_text, match_type, level, ad_group_id,
    }: {
      keyword_text: string;
      match_type: "EXACT" | "PHRASE" | "BROAD";
      level: "campaign" | "ad_group";
      ad_group_id?: string;
    }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId,
        customer_id: customerId,
        action: "add_negative_keyword",
        campaign_id: level === "campaign" ? campaignId : undefined,
        ad_group_id: level === "ad_group" ? ad_group_id : undefined,
        keyword_text: keyword_text.trim(),
        match_type,
        level,
      });
    },
    onSuccess: () => { toast.success("Palavra negativa adicionada"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  return { toggleAd, toggleKeyword, updateKeywordBid, addNegative };
}

export type CampaignEdits = ReturnType<typeof useCampaignEdits>;
