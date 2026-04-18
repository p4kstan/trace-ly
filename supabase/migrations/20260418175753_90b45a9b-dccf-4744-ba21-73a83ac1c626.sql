CREATE TABLE public.ga4_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  property_id TEXT NOT NULL,
  property_name TEXT,
  account_id TEXT,
  account_name TEXT,
  measurement_id TEXT,
  refresh_token TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT ARRAY['https://www.googleapis.com/auth/analytics.readonly','https://www.googleapis.com/auth/analytics.edit'],
  status TEXT NOT NULL DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, property_id)
);

ALTER TABLE public.ga4_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view ga4 credentials" ON public.ga4_credentials FOR SELECT
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins insert ga4 credentials" ON public.ga4_credentials FOR INSERT
WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin','editor')));

CREATE POLICY "Admins update ga4 credentials" ON public.ga4_credentials FOR UPDATE
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin','editor')));

CREATE POLICY "Admins delete ga4 credentials" ON public.ga4_credentials FOR DELETE
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin','editor')));

CREATE INDEX idx_ga4_creds_workspace ON public.ga4_credentials(workspace_id);

CREATE TRIGGER update_ga4_credentials_updated_at
BEFORE UPDATE ON public.ga4_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ga4_reports_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  property_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  report_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, property_id, cache_key)
);

ALTER TABLE public.ga4_reports_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view ga4 cache" ON public.ga4_reports_cache FOR SELECT
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Members insert ga4 cache" ON public.ga4_reports_cache FOR INSERT
WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Members delete ga4 cache" ON public.ga4_reports_cache FOR DELETE
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE INDEX idx_ga4_cache_lookup ON public.ga4_reports_cache(workspace_id, property_id, cache_key);
CREATE INDEX idx_ga4_cache_expires ON public.ga4_reports_cache(expires_at);