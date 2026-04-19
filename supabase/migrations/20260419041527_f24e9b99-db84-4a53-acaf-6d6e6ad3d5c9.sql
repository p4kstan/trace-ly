-- 1) Fix mcp_tokens column name (code uses token_hash, table has 'token')
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='mcp_tokens' AND column_name='token')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='mcp_tokens' AND column_name='token_hash') THEN
    ALTER TABLE public.mcp_tokens RENAME COLUMN token TO token_hash;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_hash ON public.mcp_tokens(token_hash) WHERE revoked = false;

-- 2) automation_actions — log of actions executed by MCP agents (and outcomes)
CREATE TABLE IF NOT EXISTS public.automation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  token_id UUID REFERENCES public.mcp_tokens(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,                 -- 'agent', 'auto_feedback', 'manual'
  source_event_id UUID,                  -- e.g. the Purchase event that triggered it
  action TEXT NOT NULL,                  -- 'pause_campaign', 'update_budget', 'adjust_bid', 'recompute_roi', etc.
  target_type TEXT,                      -- 'campaign', 'ad_group', 'workspace'
  target_id TEXT,                        -- external id (google ads campaign_id, etc.)
  customer_id TEXT,                      -- google ads customer id when applicable
  before_value JSONB,
  after_value JSONB,
  status TEXT NOT NULL DEFAULT 'pending',-- 'pending', 'success', 'failed', 'dry_run'
  error_message TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read automation_actions"
ON public.automation_actions FOR SELECT
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Service role inserts (edge functions use SERVICE_ROLE_KEY which bypasses RLS).
CREATE INDEX IF NOT EXISTS idx_automation_actions_ws_created ON public.automation_actions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_actions_action ON public.automation_actions(workspace_id, action);