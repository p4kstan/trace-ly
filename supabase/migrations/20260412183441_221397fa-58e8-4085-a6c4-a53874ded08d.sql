
-- Feature flags per workspace
CREATE TABLE public.feature_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  flag_key TEXT NOT NULL,
  label TEXT,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INTEGER NOT NULL DEFAULT 100,
  payload_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, flag_key)
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ff_select" ON public.feature_flags FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ff_manage" ON public.feature_flags FOR ALL TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Anomaly alerts
CREATE TABLE public.anomaly_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  expected_value NUMERIC,
  actual_value NUMERIC,
  deviation_percent NUMERIC,
  message TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.anomaly_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aa_select" ON public.anomaly_alerts FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "aa_update" ON public.anomaly_alerts FOR UPDATE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_anomaly_alerts_workspace ON public.anomaly_alerts(workspace_id, detected_at DESC);

-- Event replay jobs
CREATE TABLE public.event_replay_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  filter_json JSONB DEFAULT '{}'::jsonb,
  total_events INTEGER DEFAULT 0,
  replayed_events INTEGER DEFAULT 0,
  failed_events INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_replay_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erj_select" ON public.event_replay_jobs FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "erj_manage" ON public.event_replay_jobs FOR ALL TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER update_event_replay_jobs_updated_at
  BEFORE UPDATE ON public.event_replay_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
