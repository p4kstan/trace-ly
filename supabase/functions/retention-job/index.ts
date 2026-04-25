// retention-job
// ─────────────────────────────────────────────────────────────────────────
// Operational retention: prunes/archives old rows from `tracked_events`,
// `event_queue` and `audit_logs` based on per-workspace policy.
//
// SAFETY:
//   - DRY-RUN by default. Real deletes ONLY when:
//       a) caller passes ?execute=1 AND a valid CRON_SECRET header, OR
//       b) caller is an authenticated workspace owner with execute=true body.
//   - NEVER touches `orders`, `identities`, `profiles`, `workspaces`.
//   - Defaults: delivered=180d, retry=365d, dead_letter=365d, audit_logs=365d.
//   - Also calls cleanup_rate_limit_buckets() and cleanup_expired_ga4_cache().
//
// Returns counts per category and per workspace. No PII.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { installSafeConsole } from "../_shared/install-safe-console.ts";

installSafeConsole("retention-job");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

interface Policy {
  workspace_id: string;
  delivered_days: number;
  retry_days: number;
  dead_letter_days: number;
  audit_log_days: number;
}

const DEFAULT_POLICY: Omit<Policy, "workspace_id"> = {
  delivered_days: 180,
  retry_days: 365,
  dead_letter_days: 365,
  audit_log_days: 365,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const executeParam = url.searchParams.get("execute") === "1";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const cronAuthorized = CRON_SECRET.length > 0 && cronHeader === CRON_SECRET;

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Authorization: cron OR authenticated owner ──────────────────────
  let scopedWorkspaceId: string | null = body?.workspace_id || null;
  let canExecute = cronAuthorized && executeParam;

  if (!cronAuthorized) {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!scopedWorkspaceId) {
      return new Response(JSON.stringify({ error: "workspace_id_required_for_user_run" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isMember } = await supa.rpc("is_workspace_member", {
      _user_id: user.id, _workspace_id: scopedWorkspaceId,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    canExecute = body?.execute === true;
  }

  const dryRun = !canExecute;

  // ── Resolve policies ────────────────────────────────────────────────
  let policies: Policy[] = [];
  if (scopedWorkspaceId) {
    const { data } = await supa
      .from("retention_policies")
      .select("*")
      .eq("workspace_id", scopedWorkspaceId)
      .maybeSingle();
    policies = [{
      workspace_id: scopedWorkspaceId,
      ...DEFAULT_POLICY,
      ...(data || {}),
    } as Policy];
  } else {
    // Cron mode: walk all workspaces (cap 5000 to keep response bounded).
    const { data: ws } = await supa.from("workspaces").select("id").limit(5000);
    const { data: pols } = await supa.from("retention_policies").select("*").limit(5000);
    const polMap = new Map<string, Policy>(
      (pols || []).map((p: any) => [p.workspace_id, p as Policy]),
    );
    policies = (ws || []).map((w: any) => ({
      workspace_id: w.id,
      ...DEFAULT_POLICY,
      ...(polMap.get(w.id) || {}),
    } as Policy));
  }

  const summary: Record<string, unknown>[] = [];

  for (const p of policies) {
    const cutoffDelivered = new Date(Date.now() - p.delivered_days * 86_400_000).toISOString();
    const cutoffRetry = new Date(Date.now() - p.retry_days * 86_400_000).toISOString();
    const cutoffDead = new Date(Date.now() - p.dead_letter_days * 86_400_000).toISOString();
    const cutoffAudit = new Date(Date.now() - p.audit_log_days * 86_400_000).toISOString();

    const counts = {
      tracked_events_delivered: 0,
      event_queue_retry: 0,
      event_queue_dead_letter: 0,
      audit_logs: 0,
    };

    // Count first (always, for dry-run report).
    const [te, eqRetry, eqDead, al] = await Promise.all([
      supa.from("tracked_events").select("id", { count: "exact", head: true })
        .eq("workspace_id", p.workspace_id).eq("status", "delivered").lt("created_at", cutoffDelivered),
      supa.from("event_queue").select("id", { count: "exact", head: true })
        .eq("workspace_id", p.workspace_id).eq("status", "retry").lt("updated_at", cutoffRetry),
      supa.from("event_queue").select("id", { count: "exact", head: true })
        .eq("workspace_id", p.workspace_id).eq("status", "dead_letter").lt("updated_at", cutoffDead),
      supa.from("audit_logs").select("id", { count: "exact", head: true })
        .eq("workspace_id", p.workspace_id).lt("created_at", cutoffAudit),
    ]);
    counts.tracked_events_delivered = te.count || 0;
    counts.event_queue_retry = eqRetry.count || 0;
    counts.event_queue_dead_letter = eqDead.count || 0;
    counts.audit_logs = al.count || 0;

    if (!dryRun) {
      // Execute deletes — capped batches to avoid timeouts.
      const cap = 5000;
      await supa.from("tracked_events").delete()
        .eq("workspace_id", p.workspace_id).eq("status", "delivered")
        .lt("created_at", cutoffDelivered).limit(cap);
      await supa.from("event_queue").delete()
        .eq("workspace_id", p.workspace_id).eq("status", "retry")
        .lt("updated_at", cutoffRetry).limit(cap);
      await supa.from("event_queue").delete()
        .eq("workspace_id", p.workspace_id).eq("status", "dead_letter")
        .lt("updated_at", cutoffDead).limit(cap);
      await supa.from("audit_logs").delete()
        .eq("workspace_id", p.workspace_id).lt("created_at", cutoffAudit).limit(cap);
    }

    summary.push({
      workspace_id: p.workspace_id,
      cutoffs: { cutoffDelivered, cutoffRetry, cutoffDead, cutoffAudit },
      counts,
      executed: !dryRun,
    });
  }

  // Side-channel cleanups (cron-only).
  let buckets_cleared = 0;
  let ga4_cache_cleared = 0;
  if (!dryRun) {
    const r1 = await supa.rpc("cleanup_rate_limit_buckets");
    const r2 = await supa.rpc("cleanup_expired_ga4_cache");
    buckets_cleared = (r1.data as number) || 0;
    ga4_cache_cleared = (r2.data as number) || 0;
  }

  return new Response(JSON.stringify({
    ok: true,
    dry_run: dryRun,
    policies_processed: summary.length,
    summary: summary.slice(0, 200),
    side_effects: { buckets_cleared, ga4_cache_cleared },
    generated_at: new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
