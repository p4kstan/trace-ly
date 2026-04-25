/**
 * MCP-like tool layer for the Traffic Agent.
 *
 * This file holds the *schemas* (Zod) and the *names* of every tool the agent
 * can call. The actual handlers live inside the edge function
 * `supabase/functions/traffic-agent-mcp/index.ts` — but the schemas are
 * shared with the UI for type-safe simulation and documentation.
 *
 * Tools never receive raw PII. All handlers must redact arguments via
 * `redactValue` before persisting to traffic_agent_mcp_tool_calls.
 */
import { z } from "zod";

export const ProviderEnum = z.enum(["google_ads", "meta", "tiktok", "ga4", "tracking", "queue"]);
export const ModeEnum = z.enum(["dry_run", "recommendation", "approval_required", "auto"]);

// ---- Schemas -------------------------------------------------------------

export const GetWorkspaceMetricsArgs = z.object({
  workspace_id: z.string().uuid(),
  window_days: z.number().int().min(1).max(90).default(7),
});

export const GetCampaignPerformanceArgs = z.object({
  workspace_id: z.string().uuid(),
  provider: ProviderEnum.default("google_ads"),
  account_id: z.string().optional(),
  campaign_id: z.string().optional(),
  window_days: z.number().int().min(1).max(90).default(14),
});

export const GetConversionHealthArgs = z.object({
  workspace_id: z.string().uuid(),
  window_days: z.number().int().min(1).max(30).default(7),
});

export const GetTrackingQualityArgs = z.object({
  workspace_id: z.string().uuid(),
  window_days: z.number().int().min(1).max(30).default(7),
});

export const SearchTrafficKnowledgeArgs = z.object({
  workspace_id: z.string().uuid(),
  query: z.string().min(2).max(500),
  limit: z.number().int().min(1).max(20).default(5),
});

export const CreateOptimizationPlanArgs = z.object({
  workspace_id: z.string().uuid(),
  run_id: z.string().uuid().optional(),
  recommendations: z
    .array(
      z.object({
        provider: ProviderEnum,
        account_id: z.string().optional(),
        campaign_id: z.string().optional(),
        entity_type: z.string(),
        entity_id: z.string().optional(),
        action_type: z.string(),
        priority: z.number().int().min(1).max(5).default(3),
        confidence: z.number().min(0).max(1).default(0.5),
        expected_impact: z.record(z.unknown()).default({}),
        rationale: z.string().default(""),
        evidence_json: z.record(z.unknown()).default({}),
        rag_refs: z.array(z.unknown()).default([]),
      }),
    )
    .min(1)
    .max(50),
});

export const SimulateCampaignActionArgs = z.object({
  workspace_id: z.string().uuid(),
  recommendation_id: z.string().uuid(),
  override_payload: z.record(z.unknown()).optional(),
});

export const ApplyCampaignActionArgs = z.object({
  workspace_id: z.string().uuid(),
  action_id: z.string().uuid(),
  /** When false (default), even allowed actions are not actually mutated externally. */
  confirm_live: z.boolean().default(false),
});

export const RollbackCampaignActionArgs = z.object({
  workspace_id: z.string().uuid(),
  action_id: z.string().uuid(),
  confirm_live: z.boolean().default(false),
});

export const LogAgentDecisionArgs = z.object({
  workspace_id: z.string().uuid(),
  run_id: z.string().uuid().optional(),
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  message: z.string().min(1).max(2000),
  metadata: z.record(z.unknown()).default({}),
});

// ---- Tool registry -------------------------------------------------------

export const TRAFFIC_AGENT_TOOLS = [
  {
    name: "get_workspace_metrics",
    description: "Returns aggregated workspace metrics for the last N days (events, conversions, dispatch health).",
    schema: GetWorkspaceMetricsArgs,
  },
  {
    name: "get_campaign_performance",
    description: "Returns campaign performance snapshots for a provider/account/campaign over a window.",
    schema: GetCampaignPerformanceArgs,
  },
  {
    name: "get_conversion_health",
    description: "Returns conversion-health signals (deduplication, dispatch failures, dead-letter rate).",
    schema: GetConversionHealthArgs,
  },
  {
    name: "get_tracking_quality",
    description:
      "Returns tracking-quality signals: identifier coverage (gclid/gbraid/wbraid/fbp/fbc/ttclid/msclkid), purchase-without-dispatch rate.",
    schema: GetTrackingQualityArgs,
  },
  {
    name: "search_traffic_knowledge",
    description: "RAG search over the workspace knowledge base. Returns short snippets and refs.",
    schema: SearchTrafficKnowledgeArgs,
  },
  {
    name: "create_optimization_plan",
    description: "Persists a list of recommendations as a plan, linked to a run.",
    schema: CreateOptimizationPlanArgs,
  },
  {
    name: "simulate_campaign_action",
    description: "Simulates applying a recommendation. Never mutates externally.",
    schema: SimulateCampaignActionArgs,
  },
  {
    name: "apply_campaign_action",
    description:
      "Applies an action. Stays in dry-run unless guardrails allow live mutations AND confirm_live=true. Default: NOT live.",
    schema: ApplyCampaignActionArgs,
  },
  {
    name: "rollback_campaign_action",
    description: "Rollback an executed action. Stays interface/dry-run unless explicitly confirmed.",
    schema: RollbackCampaignActionArgs,
  },
  {
    name: "log_agent_decision",
    description: "Append a free-form, PII-redacted decision/log entry for the run.",
    schema: LogAgentDecisionArgs,
  },
] as const;

export type TrafficAgentToolName = (typeof TRAFFIC_AGENT_TOOLS)[number]["name"];

export function getToolSchema(name: string) {
  const t = TRAFFIC_AGENT_TOOLS.find((x) => x.name === name);
  return t?.schema;
}
