/**
 * useCampaignMetrics — centralizes ALL data fetching for the Google Ads
 * Campaign Detail page. Returns one stable object with grouped queries +
 * mutations + derived chart data, so the page stays presentation-only.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGoogleAdsReport, type GoogleAdsPeriod } from "./use-google-ads-report";
import { usePeriodComparison } from "./use-period-comparison";

export type Period = GoogleAdsPeriod;

export const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Últimos 7 dias",
  "14d": "Últimos 14 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
};

interface UseCampaignMetricsArgs {
  workspaceId: string | undefined;
  customerId: string;
  campaignId: string;
}

export function useCampaignMetrics({ workspaceId, customerId, campaignId }: UseCampaignMetricsArgs) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("7d");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const compare = usePeriodComparison({ workspaceId, customerId, campaignId, period, enabled: compareEnabled });

  const r = (level: string, parentId?: string) =>
    useGoogleAdsReport({ workspaceId, customerId, level, period, campaignId, parentId });

  // Group all reports
  const detail = r("campaign_detail");
  const series = r("time_series");
  const camp = r("campaigns");
  const adGroups = r("ad_groups", campaignId);
  const keywords = r("keywords");
  const negKeywordsCamp = r("negative_keywords");
  const negKeywordsShared = r("negative_keywords_shared");
  const negKeywordsAg = r("negative_keywords_ad_group");
  const searchTerms = r("search_terms");
  const ageData = r("age");
  const genderData = r("gender");
  const deviceData = r("device");
  const geoData = r("geo");
  const audienceData = r("audience");
  const extensions = r("extensions");
  const ads = r("ads");
  const bidModifiers = r("bid_modifiers");
  const adSchedule = r("ad_schedule");
  const locationsTargeted = r("locations_targeted");
  const landingPages = r("landing_pages");
  const conversionActions = r("conversion_actions");
  const qualityShare = r("campaign_quality");
  const history = r("change_history");

  const campaign = detail.data?.rows?.[0];
  const totals = camp.data?.totals;

  const toggleStatus = useMutation({
    mutationFn: async (newStatus: "ENABLED" | "PAUSED") => {
      if (!workspaceId) throw new Error("No workspace");
      const { data, error } = await supabase.functions.invoke("google-ads-mutate", {
        body: {
          workspace_id: workspaceId,
          customer_id: customerId,
          action: "update_campaign_status",
          campaign_id: campaignId,
          status: newStatus,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["gads-detail"] });
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const updateBudget = useMutation({
    mutationFn: async (amount: number) => {
      if (!workspaceId) throw new Error("No workspace");
      const { data: budgetData, error: e1 } = await supabase.functions.invoke("google-ads-mutate", {
        body: {
          workspace_id: workspaceId,
          customer_id: customerId,
          action: "get_campaign_budget",
          campaign_id: campaignId,
        },
      });
      if (e1) throw e1;
      if (!budgetData?.budget_resource) throw new Error("Budget resource not found");
      const { data, error } = await supabase.functions.invoke("google-ads-mutate", {
        body: {
          workspace_id: workspaceId,
          customer_id: customerId,
          action: "update_budget",
          budget_resource: budgetData.budget_resource,
          budget_micros: Math.round(amount * 1_000_000),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Orçamento atualizado");
      qc.invalidateQueries({ queryKey: ["gads-detail"] });
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  const chartData = useMemo(() => {
    if (!series.data?.rows) return [];
    return series.data.rows.map((row: Record<string, unknown>) => ({
      date: row.date as string,
      cost: Number(row.cost ?? 0),
      clicks: Number(row.clicks ?? 0),
      conversions: Number(row.conversions ?? 0),
      roas: Number(row.roas ?? 0),
    }));
  }, [series.data]);

  const isLoadingHeader: boolean = detail.isLoading || camp.isLoading;
  const errMsg: string | undefined =
    (detail.error as Error | null)?.message ?? (camp.error as Error | null)?.message;

  return {
    period,
    setPeriod,
    compareEnabled,
    setCompareEnabled,
    comparePrev: (compare.data ?? null) as Awaited<ReturnType<typeof usePeriodComparison>["data"]> | null,
    compareLoading: compare.isLoading,
    campaign,
    totals,
    chartData,
    isLoadingHeader,
    errMsg,
    reports: {
      detail, series, camp, adGroups, keywords,
      negKeywordsCamp, negKeywordsShared, negKeywordsAg,
      searchTerms, ageData, genderData, deviceData, geoData,
      audienceData, extensions, ads, bidModifiers, adSchedule,
      locationsTargeted, landingPages, conversionActions,
      qualityShare, history,
    },
    toggleStatus,
    updateBudget,
  };
}
