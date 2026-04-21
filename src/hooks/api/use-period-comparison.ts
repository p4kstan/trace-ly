/**
 * Fetches campaign totals for the PREVIOUS equivalent period, using
 * custom date ranges so we can compare against the user's selected period.
 *
 * Example: if period = "7d", this fetches days [-14..-8] (the prior 7 days).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GoogleAdsPeriod } from "./use-google-ads-report";

const PERIOD_DAYS: Record<GoogleAdsPeriod, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

/** Compute the [from, to] window for the period IMMEDIATELY before the active one. */
export function previousPeriodDates(period: GoogleAdsPeriod): { from: string; to: string } {
  const days = PERIOD_DAYS[period] ?? 7;
  const today = new Date();
  const to = new Date(today); to.setDate(today.getDate() - days - 1);
  const from = new Date(today); from.setDate(today.getDate() - days * 2);
  return { from: isoDate(from), to: isoDate(to) };
}

interface Args {
  workspaceId: string | undefined;
  customerId: string;
  campaignId: string;
  period: GoogleAdsPeriod;
  enabled: boolean;
}

export interface CampaignTotals {
  impressions: number; clicks: number; cost: number;
  conversions: number; conversions_value: number;
  ctr: number; cpc: number; cpa: number; roas: number; conv_rate: number;
}

export function usePeriodComparison({ workspaceId, customerId, campaignId, period, enabled }: Args) {
  return useQuery({
    queryKey: ["gads-compare", workspaceId, customerId, campaignId, period],
    enabled: enabled && !!workspaceId && !!customerId && !!campaignId,
    staleTime: 60_000,
    queryFn: async (): Promise<CampaignTotals | null> => {
      const { from, to } = previousPeriodDates(period);
      const { data, error } = await supabase.functions.invoke("google-ads-reports", {
        body: {
          workspace_id: workspaceId, customer_id: customerId,
          level: "campaigns", campaign_id: campaignId,
          period: "custom", from, to,
        },
      });
      if (error) throw new Error(error.message);
      return (data?.totals as CampaignTotals) || null;
    },
  });
}

/** Compute % delta between current and previous values. Returns null when prev is 0/missing. */
export function pctDelta(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous === 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}
