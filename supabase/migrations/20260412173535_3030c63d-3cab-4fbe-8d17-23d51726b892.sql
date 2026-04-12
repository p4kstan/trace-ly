
-- Table for multi-provider dispatch destinations
CREATE TABLE public.integration_destinations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  provider TEXT NOT NULL, -- 'meta', 'google_ads', 'tiktok', 'ga4'
  destination_id TEXT NOT NULL, -- pixel_id, conversion_action_id, pixel_code, measurement_id
  display_name TEXT NOT NULL DEFAULT '',
  access_token_encrypted TEXT, -- encrypted token/API key
  config_json JSONB DEFAULT '{}'::jsonb, -- provider-specific config
  test_event_code TEXT, -- for testing (Meta, TikTok)
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_event_at TIMESTAMPTZ,
  events_sent_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, destination_id)
);

-- Enable RLS
ALTER TABLE public.integration_destinations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "id_select" ON public.integration_destinations
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "id_manage" ON public.integration_destinations
  FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Trigger for updated_at
CREATE TRIGGER update_integration_destinations_updated_at
  BEFORE UPDATE ON public.integration_destinations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for queue processing lookups
CREATE INDEX idx_integration_destinations_workspace_provider 
  ON public.integration_destinations(workspace_id, provider) 
  WHERE is_active = true;
