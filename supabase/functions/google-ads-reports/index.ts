import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`refresh failed: ${JSON.stringify(j)}`);
  return { access_token: j.access_token as string, expires_in: j.expires_in as number };
}

function dateRangeClause(period: string, customFrom?: string, customTo?: string) {
  switch (period) {
    case "today": return "segments.date DURING TODAY";
    case "yesterday": return "segments.date DURING YESTERDAY";
    case "7d": return "segments.date DURING LAST_7_DAYS";
    case "14d": return "segments.date DURING LAST_14_DAYS";
    case "30d": return "segments.date DURING LAST_30_DAYS";
    case "90d": {
      const today = new Date();
      const past = new Date(); past.setDate(today.getDate() - 90);
      return `segments.date BETWEEN '${past.toISOString().slice(0,10)}' AND '${today.toISOString().slice(0,10)}'`;
    }
    case "custom": {
      if (!customFrom || !customTo) return "segments.date DURING LAST_7_DAYS";
      return `segments.date BETWEEN '${customFrom}' AND '${customTo}'`;
    }
    default: return "segments.date DURING LAST_7_DAYS";
  }
}

function buildQuery(level: string, period: string, customFrom?: string, customTo?: string, parentId?: string, campaignId?: string) {
  const dateClause = dateRangeClause(period, customFrom, customTo);
  const campFilter = campaignId ? `AND campaign.id = ${campaignId}` : "";

  if (level === "campaigns") {
    return `
      SELECT
        campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
        campaign_budget.amount_micros, campaign.bidding_strategy_type,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.cost_per_conversion, metrics.search_impression_share
      FROM campaign
      WHERE ${dateClause} ${campFilter}
      ORDER BY metrics.cost_micros DESC
    `;
  }

  if (level === "ad_groups") {
    const filter = parentId ? `AND campaign.id = ${parentId}` : "";
    return `
      SELECT
        ad_group.id, ad_group.name, ad_group.status, ad_group.type,
        campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.cost_per_conversion
      FROM ad_group
      WHERE ${dateClause} ${filter}
      ORDER BY metrics.cost_micros DESC
    `;
  }

  if (level === "ads") {
    const filter = parentId ? `AND ad_group.id = ${parentId}` : campFilter;
    return `
      SELECT
        ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
        ad_group_ad.status, ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group.id, ad_group.name, campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.cost_per_conversion
      FROM ad_group_ad
      WHERE ${dateClause} ${filter}
      ORDER BY metrics.cost_micros DESC
    `;
  }

  if (level === "keywords") {
    return `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.quality_info.quality_score,
        ad_group.id, ad_group.name, campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value,
        metrics.cost_per_conversion, metrics.search_impression_share
      FROM keyword_view
      WHERE ${dateClause} ${campFilter}
        AND ad_group_criterion.negative = FALSE
      ORDER BY metrics.cost_micros DESC
      LIMIT 500
    `;
  }

  if (level === "negative_keywords") {
    // Campaign-level negatives
    return `
      SELECT
        campaign_criterion.criterion_id,
        campaign_criterion.keyword.text,
        campaign_criterion.keyword.match_type,
        campaign_criterion.negative,
        campaign_criterion.type,
        campaign.id, campaign.name
      FROM campaign_criterion
      WHERE campaign_criterion.negative = TRUE
        AND campaign_criterion.type = KEYWORD
        ${campaignId ? `AND campaign.id = ${campaignId}` : ""}
      LIMIT 500
    `;
  }

  if (level === "negative_keywords_ad_group") {
    // Ad-group-level negatives
    return `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.negative,
        ad_group.id, ad_group.name,
        campaign.id, campaign.name
      FROM ad_group_criterion
      WHERE ad_group_criterion.negative = TRUE
        AND ad_group_criterion.type = KEYWORD
        ${campaignId ? `AND campaign.id = ${campaignId}` : ""}
      LIMIT 500
    `;
  }

  if (level === "negative_keywords_shared") {
    // Shared negative keyword lists attached to the campaign
    return `
      SELECT
        shared_criterion.criterion_id,
        shared_criterion.keyword.text,
        shared_criterion.keyword.match_type,
        shared_criterion.type,
        shared_set.id,
        shared_set.name,
        shared_set.type,
        shared_set.status
      FROM shared_criterion
      WHERE shared_criterion.type = KEYWORD
        AND shared_set.type = NEGATIVE_KEYWORDS
        AND shared_set.status = ENABLED
      LIMIT 500
    `;
  }

  if (level === "search_terms") {
    return `
      SELECT
        search_term_view.search_term,
        search_term_view.status,
        segments.keyword.info.text,
        segments.keyword.info.match_type,
        ad_group.id, ad_group.name, campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM search_term_view
      WHERE ${dateClause} ${campFilter}
      ORDER BY metrics.cost_micros DESC
      LIMIT 500
    `;
  }

  if (level === "age") {
    return `
      SELECT
        ad_group_criterion.age_range.type,
        ad_group.id, ad_group.name, campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM age_range_view
      WHERE ${dateClause} ${campFilter}
    `;
  }

  if (level === "gender") {
    return `
      SELECT
        ad_group_criterion.gender.type,
        ad_group.id, ad_group.name, campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM gender_view
      WHERE ${dateClause} ${campFilter}
    `;
  }

  if (level === "device") {
    return `
      SELECT
        segments.device,
        campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE ${dateClause} ${campFilter}
    `;
  }

  if (level === "geo") {
    return `
      SELECT
        geographic_view.country_criterion_id,
        geographic_view.location_type,
        campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM geographic_view
      WHERE ${dateClause} ${campFilter}
      LIMIT 200
    `;
  }

  if (level === "audience") {
    return `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.display_name,
        ad_group_criterion.type,
        ad_group.id, ad_group.name, campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM ad_group_audience_view
      WHERE ${dateClause} ${campFilter}
      LIMIT 200
    `;
  }

  if (level === "extensions") {
    return `
      SELECT
        campaign.id, campaign.name,
        asset.id, asset.name, asset.type,
        asset.text_asset.text,
        asset.sitelink_asset.link_text,
        asset.sitelink_asset.description1,
        asset.callout_asset.callout_text,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions
      FROM campaign_asset
      WHERE ${dateClause} ${campFilter}
      LIMIT 200
    `;
  }

  if (level === "time_series") {
    return `
      SELECT
        segments.date,
        campaign.id,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE ${dateClause} ${campFilter}
      ORDER BY segments.date ASC
    `;
  }

  if (level === "campaign_detail") {
    return `
      SELECT
        campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
        campaign.advertising_channel_sub_type, campaign.start_date, campaign.end_date,
        campaign.serving_status, campaign.bidding_strategy_type,
        campaign.optimization_score, campaign.network_settings.target_google_search,
        campaign.network_settings.target_search_network, campaign.network_settings.target_content_network,
        campaign_budget.amount_micros, campaign_budget.delivery_method, campaign_budget.period
      FROM campaign
      WHERE campaign.id = ${campaignId}
      LIMIT 1
    `;
  }

  if (level === "bid_modifiers") {
    return `
      SELECT
        campaign_bid_modifier.criterion_id,
        campaign_bid_modifier.bid_modifier,
        campaign_bid_modifier.interaction_type.type,
        campaign.id, campaign.name
      FROM campaign_bid_modifier
      WHERE campaign.id = ${campaignId}
      LIMIT 200
    `;
  }

  if (level === "ad_schedule") {
    return `
      SELECT
        campaign_criterion.criterion_id,
        campaign_criterion.ad_schedule.day_of_week,
        campaign_criterion.ad_schedule.start_hour,
        campaign_criterion.ad_schedule.end_hour,
        campaign_criterion.ad_schedule.start_minute,
        campaign_criterion.ad_schedule.end_minute,
        campaign_criterion.bid_modifier,
        campaign.id, campaign.name
      FROM campaign_criterion
      WHERE campaign_criterion.type = AD_SCHEDULE
        AND campaign.id = ${campaignId}
      LIMIT 200
    `;
  }

  if (level === "locations_targeted") {
    return `
      SELECT
        campaign_criterion.criterion_id,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.negative,
        campaign_criterion.bid_modifier,
        campaign.id, campaign.name
      FROM campaign_criterion
      WHERE campaign_criterion.type = LOCATION
        AND campaign.id = ${campaignId}
      LIMIT 200
    `;
  }

  if (level === "landing_pages") {
    return `
      SELECT
        landing_page_view.unexpanded_final_url,
        campaign.id, campaign.name,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM landing_page_view
      WHERE ${dateClause} ${campFilter}
      ORDER BY metrics.cost_micros DESC
      LIMIT 200
    `;
  }

  if (level === "conversion_actions") {
    return `
      SELECT
        conversion_action.id,
        conversion_action.name,
        conversion_action.category,
        conversion_action.status,
        conversion_action.type,
        conversion_action.primary_for_goal,
        conversion_action.value_settings.default_value,
        conversion_action.value_settings.default_currency_code,
        conversion_action.counting_type
      FROM conversion_action
      WHERE conversion_action.status != REMOVED
      LIMIT 100
    `;
  }

  if (level === "campaign_quality") {
    return `
      SELECT
        campaign.id, campaign.name,
        metrics.search_impression_share,
        metrics.search_top_impression_share,
        metrics.search_absolute_top_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share,
        metrics.search_budget_lost_top_impression_share,
        metrics.search_rank_lost_top_impression_share
      FROM campaign
      WHERE ${dateClause} AND campaign.id = ${campaignId}
    `;
  }

  if (level === "change_history") {
    const now = new Date();
    const past = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
    return `
      SELECT
        change_event.change_date_time, change_event.change_resource_type,
        change_event.client_type, change_event.user_email,
        change_event.resource_change_operation, change_event.changed_fields,
        change_event.campaign, change_event.ad_group,
        campaign.id
      FROM change_event
      WHERE change_event.change_date_time >= '${fmt(past)}'
        AND change_event.change_date_time <= '${fmt(now)}'
      ${campaignId ? `AND campaign.id = ${campaignId}` : ""}
      ORDER BY change_event.change_date_time DESC
      LIMIT 100
    `;
  }

  throw new Error(`unknown level: ${level}`);
}

function baseMetrics(m: any) {
  return {
    impressions: Number(m?.impressions ?? 0),
    clicks: Number(m?.clicks ?? 0),
    ctr: Number(m?.ctr ?? 0),
    average_cpc_micros: Number(m?.averageCpc ?? 0),
    cost_micros: Number(m?.costMicros ?? 0),
    conversions: Number(m?.conversions ?? 0),
    conversions_value: Number(m?.conversionsValue ?? 0),
    cost_per_conversion_micros: Number(m?.costPerConversion ?? 0),
  };
}

function mapRow(level: string, r: any) {
  const m = r.metrics || {};
  const base = baseMetrics(m);

  if (level === "campaigns") {
    return {
      id: String(r.campaign?.id ?? ""),
      name: r.campaign?.name ?? "",
      status: r.campaign?.status ?? null,
      channel_type: r.campaign?.advertisingChannelType ?? null,
      bidding_strategy_type: r.campaign?.biddingStrategyType ?? null,
      budget_micros: Number(r.campaignBudget?.amountMicros ?? 0),
      search_impression_share: m.searchImpressionShare != null ? Number(m.searchImpressionShare) : null,
      ...base,
    };
  }

  if (level === "ad_groups") {
    return {
      id: String(r.adGroup?.id ?? ""),
      name: r.adGroup?.name ?? "",
      status: r.adGroup?.status ?? null,
      type: r.adGroup?.type ?? null,
      campaign_id: String(r.campaign?.id ?? ""),
      campaign_name: r.campaign?.name ?? "",
      ...base,
    };
  }

  if (level === "ads") {
    const ad = r.adGroupAd?.ad ?? {};
    const rsa = ad.responsiveSearchAd ?? {};
    return {
      id: String(ad.id ?? ""),
      name: ad.name || (rsa.headlines?.[0]?.text ?? `Anúncio ${ad.id}`),
      type: ad.type ?? null,
      status: r.adGroupAd?.status ?? null,
      final_urls: ad.finalUrls ?? [],
      headlines: (rsa.headlines || []).map((h: any) => h.text).filter(Boolean),
      descriptions: (rsa.descriptions || []).map((d: any) => d.text).filter(Boolean),
      ad_group_id: String(r.adGroup?.id ?? ""),
      ad_group_name: r.adGroup?.name ?? "",
      campaign_id: String(r.campaign?.id ?? ""),
      campaign_name: r.campaign?.name ?? "",
      ...base,
    };
  }

  if (level === "keywords") {
    const c = r.adGroupCriterion ?? {};
    return {
      id: String(c.criterionId ?? ""),
      name: c.keyword?.text ?? "",
      match_type: c.keyword?.matchType ?? null,
      status: c.status ?? null,
      quality_score: c.qualityInfo?.qualityScore ?? null,
      ad_group_id: String(r.adGroup?.id ?? ""),
      ad_group_name: r.adGroup?.name ?? "",
      campaign_id: String(r.campaign?.id ?? ""),
      campaign_name: r.campaign?.name ?? "",
      search_impression_share: m.searchImpressionShare != null ? Number(m.searchImpressionShare) : null,
      ...base,
    };
  }

  if (level === "negative_keywords") {
    const c = r.campaignCriterion ?? {};
    return {
      id: String(c.criterionId ?? ""),
      name: c.keyword?.text ?? "",
      match_type: c.keyword?.matchType ?? null,
      level: "Campanha",
      campaign_name: r.campaign?.name ?? "",
    };
  }

  if (level === "negative_keywords_ad_group") {
    const c = r.adGroupCriterion ?? {};
    return {
      id: String(c.criterionId ?? ""),
      name: c.keyword?.text ?? "",
      match_type: c.keyword?.matchType ?? null,
      level: "Grupo de anúncios",
      ad_group_name: r.adGroup?.name ?? "",
      campaign_name: r.campaign?.name ?? "",
    };
  }

  if (level === "negative_keywords_shared") {
    const c = r.sharedCriterion ?? {};
    const s = r.sharedSet ?? {};
    return {
      id: `${s.id ?? ""}-${c.criterionId ?? ""}`,
      name: c.keyword?.text ?? "",
      match_type: c.keyword?.matchType ?? null,
      level: `Lista: ${s.name ?? "—"}`,
      shared_set_name: s.name ?? "",
    };
  }

  if (level === "search_terms") {
    const sv = r.searchTermView ?? {};
    return {
      id: `${sv.searchTerm}-${r.adGroup?.id || ""}`,
      name: sv.searchTerm ?? "",
      status: sv.status ?? null,
      matched_keyword: r.segments?.keyword?.info?.text ?? null,
      match_type: r.segments?.keyword?.info?.matchType ?? null,
      ad_group_name: r.adGroup?.name ?? "",
      campaign_name: r.campaign?.name ?? "",
      ...base,
    };
  }

  if (level === "age") {
    return {
      id: r.adGroupCriterion?.ageRange?.type ?? "UNKNOWN",
      name: r.adGroupCriterion?.ageRange?.type ?? "Desconhecido",
      ad_group_name: r.adGroup?.name ?? "",
      ...base,
    };
  }

  if (level === "gender") {
    return {
      id: r.adGroupCriterion?.gender?.type ?? "UNKNOWN",
      name: r.adGroupCriterion?.gender?.type ?? "Desconhecido",
      ad_group_name: r.adGroup?.name ?? "",
      ...base,
    };
  }

  if (level === "device") {
    return {
      id: r.segments?.device ?? "UNKNOWN",
      name: r.segments?.device ?? "Desconhecido",
      ...base,
    };
  }

  if (level === "geo") {
    return {
      id: String(r.geographicView?.countryCriterionId ?? ""),
      name: `${r.geographicView?.locationType ?? ""} ${r.geographicView?.countryCriterionId ?? ""}`,
      ...base,
    };
  }

  if (level === "audience") {
    return {
      id: String(r.adGroupCriterion?.criterionId ?? ""),
      name: r.adGroupCriterion?.displayName ?? r.adGroupCriterion?.type ?? "Audiência",
      type: r.adGroupCriterion?.type ?? null,
      ad_group_name: r.adGroup?.name ?? "",
      ...base,
    };
  }

  if (level === "extensions") {
    const a = r.asset ?? {};
    return {
      id: String(a.id ?? ""),
      name: a.name || a.sitelinkAsset?.linkText || a.calloutAsset?.calloutText || a.textAsset?.text || "Asset",
      type: a.type ?? null,
      sitelink_text: a.sitelinkAsset?.linkText ?? null,
      sitelink_description: a.sitelinkAsset?.description1 ?? null,
      callout_text: a.calloutAsset?.calloutText ?? null,
      ...base,
    };
  }

  if (level === "time_series") {
    return {
      date: r.segments?.date,
      ...base,
    };
  }

  if (level === "campaign_detail") {
    const c = r.campaign ?? {};
    return {
      id: String(c.id ?? ""),
      name: c.name ?? "",
      status: c.status ?? null,
      channel_type: c.advertisingChannelType ?? null,
      sub_type: c.advertisingChannelSubType ?? null,
      start_date: c.startDate ?? null,
      end_date: c.endDate ?? null,
      serving_status: c.servingStatus ?? null,
      bidding_strategy_type: c.biddingStrategyType ?? null,
      optimization_score: c.optimizationScore ?? null,
      target_google_search: c.networkSettings?.targetGoogleSearch ?? null,
      target_search_network: c.networkSettings?.targetSearchNetwork ?? null,
      target_content_network: c.networkSettings?.targetContentNetwork ?? null,
      budget_micros: Number(r.campaignBudget?.amountMicros ?? 0),
      budget_delivery_method: r.campaignBudget?.deliveryMethod ?? null,
      budget_period: r.campaignBudget?.period ?? null,
    };
  }

  if (level === "bid_modifiers") {
    const c = r.campaignBidModifier ?? {};
    return {
      id: String(c.criterionId ?? ""),
      name: c.interactionType?.type ?? "—",
      bid_modifier: c.bidModifier != null ? Number(c.bidModifier) : null,
      campaign_name: r.campaign?.name ?? "",
    };
  }

  if (level === "ad_schedule") {
    const s = r.campaignCriterion?.adSchedule ?? {};
    const c = r.campaignCriterion ?? {};
    return {
      id: String(c.criterionId ?? ""),
      name: `${s.dayOfWeek ?? "—"} ${String(s.startHour ?? "").padStart(2,"0")}:${String(s.startMinute ?? "ZERO").replace("ZERO","00")} → ${String(s.endHour ?? "").padStart(2,"0")}:${String(s.endMinute ?? "ZERO").replace("ZERO","00")}`,
      day: s.dayOfWeek ?? "—",
      bid_modifier: c.bidModifier != null ? Number(c.bidModifier) : null,
    };
  }

  if (level === "locations_targeted") {
    const c = r.campaignCriterion ?? {};
    const geoConst = c.location?.geoTargetConstant ?? "";
    return {
      id: String(c.criterionId ?? ""),
      name: geoConst.replace("geoTargetConstants/", "ID ") || "—",
      negative: c.negative ?? false,
      bid_modifier: c.bidModifier != null ? Number(c.bidModifier) : null,
    };
  }

  if (level === "landing_pages") {
    return {
      id: r.landingPageView?.unexpandedFinalUrl ?? "",
      name: r.landingPageView?.unexpandedFinalUrl ?? "—",
      ...base,
    };
  }

  if (level === "conversion_actions") {
    const a = r.conversionAction ?? {};
    return {
      id: String(a.id ?? ""),
      name: a.name ?? "",
      category: a.category ?? null,
      status: a.status ?? null,
      type: a.type ?? null,
      primary: a.primaryForGoal ?? false,
      counting_type: a.countingType ?? null,
      default_value: a.valueSettings?.defaultValue != null ? Number(a.valueSettings.defaultValue) : null,
      currency: a.valueSettings?.defaultCurrencyCode ?? null,
    };
  }

  if (level === "campaign_quality") {
    const m = r.metrics ?? {};
    return {
      id: String(r.campaign?.id ?? ""),
      name: r.campaign?.name ?? "",
      search_impression_share: m.searchImpressionShare != null ? Number(m.searchImpressionShare) : null,
      search_top_impression_share: m.searchTopImpressionShare != null ? Number(m.searchTopImpressionShare) : null,
      search_absolute_top_impression_share: m.searchAbsoluteTopImpressionShare != null ? Number(m.searchAbsoluteTopImpressionShare) : null,
      search_budget_lost_impression_share: m.searchBudgetLostImpressionShare != null ? Number(m.searchBudgetLostImpressionShare) : null,
      search_rank_lost_impression_share: m.searchRankLostImpressionShare != null ? Number(m.searchRankLostImpressionShare) : null,
      search_budget_lost_top_impression_share: m.searchBudgetLostTopImpressionShare != null ? Number(m.searchBudgetLostTopImpressionShare) : null,
      search_rank_lost_top_impression_share: m.searchRankLostTopImpressionShare != null ? Number(m.searchRankLostTopImpressionShare) : null,
    };
  }

  if (level === "change_history") {
    const ce = r.changeEvent ?? {};
    return {
      id: `${ce.changeDateTime}-${Math.random()}`,
      change_date_time: ce.changeDateTime,
      resource_type: ce.changeResourceType,
      client_type: ce.clientType,
      user_email: ce.userEmail,
      operation: ce.resourceChangeOperation,
      changed_fields: ce.changedFields,
      campaign: ce.campaign,
      ad_group: ce.adGroup,
    };
  }

  return base;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const {
      workspace_id,
      customer_id,
      level = "campaigns",
      period = "7d",
      from: customFrom,
      to: customTo,
      parent_id,
      campaign_id,
    } = body || {};

    if (!workspace_id) return json({ error: "workspace_id required" }, 400);

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let credQuery = service.from("google_ads_credentials").select("*").eq("workspace_id", workspace_id);
    if (customer_id) credQuery = credQuery.eq("customer_id", customer_id);
    else credQuery = credQuery.order("is_default", { ascending: false });

    const { data: credList } = await credQuery.limit(1);
    const cred = credList?.[0];
    if (!cred) return json({ error: "Google Ads not connected", reconnect: true }, 400);

    let accessToken = cred.access_token as string;
    if (!cred.token_expires_at || new Date(cred.token_expires_at).getTime() < Date.now()) {
      if (!cred.refresh_token) {
        return json({ error: "No refresh token, reconnect required", reconnect: true, customer_id: cred.customer_id }, 400);
      }
      try {
        const refreshed = await refreshAccessToken(cred.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
        await service.from("google_ads_credentials").update({
          access_token: accessToken,
          token_expires_at: newExpiry,
        }).eq("workspace_id", workspace_id).eq("customer_id", cred.customer_id);
      } catch {
        return json({ error: "Refresh token invalid, reconnect required", reconnect: true, customer_id: cred.customer_id }, 400);
      }
    }

    const developerToken = cred.developer_token || Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const customerId = cred.customer_id;

    let query = buildQuery(level, period, customFrom, customTo, parent_id, campaign_id);
    if (level === "change_history" && campaign_id) {
      query = query.replace("CUSTOMER_ID", customerId);
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    const loginCustomerId = (cred.login_customer_id as string | null)?.replace(/-/g, "");
    if (loginCustomerId && loginCustomerId !== customerId) {
      headers["login-customer-id"] = loginCustomerId;
    }

    const adsRes = await fetch(
      `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      }
    );

    const text = await adsRes.text();
    let adsJson: any;
    try { adsJson = JSON.parse(text); } catch {
      console.error("non-JSON response", text.slice(0, 500));
      return json({ error: "Google Ads API returned non-JSON response", detail: text.slice(0, 500) }, 502);
    }

    if (!adsRes.ok) {
      console.error("ads api error", adsJson);
      return json({ error: "Google Ads API error", detail: adsJson }, 502);
    }

    const results = adsJson.results || [];
    console.log(`[reports] level=${level} campaign=${campaign_id} raw_results=${results.length}`);

    // For aggregated levels, group by id; for time_series and change_history, keep all rows
    const noAggregate = ["time_series", "change_history", "search_terms", "campaign_detail", "negative_keywords", "negative_keywords_ad_group", "negative_keywords_shared", "bid_modifiers", "ad_schedule", "locations_targeted", "conversion_actions", "campaign_quality", "ads"];

    let rows: any[];
    if (noAggregate.includes(level)) {
      rows = results.map((r: any) => mapRow(level, r));
    } else {
      const map = new Map<string, any>();
      for (const r of results) {
        const mapped: any = mapRow(level, r);
        if (!mapped.id) continue;
        const existing = map.get(mapped.id);
        if (!existing) {
          map.set(mapped.id, mapped);
        } else {
          existing.impressions = (existing.impressions || 0) + (mapped.impressions || 0);
          existing.clicks = (existing.clicks || 0) + (mapped.clicks || 0);
          existing.cost_micros = (existing.cost_micros || 0) + (mapped.cost_micros || 0);
          existing.conversions = (existing.conversions || 0) + (mapped.conversions || 0);
          existing.conversions_value = (existing.conversions_value || 0) + (mapped.conversions_value || 0);
        }
      }
      rows = Array.from(map.values());
    }

    // Compute derived metrics
    rows = rows.map((row: any) => {
      if (row.cost_micros == null) return row;
      const cost = (row.cost_micros || 0) / 1_000_000;
      const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
      const cpc = row.clicks > 0 ? cost / row.clicks : 0;
      const cpa = row.conversions > 0 ? cost / row.conversions : 0;
      const roas = cost > 0 ? (row.conversions_value || 0) / cost : 0;
      const conv_rate = row.clicks > 0 ? (row.conversions || 0) / row.clicks : 0;
      return { ...row, cost, ctr, cpc, cpa, roas, conv_rate, budget: row.budget_micros ? row.budget_micros / 1_000_000 : undefined };
    });

    // Totals
    const totalsBase = rows.reduce((acc: any, r: any) => ({
      impressions: acc.impressions + (r.impressions || 0),
      clicks: acc.clicks + (r.clicks || 0),
      cost: acc.cost + (r.cost || 0),
      conversions: acc.conversions + (r.conversions || 0),
      conversions_value: acc.conversions_value + (r.conversions_value || 0),
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 });

    const totals = {
      ...totalsBase,
      ctr: totalsBase.impressions > 0 ? totalsBase.clicks / totalsBase.impressions : 0,
      cpc: totalsBase.clicks > 0 ? totalsBase.cost / totalsBase.clicks : 0,
      cpa: totalsBase.conversions > 0 ? totalsBase.cost / totalsBase.conversions : 0,
      roas: totalsBase.cost > 0 ? totalsBase.conversions_value / totalsBase.cost : 0,
      conv_rate: totalsBase.clicks > 0 ? totalsBase.conversions / totalsBase.clicks : 0,
    };

    return json({ ok: true, rows, totals, count: rows.length });
  } catch (e) {
    console.error("reports error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
