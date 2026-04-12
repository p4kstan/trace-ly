import { supabase } from "@/integrations/supabase/client";
import { ROWS_PER_PAGE } from "@/lib/constants";

export interface EventRow {
  id: string;
  event_name: string;
  source: string | null;
  processing_status: string;
  custom_data_json: Record<string, unknown> | null;
  deduplication_key: string | null;
  created_at: string;
  workspace_id: string;
}

/** Fetch paginated events for a workspace */
export async function getEvents(
  workspaceId: string,
  page = 0,
  pageSize = ROWS_PER_PAGE
): Promise<{ data: EventRow[]; count: number }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from("events")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { data: (data || []) as EventRow[], count: count || 0 };
}

/** Fetch recent events (small list for dashboard) */
export async function getRecentEvents(workspaceId: string, limit = 10) {
  const { data, error } = await supabase
    .from("events")
    .select("event_name, source, custom_data_json, created_at, processing_status")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
