/**
 * use-multi-account-overview — busca métricas consolidadas de todas as contas
 * Google Ads conectadas no workspace via edge function `google-ads-multi-account`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MultiAccountPeriod = "7d" | "14d" | "30d" | "90d";

export interface MultiAccountTotals {
  cost: number; clicks: number; impressions: number; conversions: number; conv_value: number;
  ctr: number; cpc: number; cpa: number; roas: number; conv_rate: number;
}
export interface MultiAccountRow {
  customer_id: string;
  name: string;
  status: "ok" | "error";
  error?: string;
  totals: MultiAccountTotals;
}
export interface MultiAccountTopCampaign {
  customer_id: string;
  account_name: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  cost: number; clicks: number; impressions: number; conversions: number; conv_value: number;
  cpa: number; roas: number;
}
export interface MultiAccountResponse {
  ok: true;
  period: MultiAccountPeriod;
  totals: MultiAccountTotals;
  accounts: MultiAccountRow[];
  top_campaigns: MultiAccountTopCampaign[];
}

export function useMultiAccountOverview(workspaceId: string | undefined, period: MultiAccountPeriod) {
  return useQuery({
    queryKey: ["multi-account-overview", workspaceId, period],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<MultiAccountResponse> => {
      const { data, error } = await supabase.functions.invoke("google-ads-multi-account", {
        body: { workspace_id: workspaceId, period },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });
}
