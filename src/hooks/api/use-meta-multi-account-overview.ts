/**
 * Hook que busca métricas consolidadas de todas as contas Meta Ads conectadas
 * via edge function `meta-ads-multi-account`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MetaPeriod = "7d" | "14d" | "30d" | "90d";

export interface MetaTotals {
  spend: number; clicks: number; impressions: number; conversions: number; conv_value: number;
  ctr: number; cpc: number; cpa: number; roas: number;
}
export interface MetaAccountRow {
  account_id: string;
  name: string;
  currency: string;
  status: "ok" | "error";
  error?: string;
  totals: MetaTotals;
}
export interface MetaTopCampaign {
  campaign_id: string;
  name: string;
  account_id: string;
  account_name: string;
  status: string;
  objective?: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conv_value: number;
  roas: number;
  cpa: number;
}
export interface MetaMultiAccountResponse {
  ok: true;
  period: MetaPeriod;
  totals: MetaTotals;
  accounts: MetaAccountRow[];
  top_campaigns: MetaTopCampaign[];
}

export function useMetaMultiAccountOverview(workspaceId: string | undefined, period: MetaPeriod) {
  return useQuery({
    queryKey: ["meta-multi-account-overview", workspaceId, period],
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MetaMultiAccountResponse> => {
      const { data, error } = await supabase.functions.invoke("meta-ads-multi-account", {
        body: { workspace_id: workspaceId, period },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });
}
