/**
 * audience-seed-export
 *
 * Exports a first-party audience seed (HASHES ONLY) of buyers/leads for use as
 * Customer Match / Custom Audiences seed in Google Ads, Meta, TikTok, etc.
 *
 * IMPORTANT — what this is and what it is NOT:
 *  - This REUSES the workspace's own first-party data (CRM/CDP-style),
 *    which the workspace legally collected, with consent.
 *  - This DOES NOT and CANNOT copy the internal learning of Google's, Meta's,
 *    or TikTok's optimization model. There is no API for that.
 *  - The platform-side optimizer still has to learn from this seed; the seed
 *    only accelerates audience targeting / lookalike construction.
 *
 * Output is HASHES ONLY (sha256 hex of normalized email/phone/external_id).
 * Raw PII is never returned, never logged, never written to disk.
 *
 * Auth: requires user JWT. Caller must be a workspace member (RLS-equivalent
 * check via is_workspace_member).
 *
 * Body:
 *   {
 *     workspace_id: uuid,
 *     platform: "google_ads" | "meta" | "tiktok" | "generic",
 *     destination_customer_id?: string,    // optional ad account hint
 *     since_days?: number,                 // default 90, max 365
 *     min_order_value?: number,            // default 0
 *     limit?: number,                      // default 5000, max 50000
 *     require_consent?: boolean,           // default true
 *   }
 *
 * Response:
 *   {
 *     export_id: uuid,
 *     platform, row_count,
 *     hashes: [{ email_hash, phone_hash, external_id_hash }, ...],
 *     note: "first-party seed; not a copy of Google/Meta internal learning",
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { installSafeConsole } from "../_shared/install-safe-console.ts";

installSafeConsole("audience-seed-export");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Body {
  workspace_id: string;
  platform: "google_ads" | "meta" | "tiktok" | "generic";
  destination_customer_id?: string;
  since_days?: number;
  min_order_value?: number;
  limit?: number;
  require_consent?: boolean;
  /**
   * dry_run/preview mode: returns ONLY counters and field-availability
   * counts. NEVER returns hashes, NEVER writes an audit row marked
   * `completed`. Safe for size estimation and consent-impact preview.
   */
  dry_run?: boolean;
}

const PAID_STATUSES = new Set([
  "paid", "approved", "confirmed", "succeeded", "captured",
  "pix_paid", "order_paid", "RECEIVED", "CONFIRMED", "APPROVED", "PAID",
]);

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  return t || null;
}
function normPhone(s: string | null | undefined): string | null {
  if (!s) return null;
  const digits = String(s).replace(/\D+/g, "");
  return digits || null;
}
function normExternal(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  return t || null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Detect whether a string already looks like a sha256 hex (64 chars, hex). */
function looksHashed(s: string | null | undefined): boolean {
  return !!s && /^[a-f0-9]{64}$/i.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const workspaceId = body.workspace_id;
    const platform = body.platform;
    if (!workspaceId || !platform) {
      return json({ error: "workspace_id and platform are required" }, 400);
    }
    if (!["google_ads", "meta", "tiktok", "generic"].includes(platform)) {
      return json({ error: "invalid platform" }, 400);
    }

    const sinceDays = Math.min(Math.max(Number(body.since_days) || 90, 1), 365);
    const minValue = Math.max(Number(body.min_order_value) || 0, 0);
    const limit = Math.min(Math.max(Number(body.limit) || 5000, 1), 50000);
    const requireConsent = body.require_consent !== false; // default TRUE
    const destinationCustomerId = body.destination_customer_id?.toString().slice(0, 100) || null;
    const dryRun = body.dry_run === true;

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Authorization: caller must be workspace member ──
    const { data: isMember, error: memberErr } = await service.rpc("is_workspace_member", {
      _user_id: userId,
      _workspace_id: workspaceId,
    });
    if (memberErr) {
      console.error("is_workspace_member error", memberErr.message);
      return json({ error: "authorization check failed" }, 500);
    }
    if (!isMember) {
      return json({ error: "Forbidden: not a member of this workspace" }, 403);
    }

    // ── DRY-RUN / PREVIEW MODE ──
    // Returns only counts. Never returns hashes. Never writes a
    // `completed` audit row. Logs counters only (no PII).
    if (dryRun) {
      const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();
      let q = service
        .from("orders")
        .select("identity_id, total, status, ads_consent_granted", { count: "exact", head: false })
        .eq("workspace_id", workspaceId)
        .gte("created_at", sinceIso)
        .gte("total", minValue)
        .not("identity_id", "is", null)
        .limit(Math.min(limit * 2, 5000));
      if (requireConsent) q = q.eq("ads_consent_granted", true);
      const { data: orders, error: ordersErr, count: totalMatched } = await q;
      if (ordersErr) {
        console.error("dry_run orders query failed", ordersErr.message);
        return json({ error: "preview query failed" }, 500);
      }
      const seen = new Set<string>();
      let paidUnique = 0;
      for (const o of orders || []) {
        const status = String((o as any).status || "");
        if (!PAID_STATUSES.has(status) && !PAID_STATUSES.has(status.toLowerCase())) continue;
        const id = (o as any).identity_id as string | null;
        if (!id || seen.has(id)) continue;
        seen.add(id); paidUnique++;
        if (paidUnique >= limit) break;
      }
      // Sample identity field availability — counts only, no values.
      const idIds = Array.from(seen).slice(0, Math.min(paidUnique, 1000));
      let withEmail = 0, withPhone = 0, withExternalId = 0;
      if (idIds.length > 0) {
        const { data: idents } = await service
          .from("identities")
          .select("email, email_hash, phone, phone_hash, external_id")
          .eq("workspace_id", workspaceId)
          .in("id", idIds);
        for (const i of (idents || []) as any[]) {
          if (i.email_hash || i.email) withEmail++;
          if (i.phone_hash || i.phone) withPhone++;
          if (i.external_id) withExternalId++;
        }
      }
      console.log(JSON.stringify({
        evt: "audience_seed_export.preview",
        workspace_id: workspaceId, platform,
        rows_eligible: paidUnique, sample_inspected: idIds.length,
        with_email: withEmail, with_phone: withPhone, with_external_id: withExternalId,
        since_days: sinceDays, require_consent: requireConsent,
      }));
      return json({
        dry_run: true,
        platform,
        rows_eligible: paidUnique,
        orders_matched: typeof totalMatched === "number" ? totalMatched : (orders?.length ?? 0),
        sample_inspected: idIds.length,
        field_availability: {
          email_or_email_hash: withEmail,
          phone_or_phone_hash: withPhone,
          external_id: withExternalId,
        },
        filters: { since_days: sinceDays, min_order_value: minValue, limit, require_consent: requireConsent },
        note: "preview only — no hashes, no PII, no export written",
      });
    }


    const { data: jobRow, error: jobErr } = await service
      .from("audience_seed_exports")
      .insert({
        workspace_id: workspaceId,
        platform,
        destination_customer_id: destinationCustomerId,
        require_consent: requireConsent,
        filters_json: {
          since_days: sinceDays,
          min_order_value: minValue,
          limit,
          require_consent: requireConsent,
        },
        row_count: 0,
        status: "running",
        user_id: userId,
      } as never)
      .select("id")
      .single();
    if (jobErr) {
      console.error("create audit job failed", jobErr.message);
      return json({ error: "failed to create audit row" }, 500);
    }
    const exportId = (jobRow as any).id as string;

    try {
      const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();

      // Fetch paid orders within window. We rely on RLS-equivalent filtering
      // via service role + explicit workspace_id filter (since we already
      // checked workspace membership above).
      let q = service
        .from("orders")
        .select("identity_id, total, status, created_at, ads_consent_granted")
        .eq("workspace_id", workspaceId)
        .gte("created_at", sinceIso)
        .gte("total", minValue)
        .not("identity_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(limit * 2); // overfetch slightly to account for filtering
      if (requireConsent) {
        q = q.eq("ads_consent_granted", true);
      }
      const { data: orders, error: ordersErr } = await q;
      if (ordersErr) throw ordersErr;

      // Filter by paid statuses, dedupe identity_ids preserving most recent
      const seenIdentities = new Set<string>();
      const identityIds: string[] = [];
      for (const o of orders || []) {
        const status = String((o as any).status || "").trim();
        if (!PAID_STATUSES.has(status) && !PAID_STATUSES.has(status.toLowerCase())) continue;
        const id = (o as any).identity_id as string | null;
        if (!id || seenIdentities.has(id)) continue;
        seenIdentities.add(id);
        identityIds.push(id);
        if (identityIds.length >= limit) break;
      }

      if (identityIds.length === 0) {
        await service.from("audience_seed_exports")
          .update({ status: "completed", row_count: 0 } as never)
          .eq("id", exportId);
        return json({
          export_id: exportId,
          platform,
          row_count: 0,
          hashes: [],
          note: "first-party seed; not a copy of Google/Meta internal learning",
          message: "No buyers found matching filters.",
        });
      }

      // Pull identities (potentially has hashed columns already; if not, hash here)
      let idQ = service
        .from("identities")
        .select("id, email, email_hash, phone, phone_hash, external_id, ads_consent_granted")
        .eq("workspace_id", workspaceId)
        .in("id", identityIds);
      if (requireConsent) {
        idQ = idQ.eq("ads_consent_granted", true);
      }
      const { data: identities, error: idErr } = await idQ;
      if (idErr) throw idErr;

      // Build HASH-ONLY rows
      const hashes: Array<{ email_hash: string | null; phone_hash: string | null; external_id_hash: string | null }> = [];
      for (const ident of identities || []) {
        const i = ident as any;

        let emailHash: string | null = i.email_hash || null;
        if (!emailHash) {
          const norm = normEmail(i.email);
          if (norm) emailHash = looksHashed(norm) ? norm : await sha256Hex(norm);
        }
        let phoneHash: string | null = i.phone_hash || null;
        if (!phoneHash) {
          const norm = normPhone(i.phone);
          if (norm) phoneHash = looksHashed(norm) ? norm : await sha256Hex(norm);
        }
        let externalIdHash: string | null = null;
        const extNorm = normExternal(i.external_id);
        if (extNorm) externalIdHash = looksHashed(extNorm) ? extNorm : await sha256Hex(extNorm);

        if (!emailHash && !phoneHash && !externalIdHash) continue;
        hashes.push({ email_hash: emailHash, phone_hash: phoneHash, external_id_hash: externalIdHash });
      }

      // Update audit row with success (NEVER log raw PII)
      await service.from("audience_seed_exports")
        .update({ status: "completed", row_count: hashes.length } as never)
        .eq("id", exportId);

      // Log only counts (NO PII)
      console.log(JSON.stringify({
        evt: "audience_seed_export.completed",
        export_id: exportId, workspace_id: workspaceId, platform,
        rows: hashes.length, since_days: sinceDays, require_consent: requireConsent,
      }));

      return json({
        export_id: exportId,
        platform,
        destination_customer_id: destinationCustomerId,
        row_count: hashes.length,
        hashes,
        note: "first-party seed; not a copy of Google/Meta internal learning",
        instructions: {
          google_ads:
            "Upload as Customer Match list via Google Ads UI or Admin API. Fields are pre-hashed (sha256 hex of normalized values).",
          meta:
            "Upload as Custom Audience via Meta Ads Manager or Marketing API. Fields are pre-hashed (sha256 hex of normalized values).",
          tiktok:
            "Upload as Custom Audience via TikTok Ads Manager. Fields are pre-hashed (sha256 hex of normalized values).",
          generic:
            "Generic CSV-style hashed seed. Use as input for any first-party audience tooling.",
        }[platform],
      });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
      console.error("audience-seed-export failed", msg);
      await service.from("audience_seed_exports")
        .update({ status: "failed", error_message: msg } as never)
        .eq("id", exportId);
      return json({ error: msg, export_id: exportId }, 500);
    }
  } catch (e) {
    console.error("audience-seed-export top-level error", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
