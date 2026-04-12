-- Composite indexes for identity resolution (track function hot path)
CREATE INDEX IF NOT EXISTS idx_identities_ws_email ON public.identities (workspace_id, email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identities_ws_external ON public.identities (workspace_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identities_ws_phone ON public.identities (workspace_id, phone_hash) WHERE phone_hash IS NOT NULL;

-- Composite index for session lookup (track function hot path)
CREATE INDEX IF NOT EXISTS idx_sessions_ws_ip_ua_created ON public.sessions (workspace_id, ip_hash, user_agent, created_at DESC);

-- Composite index for worker queue processing by provider
CREATE INDEX IF NOT EXISTS idx_event_queue_provider_ws ON public.event_queue (provider, workspace_id) WHERE status IN ('queued', 'retry');

-- API key lookup optimization
CREATE INDEX IF NOT EXISTS idx_api_keys_pubkey_status ON public.api_keys (public_key, status) WHERE status = 'active';

-- Pipeline metrics table for observability
CREATE TABLE IF NOT EXISTS public.pipeline_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  metric_type text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  metadata_json jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for metrics queries
CREATE INDEX idx_pipeline_metrics_ws_type_time ON public.pipeline_metrics (workspace_id, metric_type, recorded_at DESC);
CREATE INDEX idx_pipeline_metrics_time ON public.pipeline_metrics (recorded_at DESC);

-- Enable RLS
ALTER TABLE public.pipeline_metrics ENABLE ROW LEVEL SECURITY;

-- Workspace members can view metrics
CREATE POLICY "pm_select" ON public.pipeline_metrics
  FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));