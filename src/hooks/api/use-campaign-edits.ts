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

  const updateAdGroupBid = useMutation({
    mutationFn: async ({ ad_group_id, cpc_brl }: { ad_group_id: string; cpc_brl: number }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      const cpc_bid_micros = Math.round(cpc_brl * 1_000_000);
      return invoke({ workspace_id: workspaceId, customer_id: customerId, action: "update_ad_group_bid", ad_group_id, cpc_bid_micros });
    },
    onSuccess: () => { toast.success("Lance do grupo atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const renameCampaign = useMutation({
    mutationFn: async ({ new_name }: { new_name: string }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({ workspace_id: workspaceId, customer_id: customerId, action: "rename_campaign", campaign_id: campaignId, new_name });
    },
    onSuccess: () => { toast.success("Campanha renomeada"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const renameAdGroup = useMutation({
    mutationFn: async ({ ad_group_id, new_name }: { ad_group_id: string; new_name: string }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({ workspace_id: workspaceId, customer_id: customerId, action: "rename_ad_group", ad_group_id, new_name });
    },
    onSuccess: () => { toast.success("Grupo renomeado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  /** Bulk pause/enable a list of keywords (parallel). */
  const bulkToggleKeywords = useMutation({
    mutationFn: async ({
      items, status,
    }: { items: Array<{ ad_group_criterion_id: string; ad_group_id: string }>; status: Status }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      const results = await Promise.allSettled(
        items.map((it) => invoke({
          workspace_id: workspaceId, customer_id: customerId, action: "update_keyword_status",
          ad_group_criterion_id: it.ad_group_criterion_id, ad_group_id: it.ad_group_id, status,
        })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { ok: items.length - failed, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (failed === 0) toast.success(`${ok} palavra(s) atualizada(s)`);
      else toast.warning(`${ok} ok, ${failed} falharam`);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  /** Bulk add a list of search terms as campaign-level negatives. */
  const bulkAddNegatives = useMutation({
    mutationFn: async ({
      terms, match_type = "PHRASE",
    }: { terms: string[]; match_type?: "EXACT" | "PHRASE" | "BROAD" }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      const clean = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean)));
      const results = await Promise.allSettled(
        clean.map((t) => invoke({
          workspace_id: workspaceId, customer_id: customerId, action: "add_negative_keyword",
          campaign_id: campaignId, keyword_text: t, match_type, level: "campaign",
        })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { ok: clean.length - failed, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (failed === 0) toast.success(`${ok} negativa(s) adicionada(s)`);
      else toast.warning(`${ok} ok, ${failed} falharam`);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  return {
    toggleAd, toggleKeyword, updateKeywordBid, addNegative,
    updateAdGroupBid, renameCampaign, renameAdGroup,
    bulkToggleKeywords, bulkAddNegatives,
  };
}

export type CampaignEdits = ReturnType<typeof useCampaignEdits>;
