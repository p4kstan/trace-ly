
-- ML Attribution Models table
CREATE TABLE public.ml_attribution_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  model_type TEXT NOT NULL, -- 'markov', 'shapley'
  model_data JSONB NOT NULL DEFAULT '{}',
  channels JSONB DEFAULT '[]',
  accuracy NUMERIC DEFAULT 0,
  training_samples INTEGER DEFAULT 0,
  trained_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ml_attribution_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mlam_select" ON public.ml_attribution_models
  FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Prediction Results table
CREATE TABLE public.prediction_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL, -- 'roas_24h', 'roas_7d', 'roas_30d', 'ltv'
  channel TEXT,
  campaign TEXT,
  predicted_value NUMERIC DEFAULT 0,
  confidence NUMERIC DEFAULT 0,
  features_json JSONB DEFAULT '{}',
  horizon_days INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prediction_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_select" ON public.prediction_results
  FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Real-time Metrics snapshots
CREATE TABLE public.realtime_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  metadata_json JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.realtime_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rm_select" ON public.realtime_metrics
  FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Enable realtime for metrics
ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_metrics;

-- Indexes
CREATE INDEX idx_mlam_workspace ON public.ml_attribution_models(workspace_id, model_type);
CREATE INDEX idx_pr_workspace ON public.prediction_results(workspace_id, prediction_type);
CREATE INDEX idx_rm_workspace ON public.realtime_metrics(workspace_id, recorded_at DESC);

-- Triggers
CREATE TRIGGER update_ml_models_updated_at
  BEFORE UPDATE ON public.ml_attribution_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
