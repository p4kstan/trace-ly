/**
 * Centralizes all in-app Google Ads edit mutations.
 * Includes individual edits, bulk operations, creation, duplication,
 * bidding strategy, bid modifiers and ad-text edits.
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
type MatchType = "EXACT" | "PHRASE" | "BROAD";
export type BiddingStrategy =
  | "MAXIMIZE_CONVERSIONS"
  | "MAXIMIZE_CONVERSION_VALUE"
  | "TARGET_CPA"
  | "TARGET_ROAS"
  | "MANUAL_CPC"
  | "MAXIMIZE_CLICKS";

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

  const toggleAdGroup = useMutation({
    mutationFn: async ({ ad_group_id, status }: { ad_group_id: string; status: Status }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({ workspace_id: workspaceId, customer_id: customerId, action: "update_ad_group_status", ad_group_id, status });
    },
    onSuccess: () => { toast.success("Status do grupo atualizado"); invalidate(); },
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
      match_type: MatchType;
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
    }: { terms: string[]; match_type?: MatchType }) => {
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

  // ── Bidding strategy ──────────────────────────────────────────────
  const updateBiddingStrategy = useMutation({
    mutationFn: async ({
      strategy, target_cpa_brl, target_roas,
    }: { strategy: BiddingStrategy; target_cpa_brl?: number; target_roas?: number }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId, customer_id: customerId,
        action: "update_bidding_strategy",
        campaign_id: campaignId,
        strategy,
        target_cpa_micros: target_cpa_brl ? Math.round(target_cpa_brl * 1_000_000) : undefined,
        target_roas,
      });
    },
    onSuccess: () => { toast.success("Estratégia de lances atualizada"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  // ── Bid modifiers (segments) ──────────────────────────────────────
  const updateCampaignBidModifier = useMutation({
    mutationFn: async ({ criterion_id, bid_modifier }: { criterion_id: string; bid_modifier: number }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId, customer_id: customerId,
        action: "update_campaign_criterion_bid_modifier",
        campaign_id: campaignId, criterion_id, bid_modifier,
      });
    },
    onSuccess: () => { toast.success("Modificador atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const updateAdGroupBidModifier = useMutation({
    mutationFn: async ({ ad_group_id, criterion_id, bid_modifier }: { ad_group_id: string; criterion_id: string; bid_modifier: number }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId, customer_id: customerId,
        action: "update_ad_group_criterion_bid_modifier",
        ad_group_id, criterion_id, bid_modifier,
      });
    },
    onSuccess: () => { toast.success("Modificador atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  // ── Ad text edit ──────────────────────────────────────────────────
  const editResponsiveSearchAd = useMutation({
    mutationFn: async ({
      ad_id, ad_group_id, headlines, descriptions, final_urls, path1, path2,
    }: {
      ad_id: string; ad_group_id: string;
      headlines: string[]; descriptions: string[]; final_urls: string[];
      path1?: string; path2?: string;
    }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId, customer_id: customerId,
        action: "edit_responsive_search_ad",
        ad_id, ad_group_id, headlines, descriptions, final_urls, path1, path2,
      });
    },
    onSuccess: (data: any) => {
      if (data?.warning) toast.warning(`Anúncio editado parcialmente: ${data.warning}`);
      else toast.success("Anúncio atualizado (novo criado, antigo removido)");
      invalidate();
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  // ── Creation ──────────────────────────────────────────────────────
  const createKeyword = useMutation({
    mutationFn: async ({
      ad_group_id, keyword_text, match_type, cpc_brl,
    }: { ad_group_id: string; keyword_text: string; match_type: MatchType; cpc_brl?: number }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId, customer_id: customerId,
        action: "create_keyword",
        ad_group_id, keyword_text, match_type,
        cpc_bid_micros: cpc_brl ? Math.round(cpc_brl * 1_000_000) : undefined,
      });
    },
    onSuccess: () => { toast.success("Palavra-chave criada"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const createAdGroup = useMutation({
    mutationFn: async ({ new_name, cpc_brl }: { new_name: string; cpc_brl?: number }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId, customer_id: customerId,
        action: "create_ad_group",
        campaign_id: campaignId, new_name,
        cpc_bid_micros: cpc_brl ? Math.round(cpc_brl * 1_000_000) : undefined,
      });
    },
    onSuccess: () => { toast.success("Grupo de anúncios criado"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const duplicateAd = useMutation({
    mutationFn: async ({ ad_id, ad_group_id }: { ad_id: string; ad_group_id: string }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId, customer_id: customerId,
        action: "duplicate_ad", ad_id, ad_group_id,
      });
    },
    onSuccess: () => { toast.success("Anúncio duplicado (pausado)"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const duplicateKeyword = useMutation({
    mutationFn: async ({
      ad_group_criterion_id, ad_group_id, target_ad_group_id,
    }: { ad_group_criterion_id: string; ad_group_id: string; target_ad_group_id?: string }) => {
      if (!workspaceId) throw new Error("Sem workspace");
      return invoke({
        workspace_id: workspaceId, customer_id: customerId,
        action: "duplicate_keyword",
        ad_group_criterion_id, ad_group_id, target_ad_group_id,
      });
    },
    onSuccess: () => { toast.success("Palavra-chave duplicada (pausada)"); invalidate(); },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  return {
    toggleAd, toggleKeyword, toggleAdGroup,
    updateKeywordBid, addNegative,
    updateAdGroupBid, renameCampaign, renameAdGroup,
    bulkToggleKeywords, bulkAddNegatives,
    updateBiddingStrategy,
    updateCampaignBidModifier, updateAdGroupBidModifier,
    editResponsiveSearchAd,
    createKeyword, createAdGroup, duplicateAd, duplicateKeyword,
  };
}

export type CampaignEdits = ReturnType<typeof useCampaignEdits>;
