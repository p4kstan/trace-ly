import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Event Replay — re-enqueue dead_letter_events back into event_queue
 * POST /event-replay { job_id, workspace_id }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { job_id, workspace_id } = await req.json();
    if (!job_id || !workspace_id) {
      return new Response(JSON.stringify({ error: "Missing job_id or workspace_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get job
    const { data: job, error: jobErr } = await supabase
      .from("event_replay_jobs")
      .select("*")
      .eq("id", job_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as running
    await supabase.from("event_replay_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job_id);

    // Get dead letter events matching filters
    const filters = job.filter_json || {};
    let query = supabase.from("dead_letter_events")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: true })
      .limit(500);

    if (filters.provider) query = query.eq("provider", filters.provider);
    if (filters.source_type) query = query.eq("source_type", filters.source_type);

    const { data: deadEvents, error: dlErr } = await query;

    if (dlErr || !deadEvents?.length) {
      await supabase.from("event_replay_jobs")
        .update({ status: "completed", completed_at: new Date().toISOString(), total_events: 0 })
        .eq("id", job_id);

      return new Response(JSON.stringify({ status: "completed", replayed: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update total
    await supabase.from("event_replay_jobs")
      .update({ total_events: deadEvents.length })
      .eq("id", job_id);

    let replayed = 0;
    let failed = 0;

    for (const evt of deadEvents) {
      try {
        // Re-enqueue into event_queue (upsert + ignoreDuplicates evita reinjeção dupla)
        const { error: insertErr } = await supabase.from("event_queue").upsert({
          workspace_id: evt.workspace_id,
          provider: evt.provider || "meta",
          payload_json: evt.payload_json || {},
          status: "queued",
          attempt_count: 0,
          event_id: evt.source_id,
        }, { onConflict: "workspace_id,event_id,provider", ignoreDuplicates: true });

        if (insertErr) {
          failed++;
          continue;
        }

        // Remove from dead letter
        await supabase.from("dead_letter_events").delete().eq("id", evt.id);
        replayed++;
      } catch {
        failed++;
      }

      // Progress update every 50
      if ((replayed + failed) % 50 === 0) {
        await supabase.from("event_replay_jobs")
          .update({ replayed_events: replayed, failed_events: failed })
          .eq("id", job_id);
      }
    }

    // Final update
    await supabase.from("event_replay_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        replayed_events: replayed,
        failed_events: failed,
      })
      .eq("id", job_id);

    return new Response(JSON.stringify({ status: "completed", replayed, failed }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Event replay error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
