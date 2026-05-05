
CREATE TABLE IF NOT EXISTS public.ai_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  target_platform TEXT NOT NULL DEFAULT 'google_ads',
  target_account_id TEXT,
  target_campaign_id TEXT,
  target_campaign_name TEXT,
  diagnosis TEXT,
  mutation_payload JSONB,
  mutation_response JSONB,
  before_snapshot JSONB,
  rollback_payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_actions_log_workspace_idx ON public.ai_actions_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_actions_log_status_idx ON public.ai_actions_log(workspace_id, status);

ALTER TABLE public.ai_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_actions_log_select" ON public.ai_actions_log
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ai_actions_log_insert" ON public.ai_actions_log
  FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ai_actions_log_update" ON public.ai_actions_log
  FOR UPDATE USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_estimate_usd NUMERIC(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_workspace_idx ON public.ai_usage_log(workspace_id, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_log_select" ON public.ai_usage_log
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
