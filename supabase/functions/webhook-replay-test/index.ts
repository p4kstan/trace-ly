// webhook-replay-test
// ─────────────────────────────────────────────────────────────────────────
// Staging-only test harness for replaying SANITIZED / FAKE webhook payloads
// to validate a new gateway integration BEFORE going to production.
//
// SAFETY:
//   - Authenticated by JWT (must be a workspace member).
//   - REQUIRES `test_mode: true` in the body. Anything else returns 400.
//   - Adds `X-CapiTrack-Test-Mode: 1` header when forwarding to gateway-webhook.
//   - The downstream pipeline is responsible for honoring test_mode and NOT
//     dispatching events to real ad destinations (Meta/Google/TikTok/GA4).
//   - Logs the run (no PII) into `audit_logs`.
//
// USAGE (front-end / curl):
//   POST /functions/v1/webhook-replay-test
//   {
//     "workspace_id": "uuid",
//     "gateway":      "hotmart" | "kiwify" | "yampi" | …,
//     "payload":      { ...sanitized fake payload... },
//     "test_mode":    true,
//     "label":        "smoke-001 (optional)"
//   }
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { installSafeConsole } from "../_shared/install-safe-console.ts";

installSafeConsole("webhook-replay-test");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Ad-hoc in-memory rate limit ─────────────────────────────────────────
// Backend has no shared rate-limiter primitive yet; this is best-effort and
// per-instance only. Window: 60s, max 30 replays per (workspace|user|ip) key.
// Test harness only — production webhooks are NOT rate-limited here.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 30;
const rlBuckets = new Map<string, number[]>();
function rateLimitHit(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (rlBuckets.get(key) || []).filter((t) => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_MAX) {
    const retryAfter = Math.ceil((RL_WINDOW_MS - (now - arr[0])) / 1000);
    rlBuckets.set(key, arr);
    return { ok: false, retryAfter: Math.max(retryAfter, 1) };
  }
  arr.push(now);
  rlBuckets.set(key, arr);
  return { ok: true, retryAfter: 0 };
}

const FORBIDDEN_PII_KEYS = [
  "email", "phone", "telephone", "cpf", "cnpj", "document",
  "ssn", "rg", "passport", "first_name", "last_name", "full_name",
  "address", "street", "zip", "postal_code",
];

/** Recursively scans payload for raw PII; returns array of dotted-paths found. */
function detectRawPII(node: unknown, path: string[] = []): string[] {
  if (node === null || typeof node !== "object") return [];
  const found: string[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    const isHashed = lower.endsWith("_hash") || lower.endsWith("_sha256");
    if (!isHashed && FORBIDDEN_PII_KEYS.some(p => lower === p || lower.endsWith(`_${p}`))) {
      // Allow obviously fake/empty values — we still flag for the operator.
      if (typeof v === "string" && v.length > 0) {
        found.push([...path, k].join("."));
      }
    }
    if (v && typeof v === "object") {
      found.push(...detectRawPII(v, [...path, k]));
    }
  }
  return found;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── AuthN ───────────────────────────────────────────────────────────
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

  // ── Body validation ──────────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { workspace_id, gateway, payload, test_mode, label } = body || {};

  if (!workspace_id || typeof workspace_id !== "string") {
    return new Response(JSON.stringify({ error: "workspace_id_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!gateway || typeof gateway !== "string") {
    return new Response(JSON.stringify({ error: "gateway_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (test_mode !== true) {
    return new Response(JSON.stringify({
      error: "test_mode_required",
      hint: "Replay harness only accepts test_mode=true to prevent real dispatch.",
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!payload || typeof payload !== "object") {
    return new Response(JSON.stringify({ error: "payload_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Workspace membership ────────────────────────────────────────────
  const { data: isMember, error: memberErr } = await supabase
    .rpc("is_workspace_member", { _user_id: user.id, _workspace_id: workspace_id });
  if (memberErr || !isMember) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Rate limit (best-effort, per-instance) ──────────────────────────
  // Key includes user, workspace and best-effort client IP. We never store
  // the IP — it only lives in this in-memory map for the 60s window.
  const ipHdr = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";
  const ip = ipHdr.split(",")[0].trim() || "unknown";
  const rlKey = `${workspace_id}:${user.id}:${ip}`;
  const rl = rateLimitHit(rlKey);
  if (!rl.ok) {
    return new Response(JSON.stringify({
      error: "rate_limited",
      hint: `max ${RL_MAX} replays / ${RL_WINDOW_MS / 1000}s per workspace+user+ip`,
      retry_after_seconds: rl.retryAfter,
    }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(rl.retryAfter),
      },
    });
  }

  const piiHits = detectRawPII(payload);
  if (piiHits.length > 0) {
    return new Response(JSON.stringify({
      error: "raw_pii_detected",
      paths: piiHits,
      hint: "Sanitize the payload before replaying — replace raw PII with fake/hashed values.",
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── Forward to gateway-webhook with test_mode flag ──────────────────
  const targetUrl = `${SUPABASE_URL}/functions/v1/gateway-webhook?gateway=${encodeURIComponent(gateway)}&workspace_id=${encodeURIComponent(workspace_id)}&test_mode=1`;

  const startedAt = Date.now();
  let downstreamStatus = 0;
  let downstreamBody = "";
  try {
    const r = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CapiTrack-Test-Mode": "1",
        "X-CapiTrack-Replay": "1",
        // Intentionally NO HMAC — gateway-webhook test_mode bypass handles validation.
      },
      body: JSON.stringify(payload),
    });
    downstreamStatus = r.status;
    downstreamBody = await r.text();
  } catch (e) {
    downstreamStatus = 502;
    downstreamBody = String((e as Error).message || e);
  }

  // ── Audit log (no PII) ──────────────────────────────────────────────
  await supabase.from("audit_logs").insert({
    workspace_id,
    actor_user_id: user.id,
    action: "webhook_replay_test",
    entity_type: "gateway",
    entity_id: gateway,
    metadata_json: {
      label: typeof label === "string" ? label.slice(0, 80) : null,
      gateway,
      test_mode: true,
      downstream_status: downstreamStatus,
      duration_ms: Date.now() - startedAt,
      payload_size_bytes: JSON.stringify(payload).length,
    },
  });

  return new Response(JSON.stringify({
    ok: downstreamStatus >= 200 && downstreamStatus < 300,
    test_mode: true,
    gateway,
    downstream_status: downstreamStatus,
    downstream_response: downstreamBody.slice(0, 2000),
    duration_ms: Date.now() - startedAt,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
