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
  // Internal automation header — google-ads-mutate accepts service-role bearer
  // when x-internal-source is set, bypassing the per-user JWT check.
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "x-internal-source": "mcp",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}

// ─────────── Campaign-level ───────────

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
    after_value: { status: "PAUSED", customer_id: params.customer_id },
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
    after_value: { status: "ENABLED", customer_id: params.customer_id },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

export async function execCampaignsUpdateBudget(
  ctx: ExecCtx,
  params: { customer_id: string; campaign_id: string; daily_amount: number },
) {
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
    before_value: { daily_amount: before },
    after_value: { daily_amount: params.daily_amount, customer_id: params.customer_id },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

// ─────────── Keyword-level (granular) ───────────

export async function execKeywordsUpdateBid(
  ctx: ExecCtx,
  params: {
    customer_id: string;
    ad_group_id: string;
    ad_group_criterion_id: string;
    cpc_bid: number; // in account currency (e.g. BRL)
    reason?: string;
  },
) {
  const cpc_bid_micros = Math.round(params.cpc_bid * 1_000_000);
  const res = await callGoogleAdsMutate({
    workspace_id: ctx.workspaceId,
    customer_id: params.customer_id,
    action: "update_keyword_bid",
    ad_group_id: params.ad_group_id,
    ad_group_criterion_id: params.ad_group_criterion_id,
    cpc_bid_micros,
  });
  await logAction(ctx, "keywords.update_bid", res.ok ? "success" : "failed", {
    target_type: "keyword",
    target_id: `${params.ad_group_id}~${params.ad_group_criterion_id}`,
    after_value: { cpc_bid: params.cpc_bid, customer_id: params.customer_id },
    metadata_json: { reason: params.reason || null },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

export async function execKeywordsSetStatus(
  ctx: ExecCtx,
  params: {
    customer_id: string;
    ad_group_id: string;
    ad_group_criterion_id: string;
    status: "ENABLED" | "PAUSED";
    reason?: string;
  },
) {
  const res = await callGoogleAdsMutate({
    workspace_id: ctx.workspaceId,
    customer_id: params.customer_id,
    action: "update_keyword_status",
    ad_group_id: params.ad_group_id,
    ad_group_criterion_id: params.ad_group_criterion_id,
    status: params.status,
  });
  await logAction(ctx, "keywords.set_status", res.ok ? "success" : "failed", {
    target_type: "keyword",
    target_id: `${params.ad_group_id}~${params.ad_group_criterion_id}`,
    after_value: { status: params.status, customer_id: params.customer_id },
    metadata_json: { reason: params.reason || null },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

// ─────────── Ad-group-level ───────────

export async function execAdGroupsUpdateBid(
  ctx: ExecCtx,
  params: {
    customer_id: string;
    ad_group_id: string;
    cpc_bid: number;
    reason?: string;
  },
) {
  const cpc_bid_micros = Math.round(params.cpc_bid * 1_000_000);
  const res = await callGoogleAdsMutate({
    workspace_id: ctx.workspaceId,
    customer_id: params.customer_id,
    action: "update_ad_group_bid",
    ad_group_id: params.ad_group_id,
    cpc_bid_micros,
  });
  await logAction(ctx, "ad_groups.update_bid", res.ok ? "success" : "failed", {
    target_type: "ad_group",
    target_id: params.ad_group_id,
    after_value: { cpc_bid: params.cpc_bid, customer_id: params.customer_id },
    metadata_json: { reason: params.reason || null },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

export async function execAdGroupsSetStatus(
  ctx: ExecCtx,
  params: { customer_id: string; ad_group_id: string; status: "ENABLED" | "PAUSED" },
) {
  // Reuses google-ads-mutate update_keyword_status path for ad_groups would be wrong;
  // we still treat ad-group status as dry_run until a dedicated action is wired.
  await logAction(ctx, "ad_groups.set_status", "dry_run", {
    target_type: "ad_group",
    target_id: params.ad_group_id,
    after_value: { status: params.status, customer_id: params.customer_id },
    metadata_json: { note: "queued — google-ads-mutate ad_group status not wired yet" },
  });
  return { ok: true, status: 202, data: { queued: true, dry_run: true } };
}

// ─────────── Negative keywords ───────────

export async function execNegativeKeywordsAdd(
  ctx: ExecCtx,
  params: {
    customer_id: string;
    keyword_text: string;
    match_type: "EXACT" | "PHRASE" | "BROAD";
    level?: "campaign" | "ad_group";
    campaign_id?: string;
    ad_group_id?: string;
    reason?: string;
  },
) {
  const res = await callGoogleAdsMutate({
    workspace_id: ctx.workspaceId,
    customer_id: params.customer_id,
    action: "add_negative_keyword",
    level: params.level,
    campaign_id: params.campaign_id,
    ad_group_id: params.ad_group_id,
    keyword_text: params.keyword_text,
    match_type: params.match_type,
  });
  await logAction(ctx, "negative_keywords.add", res.ok ? "success" : "failed", {
    target_type: params.level === "ad_group" ? "ad_group" : "campaign",
    target_id: params.ad_group_id || params.campaign_id || null,
    after_value: {
      keyword_text: params.keyword_text,
      match_type: params.match_type,
      customer_id: params.customer_id,
    },
    metadata_json: { reason: params.reason || null },
    error_message: res.ok ? null : JSON.stringify(res.data).slice(0, 500),
  });
  return res;
}

// ─────────── Bid modifiers (still dry_run in mutate function) ───────────

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
    after_value: {
      criterion: params.criterion,
      modifier: params.modifier,
      customer_id: params.customer_id,
    },
    metadata_json: { note: "queued — google-ads-mutate bid_modifier action not wired yet" },
  });
  return { ok: true, status: 202, data: { queued: true, dry_run: true } };
}
