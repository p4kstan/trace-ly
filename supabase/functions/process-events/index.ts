import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.103.0/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Process pending events and deliver to configured platforms.
 * Called periodically or triggered by new events.
 * 
 * POST /process-events
 * Body: { workspace_id: string, limit?: number }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { workspace_id, limit = 100 } = body;

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get pending events
    const { data: pendingEvents, error } = await supabase
      .from("events")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("processing_status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error || !pendingEvents?.length) {
      return new Response(
        JSON.stringify({ status: "ok", message: "No pending events", count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventIds = pendingEvents.map(e => e.id);

    // Mark as processing
    await supabase
      .from("events")
      .update({ processing_status: "processing" })
      .in("id", eventIds)
      .eq("workspace_id", workspace_id);

    // Check if workspace has Meta pixels configured
    const { data: metaPixels } = await supabase
      .from("meta_pixels")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("is_active", true)
      .limit(1);

    const deliveryResults: Record<string, unknown> = {};

    // Deliver to Meta CAPI
    if (metaPixels?.length) {
      try {
        const metaResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-capi`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ event_ids: eventIds, workspace_id }),
          }
        );
        deliveryResults.meta = await metaResponse.json();
      } catch (err) {
        console.error("Meta delivery error:", err);
        deliveryResults.meta = { error: String(err) };
      }
    }

    // TODO: Add Google Ads delivery
    // TODO: Add TikTok CAPI delivery

    return new Response(
      JSON.stringify({
        status: "ok",
        processed: eventIds.length,
        deliveries: deliveryResults,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Process events error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
