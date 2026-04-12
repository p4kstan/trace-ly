-- AI Insights table (persistent storage for generated insights)
CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'insight',
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  description text NOT NULL,
  action text,
  channel text,
  metric text,
  value_change numeric,
  expires_at timestamptz,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ains_select" ON public.ai_insights FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "ains_update" ON public.ai_insights FOR UPDATE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_ai_insights_ws_created ON public.ai_insights (workspace_id, created_at DESC);

-- AI Conversations table (copilot chat history)
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text,
  messages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aconv_select" ON public.ai_conversations FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "aconv_manage" ON public.ai_conversations FOR ALL TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_ai_conversations_ws ON public.ai_conversations (workspace_id, updated_at DESC);

-- Optimization Recommendations table
CREATE TABLE public.optimization_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  channel text NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  estimated_impact numeric,
  current_value numeric,
  recommended_value numeric,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.optimization_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "optim_select" ON public.optimization_recommendations FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "optim_update" ON public.optimization_recommendations FOR UPDATE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_optim_ws ON public.optimization_recommendations (workspace_id, created_at DESC);

-- Hybrid Attribution table (combined multi-model results)
CREATE TABLE public.attribution_hybrid (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversion_id uuid,
  identity_id uuid,
  source text,
  medium text,
  campaign text,
  markov_credit numeric DEFAULT 0,
  shapley_credit numeric DEFAULT 0,
  time_decay_credit numeric DEFAULT 0,
  linear_credit numeric DEFAULT 0,
  hybrid_credit numeric DEFAULT 0,
  hybrid_value numeric DEFAULT 0,
  conversion_value numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attribution_hybrid ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ahyb_select" ON public.attribution_hybrid FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_attr_hybrid_ws ON public.attribution_hybrid (workspace_id, created_at DESC);

-- Event Discovery table (auto-detected new events/patterns)
CREATE TABLE public.event_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  discovery_type text NOT NULL DEFAULT 'new_event',
  event_name text,
  parameters_json jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_discovery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edis_select" ON public.event_discovery FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "edis_update" ON public.event_discovery FOR UPDATE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_event_disc_ws ON public.event_discovery (workspace_id, created_at DESC);
