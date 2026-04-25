/**
 * dispatch-test (Passo T) — read-only dispatch decision simulator.
 *
 * Body: { workspace_id, provider, destination_id?, event_name?,
 *         consent_granted?, test_mode? }
 *
 * Returns the pure DispatchDecision from `decideDispatch()` over the
 * `ad_conversion_destinations` rows the caller is allowed to read. NEVER
 * sends an event to any external provider, NEVER returns the credential
 * value (only `credential_ref` is echoed, masked).
 *
 * Auth: requires a Supabase JWT (verify_jwt = true). Workspace membership
 * is enforced through RLS via the user-scoped client.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { installSafeConsole } from "../_shared/install-safe-console.ts";
import {
  decideDispatch,
  maskCredentialRef,
  type RegistryDispatchRow,
} from "../_shared/destination-dispatch-gate.ts";

installSafeConsole("dispatch-test");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-scoped client → RLS applies, callers can ONLY read destinations
    // for workspaces they belong to.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider || "").toLowerCase().trim();
    const workspaceId = String(body.workspace_id || "").trim();
    if (!provider || !workspaceId) {
      return new Response(JSON.stringify({ error: "missing_provider_or_workspace" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const destinationId = body.destination_id ? String(body.destination_id) : null;
    const eventName = body.event_name ? String(body.event_name) : null;
    const consent = body.consent_granted === true;
    const testMode = body.test_mode === true;

    let query = supabase
      .from("ad_conversion_destinations")
      .select("id,provider,destination_id,account_id,conversion_action_id,event_name,credential_ref,status,consent_gate_required,send_enabled,test_mode_default")
      .eq("workspace_id", workspaceId)
      .eq("provider", provider);
    if (destinationId) query = query.eq("destination_id", destinationId);

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: "registry_read_failed" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const registry: RegistryDispatchRow[] = (data ?? []) as never;
    const decision = decideDispatch(registry, {
      provider,
      event_name: eventName,
      consent_granted: consent,
      test_mode: testMode,
    });

    // Mask credential_ref before echoing back. Never reveal the raw value.
    const maskedTargets = decision.targets.map((t) => ({
      ...t,
      credential_ref: maskCredentialRef(t.credential_ref),
    }));

    return new Response(JSON.stringify({
      ok: true,
      provider,
      workspace_id: workspaceId,
      input: { destination_id: destinationId, event_name: eventName, consent_granted: consent, test_mode: testMode },
      decision: {
        fallback: decision.fallback,
        matched_registry_rows: decision.matched_registry_rows,
        targets: maskedTargets,
        skipped: decision.skipped,
      },
      // Reminder for the operator — this endpoint never dispatches.
      dispatched: false,
      note: "Dry-run only — nenhum evento foi enviado para nenhum provedor.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("dispatch-test error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
