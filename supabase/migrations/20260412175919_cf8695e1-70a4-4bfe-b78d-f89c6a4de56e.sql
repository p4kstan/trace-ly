
-- Plan limits configuration
CREATE TABLE IF NOT EXISTS public.plan_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_name text NOT NULL UNIQUE,
  max_events_per_month bigint NOT NULL DEFAULT 10000,
  max_pixels integer NOT NULL DEFAULT 1,
  max_api_keys integer NOT NULL DEFAULT 2,
  max_destinations integer NOT NULL DEFAULT 1,
  features_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_limits_public_read" ON public.plan_limits FOR SELECT USING (true);

-- Seed default plans
INSERT INTO public.plan_limits (plan_name, max_events_per_month, max_pixels, max_api_keys, max_destinations, features_json) VALUES
  ('free', 10000, 1, 2, 1, '{"attribution": false, "ai_analytics": false}'),
  ('pro', 1000000, 999, 10, 10, '{"attribution": true, "ai_analytics": true}'),
  ('enterprise', 999999999, 999, 999, 999, '{"attribution": true, "ai_analytics": true, "custom_sla": true}')
ON CONFLICT (plan_name) DO NOTHING;

-- Monthly usage tracking per workspace
CREATE TABLE IF NOT EXISTS public.workspace_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  month text NOT NULL,
  event_count bigint NOT NULL DEFAULT 0,
  limit_reached boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, month)
);

CREATE INDEX idx_workspace_usage_ws_month ON public.workspace_usage (workspace_id, month);

ALTER TABLE public.workspace_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wu_select" ON public.workspace_usage FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Atomic increment function (called from edge functions via service role)
CREATE OR REPLACE FUNCTION public.increment_workspace_usage(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_month text;
  current_count bigint;
  max_allowed bigint;
  ws_plan text;
  result jsonb;
BEGIN
  current_month := to_char(now(), 'YYYY-MM');
  
  -- Get workspace plan
  SELECT plan INTO ws_plan FROM workspaces WHERE id = _workspace_id;
  IF ws_plan IS NULL THEN ws_plan := 'free'; END IF;
  
  -- Get plan limit
  SELECT max_events_per_month INTO max_allowed FROM plan_limits WHERE plan_name = ws_plan;
  IF max_allowed IS NULL THEN max_allowed := 10000; END IF;
  
  -- Upsert usage
  INSERT INTO workspace_usage (workspace_id, month, event_count)
  VALUES (_workspace_id, current_month, 1)
  ON CONFLICT (workspace_id, month)
  DO UPDATE SET event_count = workspace_usage.event_count + 1, updated_at = now()
  RETURNING event_count INTO current_count;
  
  -- Check limit
  IF current_count >= max_allowed THEN
    UPDATE workspace_usage SET limit_reached = true WHERE workspace_id = _workspace_id AND month = current_month;
    result := jsonb_build_object('allowed', false, 'count', current_count, 'limit', max_allowed);
  ELSE
    result := jsonb_build_object('allowed', true, 'count', current_count, 'limit', max_allowed);
  END IF;
  
  RETURN result;
END;
$$;
