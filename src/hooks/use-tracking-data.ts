import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Temporary: first workspace found. Replace with auth-based workspace selection.
export function useWorkspace() {
  return useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
}

export function useEvents(workspaceId?: string, limit = 50) {
  return useQuery({
    queryKey: ["events", workspaceId, limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useEventStats(workspaceId?: string) {
  return useQuery({
    queryKey: ["event-stats", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Get events in last 30 days
      const { data: events } = await supabase
        .from("events")
        .select("event_name, custom_data_json, created_at, source")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true });

      const allEvents = events || [];

      // Calculate metrics
      const purchases = allEvents.filter(e => e.event_name === "Purchase");
      const totalRevenue = purchases.reduce((sum, e) => {
        const val = (e.custom_data_json as Record<string, unknown>)?.value;
        return sum + (typeof val === "number" ? val : 0);
      }, 0);

      const totalConversions = purchases.length;
      const cpa = totalConversions > 0 ? totalRevenue / totalConversions : 0;

      // Revenue by day for chart
      const revenueByDay = new Map<string, { revenue: number; conversions: number }>();
      for (const evt of allEvents) {
        const day = evt.created_at.substring(0, 10);
        const existing = revenueByDay.get(day) || { revenue: 0, conversions: 0 };
        if (evt.event_name === "Purchase") {
          const val = (evt.custom_data_json as Record<string, unknown>)?.value;
          existing.revenue += typeof val === "number" ? val : 0;
          existing.conversions += 1;
        }
        revenueByDay.set(day, existing);
      }

      const revenueData = Array.from(revenueByDay.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Events by channel/source
      const channelMap = new Map<string, { conversions: number; revenue: number }>();
      for (const evt of purchases) {
        const source = evt.source || "Direct";
        const existing = channelMap.get(source) || { conversions: 0, revenue: 0 };
        const val = (evt.custom_data_json as Record<string, unknown>)?.value;
        existing.conversions += 1;
        existing.revenue += typeof val === "number" ? val : 0;
        channelMap.set(source, existing);
      }

      const channelData = Array.from(channelMap.entries())
        .map(([channel, data]) => ({ channel, ...data }))
        .sort((a, b) => b.conversions - a.conversions);

      return {
        totalRevenue,
        totalConversions,
        totalEvents: allEvents.length,
        cpa,
        roas: totalRevenue > 0 ? (totalRevenue / (totalRevenue * 0.3)).toFixed(1) + "x" : "0x",
        revenueData,
        channelData,
      };
    },
  });
}

export function useRecentEvents(workspaceId?: string, limit = 10) {
  return useQuery({
    queryKey: ["recent-events", workspaceId, limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("event_name, source, custom_data_json, created_at, processing_status")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      return data || [];
    },
  });
}

export function useSessions(workspaceId?: string, limit = 50) {
  return useQuery({
    queryKey: ["sessions", workspaceId, limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      return data || [];
    },
  });
}

export function useMetaPixels(workspaceId?: string) {
  return useQuery({
    queryKey: ["meta-pixels", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_pixels")
        .select("*")
        .eq("workspace_id", workspaceId!);
      return data || [];
    },
  });
}

export function useEventDeliveries(workspaceId?: string, limit = 20) {
  return useQuery({
    queryKey: ["event-deliveries", workspaceId, limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("event_deliveries")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      return data || [];
    },
  });
}

export function useConversions(workspaceId?: string) {
  return useQuery({
    queryKey: ["conversions", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversions")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("happened_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });
}

export function useAttributionTouches(workspaceId?: string) {
  return useQuery({
    queryKey: ["attribution-touches", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("attribution_touches")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("touch_time", { ascending: false })
        .limit(200);
      return data || [];
    },
  });
}
