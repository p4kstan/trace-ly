
-- Tracking Sources table
CREATE TABLE public.tracking_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'website',
  primary_domain text,
  allowed_domains text[] DEFAULT '{}',
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  environment text NOT NULL DEFAULT 'production',
  settings_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracking_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ts_select" ON public.tracking_sources FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "ts_manage" ON public.tracking_sources FOR ALL TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER update_tracking_sources_updated_at
  BEFORE UPDATE ON public.tracking_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_tracking_sources_workspace ON public.tracking_sources(workspace_id);

-- Integration Logs table
CREATE TABLE public.integration_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  destination_id uuid REFERENCES public.gateway_integrations(id) ON DELETE SET NULL,
  event_id uuid,
  event_name text,
  request_json jsonb,
  response_json jsonb,
  status text NOT NULL DEFAULT 'pending',
  status_code integer,
  error_message text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "il_select" ON public.integration_logs FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_integration_logs_workspace ON public.integration_logs(workspace_id);
CREATE INDEX idx_integration_logs_provider ON public.integration_logs(workspace_id, provider);
CREATE INDEX idx_integration_logs_created ON public.integration_logs(created_at DESC);
