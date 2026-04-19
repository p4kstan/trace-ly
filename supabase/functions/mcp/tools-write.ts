// MCP write tools — execute mutations on Google Ads via google-ads-mutate.
// Every action is recorded in automation_actions for audit + UI visibility.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type SB = ReturnType<typeof createClient>;

interface ExecCtx {
  supabase: SB;
  workspaceId: string;
  tokenId: string;
  trigger?: string;
}

async function logAction(
  ctx: ExecCtx,
  action: string,
  status: "success" | "failed" | "dry_run",
  fields: Record<string, unknown>,
) {
  await ctx.supabase.from("automation_actions").insert({
    workspace_id: ctx.workspaceId,
    token_id: ctx.tokenId,
    trigger: ctx.trigger || "agent",
    action,
    status,
    ...fields,
  });
}

async function callGoogleAdsMutate(body: Record<string, unknown>) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-ads-mutate`;
  // Service-role token grants the function the right to bypass jwt verification flow.
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}

export async function execCampaignsPause(
  ctx: ExecCtx,
  params: { customer_id: string; campaign_id: string },
) {
  const res = await callGoogleAdsMutate({
    workspace_id: ctx.workspaceId,
    customer_id: params.customer_id,
    action: "update_campaign_status",
    campaign_id: params.campaign_id,
    status: "PAUSED",
  });
  await logAction(ctx, "campaigns.pause", res.ok ? "success" : "failed", {
    target_type: "campaign",
    target_id: params.campaign_id,
    customer_id: params.customer_id,
    after_value: { status: "PAUSED" },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

export async function execCampaignsResume(
  ctx: ExecCtx,
  params: { customer_id: string; campaign_id: string },
) {
  const res = await callGoogleAdsMutate({
    workspace_id: ctx.workspaceId,
    customer_id: params.customer_id,
    action: "update_campaign_status",
    campaign_id: params.campaign_id,
    status: "ENABLED",
  });
  await logAction(ctx, "campaigns.resume", res.ok ? "success" : "failed", {
    target_type: "campaign",
    target_id: params.campaign_id,
    customer_id: params.customer_id,
    after_value: { status: "ENABLED" },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

export async function execCampaignsUpdateBudget(
  ctx: ExecCtx,
  params: { customer_id: string; campaign_id: string; daily_amount: number },
) {
  // Two-step: get budget resource, then update.
  const lookup = await callGoogleAdsMutate({
    workspace_id: ctx.workspaceId,
    customer_id: params.customer_id,
    action: "get_campaign_budget",
    campaign_id: params.campaign_id,
  });
  if (!lookup.ok || !lookup.data?.budget_resource) {
    await logAction(ctx, "campaigns.update_budget", "failed", {
      target_type: "campaign",
      target_id: params.campaign_id,
      customer_id: params.customer_id,
      error_message: "budget_resource lookup failed",
    });
    return lookup;
  }
  const before = Number(lookup.data?.budget_micros ?? 0) / 1_000_000;

  const res = await callGoogleAdsMutate({
    workspace_id: ctx.workspaceId,
    customer_id: params.customer_id,
    action: "update_budget",
    budget_resource: lookup.data.budget_resource,
    budget_micros: Math.round(params.daily_amount * 1_000_000),
  });
  await logAction(ctx, "campaigns.update_budget", res.ok ? "success" : "failed", {
    target_type: "campaign",
    target_id: params.campaign_id,
    customer_id: params.customer_id,
    before_value: { daily_amount: before },
    after_value: { daily_amount: params.daily_amount },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

// Bid modifier + ad-group status are exposed as dry_run today (the underlying
// google-ads-mutate function only implements campaign status + budget). We log
// the intent so agents can see exactly what they tried, and we can wire it up
// in google-ads-mutate without touching the MCP contract.
export async function execAdGroupsSetStatus(
  ctx: ExecCtx,
  params: { customer_id: string; ad_group_id: string; status: "ENABLED" | "PAUSED" },
) {
  await logAction(ctx, "ad_groups.set_status", "dry_run", {
    target_type: "ad_group",
    target_id: params.ad_group_id,
    customer_id: params.customer_id,
    after_value: { status: params.status },
    metadata_json: { note: "queued — google-ads-mutate ad_group action not wired yet" },
  });
  return { ok: true, status: 202, data: { queued: true, dry_run: true } };
}

export async function execBidModifiersUpdate(
  ctx: ExecCtx,
  params: {
    customer_id: string;
    campaign_id: string;
    criterion: string;
    modifier: number;
  },
) {
  await logAction(ctx, "bid_modifiers.update", "dry_run", {
    target_type: "campaign",
    target_id: params.campaign_id,
    customer_id: params.customer_id,
    after_value: { criterion: params.criterion, modifier: params.modifier },
    metadata_json: { note: "queued — google-ads-mutate bid_modifier action not wired yet" },
  });
  return { ok: true, status: 202, data: { queued: true, dry_run: true } };
}
