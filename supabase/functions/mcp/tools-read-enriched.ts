// MCP read tools that cross-reference sales (gateway) with click identifiers
// (gclid/fbclid) and behavioral signals captured by the SDK.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type SB = ReturnType<typeof createClient>;

export async function getEnrichedConversions(
  supabase: SB,
  workspaceId: string,
  limit = 50,
) {
  const lim = Math.min(Math.max(limit, 1), 200);
  // Pull recent conversions then orders (which carry gclid/fbclid/utm) in one round-trip per table.
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

  // Find matching orders for the click ids (merge by external order id when present).
  const orderIds = (events ?? [])
    .map((e: any) => e?.custom_data_json?.order_id)
    .filter(Boolean);
  const { data: orders } = orderIds.length
    ? await supabase
        .from("orders")
        .select("gateway_order_id, gclid, fbclid, ttclid, fbp, fbc, utm_source, utm_medium, utm_campaign, total_value, currency, paid_at")
        .eq("workspace_id", workspaceId)
        .in("gateway_order_id", orderIds)
    : { data: [] as any[] };

  const orderMap = new Map<string, any>();
  for (const o of orders ?? []) orderMap.set(o.gateway_order_id, o);
  const evtMap = new Map<string, any>();
  for (const e of events ?? []) evtMap.set(e.id, e);

  const enriched = (convs ?? []).map((c) => {
    const evt = evtMap.get(c.event_id as string);
    const ord = evt?.custom_data_json?.order_id ? orderMap.get(evt.custom_data_json.order_id) : null;
    return {
      ...c,
      click_ids: ord
        ? { gclid: ord.gclid, fbclid: ord.fbclid, ttclid: ord.ttclid, fbp: ord.fbp, fbc: ord.fbc }
        : null,
      utm: ord
        ? { source: ord.utm_source, medium: ord.utm_medium, campaign: ord.utm_campaign }
        : null,
      order_value: ord?.total_value ?? c.value,
    };
  });

  const total = enriched.reduce((s, e) => s + Number(e.value || 0), 0);
  return { conversions: enriched, count: enriched.length, total_value: total };
}

export async function getRoiSnapshot(supabase: SB, workspaceId: string) {
  // Last 7d revenue from conversions + last 7d ad spend approximation from
  // attribution_results (when available). Never throws — returns zeros if missing.
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

export async function getRecentAutomationActions(
  supabase: SB,
  workspaceId: string,
  limit = 20,
) {
  const { data } = await supabase
    .from("automation_actions")
    .select("id, action, trigger, target_type, target_id, status, before_value, after_value, error_message, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));
  return { actions: data ?? [], count: (data ?? []).length };
}
