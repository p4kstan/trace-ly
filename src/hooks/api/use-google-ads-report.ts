/**
 * Hook to invoke the google-ads-reports edge function with consistent error parsing.
 * Used by the campaign detail page across multiple report levels (campaign, ad_groups, keywords, etc).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GoogleAdsPeriod = "7d" | "14d" | "30d" | "90d";

interface UseGoogleAdsReportOptions {
  workspaceId: string | undefined;
  customerId: string;
  level: string;
  period: GoogleAdsPeriod;
  campaignId?: string;
  parentId?: string;
}

export function useGoogleAdsReport({
  workspaceId,
  customerId,
  level,
  period,
  campaignId,
  parentId,
}: UseGoogleAdsReportOptions) {
  return useQuery({
    queryKey: ["gads-detail", workspaceId, customerId, level, period, campaignId, parentId],
    enabled: !!workspaceId && !!customerId && !!campaignId,
    staleTime: 60_000,
    queryFn: async () => {
      const body: Record<string, unknown> = { workspace_id: workspaceId, customer_id: customerId, level, period };
      if (campaignId) body.campaign_id = campaignId;
      if (parentId) body.parent_id = parentId;
      const { data, error } = await supabase.functions.invoke("google-ads-reports", { body });
      if (error) {
        let info: { error?: string } | null = null;
        try {
          info = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.() || null;
        } catch {
          /* ignore */
        }
        throw new Error(info?.error || error.message);
      }
      return data as { ok: true; rows: any[]; totals: any; count: number };
    },
  });
}
