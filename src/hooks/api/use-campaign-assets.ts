/**
 * use-campaign-assets — lista e gerencia sitelinks, callouts e structured snippets
 * vinculados a uma campanha Google Ads.
 *
 * Wraps the `google-ads-assets` edge function with React Query.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type AssetFieldType = "SITELINK" | "CALLOUT" | "STRUCTURED_SNIPPET";

export interface CampaignAssetRow {
  asset_id: string;
  asset_resource: string;
  campaign_asset_resource: string;
  field_type: AssetFieldType;
  status: string;
  link_text?: string;
  description1?: string;
  description2?: string;
  final_urls?: string[];
  callout_text?: string;
  snippet_header?: string;
  snippet_values?: string[];
}

interface Args {
  workspaceId: string | undefined;
  customerId: string;
  campaignId: string;
}

export function useCampaignAssets({ workspaceId, customerId, campaignId }: Args) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const enabled = !!workspaceId && !!customerId && !!campaignId;
  const qk = ["campaign-assets", workspaceId, customerId, campaignId];

  const list = useQuery({
    queryKey: qk,
    enabled,
    queryFn: async (): Promise<CampaignAssetRow[]> => {
      const { data, error } = await supabase.functions.invoke("google-ads-assets", {
        body: { workspace_id: workspaceId, customer_id: customerId, campaign_id: campaignId, action: "list" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.rows || [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk });

  const handleErr = (msg: string) => (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    toast({ title: msg, description: m, variant: "destructive" });
  };

  const createSitelink = useMutation({
    mutationFn: async (input: { link_text: string; final_urls: string[]; description1?: string; description2?: string }) => {
      const { data, error } = await supabase.functions.invoke("google-ads-assets", {
        body: { workspace_id: workspaceId, customer_id: customerId, campaign_id: campaignId, action: "create_sitelink", ...input },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast({ title: "Sitelink criado" }); invalidate(); },
    onError: handleErr("Erro ao criar sitelink"),
  });

  const createCallout = useMutation({
    mutationFn: async (input: { callout_text: string }) => {
      const { data, error } = await supabase.functions.invoke("google-ads-assets", {
        body: { workspace_id: workspaceId, customer_id: customerId, campaign_id: campaignId, action: "create_callout", ...input },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast({ title: "Callout criado" }); invalidate(); },
    onError: handleErr("Erro ao criar callout"),
  });

  const createSnippet = useMutation({
    mutationFn: async (input: { header: string; values: string[] }) => {
      const { data, error } = await supabase.functions.invoke("google-ads-assets", {
        body: { workspace_id: workspaceId, customer_id: customerId, campaign_id: campaignId, action: "create_snippet", ...input },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast({ title: "Structured snippet criado" }); invalidate(); },
    onError: handleErr("Erro ao criar snippet"),
  });

  const remove = useMutation({
    mutationFn: async (campaign_asset_resource: string) => {
      const { data, error } = await supabase.functions.invoke("google-ads-assets", {
        body: { workspace_id: workspaceId, customer_id: customerId, campaign_id: campaignId, action: "remove", campaign_asset_resource },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast({ title: "Extensão removida" }); invalidate(); },
    onError: handleErr("Erro ao remover"),
  });

  return { list, createSitelink, createCallout, createSnippet, remove };
}
