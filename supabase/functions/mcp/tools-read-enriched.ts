// MCP read tools that cross-reference sales (gateway) with click identifiers
// (gclid/fbclid), keyword metadata and behavioral signals captured by the SDK.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type SB = ReturnType<typeof createClient>;

interface KeywordRef {
  keyword: string | null;
  match_type: string | null;
  keyword_id: string | null;
  source: "sdk_utm_term" | "click_view" | null;
}

// Resolve keyword for a single gclid through google-ads-mutate's lookup_keyword_by_gclid.
// Returns null on any failure to keep the agent flow non-blocking.
async function resolveKeywordByGclid(
  workspaceId: string,
  customerId: string | null,
  gclid: string,
): Promise<KeywordRef | null> {
  if (!customerId) return null;
  try {
    const r = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-ads-mutate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-internal-source": "mcp",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          customer_id: customerId,
          action: "lookup_keyword_by_gclid",
          gclid,
        }),
      },
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) return null;
    return {
      keyword: j.keyword_text ?? null,
      match_type: j.match_type ?? null,
      keyword_id: j.keyword_resource ? String(j.keyword_resource).split("~").pop() ?? null : null,
      source: "click_view",
    };
  } catch {
    return null;
  }
}

async function getDefaultGoogleAdsCustomerId(supabase: SB, workspaceId: string): Promise<string | null> {
  const { data } = await supabase
    .from("google_ads_credentials")
    .select("customer_id")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();
  return (data?.customer_id as string) ?? null;
}

export async function getEnrichedConversions(
  supabase: SB,
  workspaceId: string,
  limit = 50,
) {
  const lim = Math.min(Math.max(limit, 1), 200);

  const { data: convs } = await supabase
    .from("conversions")
    .select("id, conversion_type, value, currency, attributed_source, attributed_campaign, happened_at, event_id, identity_id, session_id")
    .eq("workspace_id", workspaceId)
    .order("happened_at", { ascending: false })
    .limit(lim);

  const ids = (convs ?? []).map((c) => c.event_id).filter(Boolean) as string[];
  const { data: events } = ids.length
    ? await supabase
        .from("events")
        .select("id, event_id, event_name, custom_data_json, user_data_json")
        .eq("workspace_id", workspaceId)
        .in("id", ids)
    : { data: [] as any[] };

  const orderIds = (events ?? [])
    .map((e: any) => e?.custom_data_json?.order_id)
    .filter(Boolean);
  const { data: orders } = orderIds.length
    ? await supabase
        .from("orders")
        .select("gateway_order_id, gclid, fbclid, ttclid, fbp, fbc, utm_source, utm_medium, utm_campaign, utm_term, utm_content, total_value, currency, paid_at")
        .eq("workspace_id", workspaceId)
        .in("gateway_order_id", orderIds)
    : { data: [] as any[] };

  const orderMap = new Map<string, any>();
  for (const o of orders ?? []) orderMap.set(o.gateway_order_id, o);
  const evtMap = new Map<string, any>();
  for (const e of events ?? []) evtMap.set(e.id, e);

  // Tier 1: utm_term from SDK is a free, low-latency keyword hint.
  // Tier 2: only fall back to click_view (Google Ads API) when utm_term is missing
  // AND we have a gclid AND a connected Google Ads customer_id.
  const customerId = await getDefaultGoogleAdsCustomerId(supabase, workspaceId);

  const enriched = await Promise.all((convs ?? []).map(async (c) => {
    const evt = evtMap.get(c.event_id as string);
    const ord = evt?.custom_data_json?.order_id ? orderMap.get(evt.custom_data_json.order_id) : null;
    const gclid = ord?.gclid ?? evt?.custom_data_json?.gclid ?? null;
    const utmTerm = ord?.utm_term ?? evt?.custom_data_json?.utm_term ?? null;
    const matchTypeHint = evt?.custom_data_json?.match_type ?? null;

    let keyword: KeywordRef | null = null;
    if (utmTerm) {
      keyword = {
        keyword: utmTerm,
        match_type: matchTypeHint,
        keyword_id: evt?.custom_data_json?.keyword_id ?? null,
        source: "sdk_utm_term",
      };
    } else if (gclid && customerId) {
      keyword = await resolveKeywordByGclid(workspaceId, customerId, gclid);
    }

    return {
      ...c,
      click_ids: ord
        ? { gclid: ord.gclid, fbclid: ord.fbclid, ttclid: ord.ttclid, fbp: ord.fbp, fbc: ord.fbc }
        : { gclid, fbclid: null, ttclid: null, fbp: null, fbc: null },
      utm: ord
        ? { source: ord.utm_source, medium: ord.utm_medium, campaign: ord.utm_campaign, term: ord.utm_term, content: ord.utm_content }
        : null,
      keyword,
      order_value: ord?.total_value ?? c.value,
    };
  }));

  const total = enriched.reduce((s, e) => s + Number(e.value || 0), 0);
  return { conversions: enriched, count: enriched.length, total_value: total };
}

export async function getRoiSnapshot(supabase: SB, workspaceId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: convs }, { data: hybrid }] = await Promise.all([
    supabase
      .from("conversions")
      .select("value, attributed_source, attributed_campaign, happened_at")
      .eq("workspace_id", workspaceId)
      .gte("happened_at", since),
    supabase
      .from("attribution_hybrid")
      .select("source, campaign, hybrid_value, conversion_value")
      .eq("workspace_id", workspaceId),
  ]);

  const revenue = (convs ?? []).reduce((s, c) => s + Number(c.value || 0), 0);
  const byChannel: Record<string, { revenue: number; conversions: number }> = {};
  for (const c of convs ?? []) {
    const ch = (c.attributed_source as string) || "Direct";
    byChannel[ch] = byChannel[ch] || { revenue: 0, conversions: 0 };
    byChannel[ch].revenue += Number(c.value || 0);
    byChannel[ch].conversions += 1;
  }

  return {
    window_days: 7,
    revenue,
    conversions: (convs ?? []).length,
    by_channel: byChannel,
    hybrid_attribution: hybrid ?? [],
    generated_at: new Date().toISOString(),
  };
}

// New: keyword behavior aggregator. Joins events (with custom_data_json.utm_term
// + behavioral signals) with conversions to give the agent a per-keyword view of
// engagement vs conversion. Identifies "scroll-heavy zero-revenue" keywords.
export async function getKeywordBehavior(
  supabase: SB,
  workspaceId: string,
  windowDays = 14,
) {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const [{ data: events }, { data: convs }] = await Promise.all([
    supabase
      .from("events")
      .select("event_name, custom_data_json, event_time")
      .eq("workspace_id", workspaceId)
      .gte("event_time", since)
      .limit(5000),
    supabase
      .from("conversions")
      .select("value, attributed_campaign, happened_at, event_id")
      .eq("workspace_id", workspaceId)
      .gte("happened_at", since),
  ]);

  type Bucket = {
    keyword: string;
    sessions: number;
    pageviews: number;
    cta_clicks: number;
    avg_scroll_pct: number;
    avg_dwell_seconds: number;
    deep_engagement: number; // scroll>=75% OR dwell>=30s
    conversions: number;
    revenue: number;
    _scrollSum: number;
    _dwellSum: number;
    _scrollSamples: number;
    _dwellSamples: number;
  };

  const map = new Map<string, Bucket>();
  const get = (k: string): Bucket => {
    let b = map.get(k);
    if (!b) {
      b = {
        keyword: k, sessions: 0, pageviews: 0, cta_clicks: 0,
        avg_scroll_pct: 0, avg_dwell_seconds: 0, deep_engagement: 0,
        conversions: 0, revenue: 0,
        _scrollSum: 0, _dwellSum: 0, _scrollSamples: 0, _dwellSamples: 0,
      };
      map.set(k, b);
    }
    return b;
  };

  for (const e of events ?? []) {
    const cd = (e as any).custom_data_json || {};
    const kw: string | null = cd.utm_term || cd.keyword || null;
    if (!kw) continue;
    const b = get(kw);
    if (e.event_name === "PageView") b.pageviews += 1;
    if (e.event_name === "AddToCart" || cd.trigger === "cta_click") b.cta_clicks += 1;
    if (typeof cd.scroll_pct === "number") {
      b._scrollSum += cd.scroll_pct;
      b._scrollSamples += 1;
      if (cd.scroll_pct >= 75) b.deep_engagement += 1;
    }
    if (typeof cd.dwell_seconds === "number") {
      b._dwellSum += cd.dwell_seconds;
      b._dwellSamples += 1;
      if (cd.dwell_seconds >= 30) b.deep_engagement += 1;
    }
    if (cd.session_id) b.sessions += 1;
  }

  // Index conversions by event_id (string) so we can attribute revenue back to a keyword.
  const convByEventId = new Map<string, { value: number }>();
  for (const c of convs ?? []) {
    if (c.event_id) convByEventId.set(c.event_id, { value: Number(c.value || 0) });
  }
  for (const e of events ?? []) {
    const conv = convByEventId.get((e as any).event_id || "");
    if (!conv) continue;
    const cd = (e as any).custom_data_json || {};
    const kw = cd.utm_term || cd.keyword || null;
    if (!kw) continue;
    const b = get(kw);
    b.conversions += 1;
    b.revenue += conv.value;
  }

  const rows = Array.from(map.values()).map((b) => {
    b.avg_scroll_pct = b._scrollSamples ? Math.round((b._scrollSum / b._scrollSamples) * 10) / 10 : 0;
    b.avg_dwell_seconds = b._dwellSamples ? Math.round((b._dwellSum / b._dwellSamples) * 10) / 10 : 0;
    return {
      keyword: b.keyword,
      sessions: b.sessions,
      pageviews: b.pageviews,
      cta_clicks: b.cta_clicks,
      avg_scroll_pct: b.avg_scroll_pct,
      avg_dwell_seconds: b.avg_dwell_seconds,
      deep_engagement_signals: b.deep_engagement,
      conversions: b.conversions,
      revenue: Math.round(b.revenue * 100) / 100,
      // Suspicious = engaged but not converting: scroll>=60% AND zero conversions.
      flag_engaged_zero_conv: b.avg_scroll_pct >= 60 && b.conversions === 0,
    };
  });

  rows.sort((a, b) => b.revenue - a.revenue);
  return { window_days: windowDays, keywords: rows, count: rows.length };
}

export async function getRecentAutomationActions(
  supabase: SB,
  workspaceId: string,
  limit = 20,
) {
  const { data } = await supabase
    .from("automation_actions")
    .select("id, action, trigger, target_type, target_id, status, before_value, after_value, error_message, created_at, metadata_json")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));
  return { actions: data ?? [], count: (data ?? []).length };
}
