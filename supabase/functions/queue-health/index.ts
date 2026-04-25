// queue-health
// ─────────────────────────────────────────────────────────────────────────
// Read-only health snapshot of the delivery pipeline.
// Returns counters and aging metrics used by the /retry-observability panel
// AND a lightweight machine-readable status (`ok` | `warn` | `critical`)
// so it can drive a future ops alert without exposing PII.
//
// Auth:  workspace member (JWT). NEVER returns customer data.
// Method: POST  { workspace_id }
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { installSafeConsole } from "../_shared/install-safe-console.ts";

installSafeConsole("queue-health");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type GroupRow = {
  provider: string;
  destination: string;
  queued: number;
  retry: number;
  dead_letter: number;
  oldest_queued_age_ms: number;
  oldest_retry_age_ms: number;
  max_attempts_seen: number;
};

function ageMs(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Date.now() - new Date(iso).getTime());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const workspace_id = body?.workspace_id;
  if (!workspace_id || typeof workspace_id !== "string") {
    return new Response(JSON.stringify({ error: "workspace_id_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: isMember, error: memberErr } = await supabase
    .rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspace_id });
  if (memberErr || !isMember) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Pull last 7d of queue rows + last 24h of dead-letters ───────────
  const sinceQueueIso = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const sinceDlIso = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [queueRes, dlRes] = await Promise.all([
    supabase
      .from("event_queue")
      .select("provider, destination, status, attempt_count, created_at, updated_at, next_retry_at")
      .eq("workspace_id", workspace_id)
      .gte("updated_at", sinceQueueIso)
      .limit(5000),
    supabase
      .from("dead_letter_events")
      .select("provider, source_type, retry_count, created_at")
      .eq("workspace_id", workspace_id)
      .gte("created_at", sinceDlIso)
      .limit(2000),
  ]);

  if (queueRes.error) {
    console.error("queue-health: queue query failed", queueRes.error.message);
    return new Response(JSON.stringify({ error: "query_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const queueRows = queueRes.data || [];
  const dlRows = dlRes.data || [];

  // ── Group by provider+destination ───────────────────────────────────
  const groups = new Map<string, GroupRow>();
  for (const r of queueRows as any[]) {
    const key = `${r.provider}|${r.destination}`;
    const g = groups.get(key) || {
      provider: r.provider, destination: r.destination,
      queued: 0, retry: 0, dead_letter: 0,
      oldest_queued_age_ms: 0, oldest_retry_age_ms: 0,
      max_attempts_seen: 0,
    };
    if (r.status === "queued") {
      g.queued++;
      g.oldest_queued_age_ms = Math.max(g.oldest_queued_age_ms, ageMs(r.created_at));
    } else if (r.status === "retry") {
      g.retry++;
      g.oldest_retry_age_ms = Math.max(g.oldest_retry_age_ms, ageMs(r.created_at));
    } else if (r.status === "dead_letter") {
      g.dead_letter++;
    }
    g.max_attempts_seen = Math.max(g.max_attempts_seen, r.attempt_count || 0);
    groups.set(key, g);
  }

  const groupsArr = Array.from(groups.values()).sort(
    (a, b) => (b.dead_letter + b.retry) - (a.dead_letter + a.retry),
  );

  // ── Top-level KPIs ──────────────────────────────────────────────────
  const dead_letter_count = dlRows.length;
  const retry_age_max = groupsArr.reduce((m, g) => Math.max(m, g.oldest_retry_age_ms), 0);
  const queued_age_max = groupsArr.reduce((m, g) => Math.max(m, g.oldest_queued_age_ms), 0);
  const retry_total = groupsArr.reduce((s, g) => s + g.retry, 0);

  // Status thresholds (ops-friendly defaults).
  let status: "ok" | "warn" | "critical" = "ok";
  if (dead_letter_count > 0 || retry_age_max > 4 * 60 * 60_000) status = "warn";
  if (dead_letter_count > 25 || retry_age_max > 12 * 60 * 60_000 || queued_age_max > 6 * 60 * 60_000) {
    status = "critical";
  }

  return new Response(JSON.stringify({
    status,
    window: { queue_days: 7, dead_letter_hours: 24 },
    totals: {
      dead_letter_count,
      retry_total,
      retry_age_max_ms: retry_age_max,
      queued_age_max_ms: queued_age_max,
    },
    groups: groupsArr.slice(0, 100), // cap response size
    generated_at: new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
