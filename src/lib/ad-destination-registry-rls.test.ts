import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Passo R — RLS audit for the new normalized destination registry.
 *
 * The migration MUST:
 *   - create the table inside `public`,
 *   - enable Row-Level Security,
 *   - have a SELECT policy gated by `is_workspace_member`,
 *   - have INSERT/UPDATE/DELETE policies gated by `is_workspace_admin`,
 *   - expose `data_reuse_summary` and `list_ad_conversion_destinations`
 *     as `SECURITY DEFINER` (member-gated), with EXECUTE granted only to
 *     `authenticated`.
 *
 * Reading directly from the migration file keeps this audit deterministic
 * and CI-friendly even when a live database is unavailable.
 */
const MIGRATION_DIR = resolve(__dirname, "../../supabase/migrations");

import { readdirSync } from "node:fs";

function findMigrationContaining(needle: string): string {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql"));
  for (const f of files) {
    const body = readFileSync(resolve(MIGRATION_DIR, f), "utf8");
    if (body.includes(needle)) return body;
  }
  throw new Error(`No migration contains marker: ${needle}`);
}

const SOURCE = findMigrationContaining("ad_conversion_destinations");

describe("ad_conversion_destinations RLS audit (Passo R)", () => {
  it("creates the table in public schema", () => {
    expect(SOURCE).toMatch(/CREATE TABLE IF NOT EXISTS public\.ad_conversion_destinations/);
  });

  it("ENABLE ROW LEVEL SECURITY is present", () => {
    expect(SOURCE).toMatch(/ALTER TABLE public\.ad_conversion_destinations ENABLE ROW LEVEL SECURITY/);
  });

  it("SELECT policy is gated by is_workspace_member", () => {
    expect(SOURCE).toMatch(/acd_select_member[\s\S]*FOR SELECT[\s\S]*is_workspace_member/);
  });

  it("INSERT/UPDATE/DELETE policies are gated by is_workspace_admin", () => {
    expect(SOURCE).toMatch(/acd_insert_admin[\s\S]*FOR INSERT[\s\S]*is_workspace_admin/);
    expect(SOURCE).toMatch(/acd_update_admin[\s\S]*FOR UPDATE[\s\S]*is_workspace_admin/);
    expect(SOURCE).toMatch(/acd_delete_admin[\s\S]*FOR DELETE[\s\S]*is_workspace_admin/);
  });

  it("data_reuse_summary RPC is SECURITY DEFINER + member-gated, no PII columns selected", () => {
    expect(SOURCE).toMatch(/FUNCTION public\.data_reuse_summary[\s\S]*SECURITY DEFINER/);
    expect(SOURCE).toMatch(/is_workspace_member\(auth\.uid\(\), _workspace_id\)/);
    // Must NOT expose any raw PII fields back to the caller — only counts.
    // (i.e. no `SELECT customer_email` outside aggregation contexts.)
    const rpcSlice = SOURCE.match(/FUNCTION public\.data_reuse_summary[\s\S]*?\$\$;/);
    expect(rpcSlice).toBeTruthy();
    const body = rpcSlice![0];
    expect(body).not.toMatch(/RETURN[\s\S]*customer_email/i);
    expect(body).not.toMatch(/RETURN[\s\S]*customer_phone/i);
  });

  it("list_ad_conversion_destinations RPC is SECURITY DEFINER and excludes secrets", () => {
    expect(SOURCE).toMatch(/FUNCTION public\.list_ad_conversion_destinations[\s\S]*SECURITY DEFINER/);
    const rpcSlice = SOURCE.match(/FUNCTION public\.list_ad_conversion_destinations[\s\S]*?\$\$;/);
    expect(rpcSlice).toBeTruthy();
    // Should not expose any column that even smells like a secret.
    expect(rpcSlice![0]).not.toMatch(/access_token|secret|password/i);
  });

  it("EXECUTE on RPCs is granted only to `authenticated`, not PUBLIC", () => {
    expect(SOURCE).toMatch(/REVOKE ALL ON FUNCTION public\.data_reuse_summary[\s\S]*FROM PUBLIC/);
    expect(SOURCE).toMatch(/GRANT EXECUTE ON FUNCTION public\.data_reuse_summary[\s\S]*TO authenticated/);
    expect(SOURCE).toMatch(/REVOKE ALL ON FUNCTION public\.list_ad_conversion_destinations[\s\S]*FROM PUBLIC/);
    expect(SOURCE).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_ad_conversion_destinations[\s\S]*TO authenticated/);
  });
});
