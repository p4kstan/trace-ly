/**
 * Hook que busca lista detalhada de campaigns/adsets/ads de UMA conta Meta
 * via edge function `meta-ads-reports`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MetaPeriod } from "./use-meta-multi-account-overview";

export type MetaLevel = "campaign" | "adset" | "ad";

export interface MetaReportRow {
  id: string;
  name: string;
  status: string;
  objective?: string;
  campaign_id?: string;
  adset_id?: string;
  spend: number; clicks: number; impressions: number; conversions: number; conv_value: number;
  ctr: number; cpc: number; cpa: number; roas: number;
}

interface UseMetaAdsReportsOptions {
  workspaceId: string | undefined;
  accountId: string | undefined;
  period: MetaPeriod;
  level: MetaLevel;
  parentId?: string;
  enabled?: boolean;
}

export function useMetaAdsReports({ workspaceId, accountId, period, level, parentId, enabled = true }: UseMetaAdsReportsOptions) {
  return useQuery({
    queryKey: ["meta-ads-reports", workspaceId, accountId, period, level, parentId],
    enabled: enabled && !!workspaceId && !!accountId,
    staleTime: 60_000,
    queryFn: async () => {
      const body: Record<string, unknown> = { workspace_id: workspaceId, account_id: accountId, period, level };
      if (parentId) body.parent_id = parentId;
      const { data, error } = await supabase.functions.invoke("meta-ads-reports", { body });
      if (error) {
        let info: { error?: string; reconnect?: boolean; account_id?: string } | null = null;
        try { info = await (error as { context?: { json?: () => Promise<any> } })?.context?.json?.() || null; } catch { /* */ }
        const err = new Error(info?.error || error.message) as Error & { reconnect?: boolean; accountId?: string };
        if (info?.reconnect) { err.reconnect = true; err.accountId = info.account_id; }
        throw err;
      }
      return data as { ok: true; rows: MetaReportRow[]; totals: any; count: number };
    },
  });
}
