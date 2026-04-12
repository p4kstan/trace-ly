
-- Drop old tables
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.user_identities CASCADE;

-- WORKSPACES
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_workspaces_slug ON public.workspaces(slug);
CREATE INDEX idx_workspaces_owner ON public.workspaces(owner_user_id);

-- WORKSPACE MEMBERS
CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_wm_workspace ON public.workspace_members(workspace_id);
CREATE INDEX idx_wm_user ON public.workspace_members(user_id);

-- API KEYS
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL UNIQUE,
  secret_key_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_api_keys_public ON public.api_keys(public_key);
CREATE INDEX idx_api_keys_workspace ON public.api_keys(workspace_id);

-- META PIXELS
CREATE TABLE public.meta_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pixel_id TEXT NOT NULL,
  name TEXT NOT NULL,
  access_token_encrypted TEXT,
  test_event_code TEXT,
  allow_all_domains BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_pixels ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_meta_pixels_workspace ON public.meta_pixels(workspace_id);
CREATE INDEX idx_meta_pixels_pixelid ON public.meta_pixels(pixel_id);

-- ALLOWED DOMAINS
CREATE TABLE public.allowed_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_pixel_id UUID NOT NULL REFERENCES public.meta_pixels(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.allowed_domains ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_allowed_domains_pixel ON public.allowed_domains(meta_pixel_id);

-- IDENTITIES
CREATE TABLE public.identities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  external_id TEXT,
  email_hash TEXT,
  phone_hash TEXT,
  fingerprint TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.identities ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_identities_workspace ON public.identities(workspace_id);
CREATE INDEX idx_identities_email ON public.identities(email_hash);
CREATE INDEX idx_identities_fingerprint ON public.identities(fingerprint);

-- SESSIONS
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  identity_id UUID REFERENCES public.identities(id),
  anonymous_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer TEXT,
  landing_page TEXT,
  fbp TEXT,
  fbc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sessions_workspace ON public.sessions(workspace_id);
CREATE INDEX idx_sessions_identity ON public.sessions(identity_id);
CREATE INDEX idx_sessions_ws_created ON public.sessions(workspace_id, created_at DESC);

-- EVENTS (partitioned by month)
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  pixel_id UUID,
  session_id UUID,
  identity_id UUID,
  event_name TEXT NOT NULL,
  event_id TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT,
  action_source TEXT,
  event_source_url TEXT,
  page_path TEXT,
  payload_json JSONB,
  user_data_json JSONB,
  custom_data_json JSONB,
  deduplication_key TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Partitions 2025
CREATE TABLE public.events_2025_01 PARTITION OF public.events FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE public.events_2025_02 PARTITION OF public.events FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE public.events_2025_03 PARTITION OF public.events FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE public.events_2025_04 PARTITION OF public.events FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE public.events_2025_05 PARTITION OF public.events FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE public.events_2025_06 PARTITION OF public.events FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE public.events_2025_07 PARTITION OF public.events FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE public.events_2025_08 PARTITION OF public.events FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE public.events_2025_09 PARTITION OF public.events FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE public.events_2025_10 PARTITION OF public.events FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE public.events_2025_11 PARTITION OF public.events FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE public.events_2025_12 PARTITION OF public.events FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
-- Partitions 2026
CREATE TABLE public.events_2026_01 PARTITION OF public.events FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE public.events_2026_02 PARTITION OF public.events FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE public.events_2026_03 PARTITION OF public.events FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE public.events_2026_04 PARTITION OF public.events FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE public.events_2026_05 PARTITION OF public.events FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE public.events_2026_06 PARTITION OF public.events FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE public.events_2026_07 PARTITION OF public.events FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE public.events_2026_08 PARTITION OF public.events FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE public.events_2026_09 PARTITION OF public.events FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE public.events_2026_10 PARTITION OF public.events FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE public.events_2026_11 PARTITION OF public.events FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE public.events_2026_12 PARTITION OF public.events FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE INDEX idx_events_workspace ON public.events(workspace_id);
CREATE INDEX idx_events_event_id ON public.events(event_id);
CREATE INDEX idx_events_event_name ON public.events(event_name);
CREATE INDEX idx_events_session ON public.events(session_id);
CREATE INDEX idx_events_dedup ON public.events(deduplication_key);
CREATE INDEX idx_events_status ON public.events(processing_status);
CREATE INDEX idx_events_ws_time ON public.events(workspace_id, event_time DESC);
CREATE INDEX idx_events_ws_name_time ON public.events(workspace_id, event_name, event_time DESC);

-- EVENT DELIVERIES
CREATE TABLE public.event_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  destination TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  request_json JSONB,
  response_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.event_deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_deliveries_event ON public.event_deliveries(event_id);
CREATE INDEX idx_deliveries_provider_status ON public.event_deliveries(provider, status, last_attempt_at);
CREATE INDEX idx_deliveries_workspace ON public.event_deliveries(workspace_id);

-- CONVERSIONS
CREATE TABLE public.conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  session_id UUID,
  identity_id UUID,
  conversion_type TEXT NOT NULL,
  value NUMERIC,
  currency TEXT,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attributed_source TEXT,
  attributed_campaign TEXT,
  attribution_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conversions_ws_time ON public.conversions(workspace_id, happened_at DESC);

-- ATTRIBUTION TOUCHES
CREATE TABLE public.attribution_touches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id UUID,
  identity_id UUID,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  content TEXT,
  term TEXT,
  touch_type TEXT,
  touch_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attribution_touches ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_touches_ws_identity_time ON public.attribution_touches(workspace_id, identity_id, touch_time DESC);

-- SUBSCRIPTION PLANS
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_event_limit INT,
  pixel_limit INT,
  workspace_limit INT,
  features_json JSONB
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_subscriptions_workspace ON public.subscriptions(workspace_id);

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_ws_created ON public.audit_logs(workspace_id, created_at DESC);

-- HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members WHERE user_id = _user_id AND workspace_id = _workspace_id
  ) OR EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = _workspace_id AND owner_user_id = _user_id
  );
$$;

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_meta_pixels_updated BEFORE UPDATE ON public.meta_pixels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.event_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS POLICIES

-- Workspaces
CREATE POLICY "ws_select" ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), id));
CREATE POLICY "ws_insert" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "ws_update" ON public.workspaces FOR UPDATE TO authenticated USING (owner_user_id = auth.uid());

-- Workspace members
CREATE POLICY "wm_select" ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wm_manage" ON public.workspace_members FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_user_id = auth.uid()));

-- API keys
CREATE POLICY "ak_select" ON public.api_keys FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ak_manage" ON public.api_keys FOR ALL TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Meta pixels
CREATE POLICY "mp_select" ON public.meta_pixels FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "mp_manage" ON public.meta_pixels FOR ALL TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Allowed domains
CREATE POLICY "ad_select" ON public.allowed_domains FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meta_pixels mp WHERE mp.id = allowed_domains.meta_pixel_id AND public.is_workspace_member(auth.uid(), mp.workspace_id)));
CREATE POLICY "ad_manage" ON public.allowed_domains FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meta_pixels mp WHERE mp.id = allowed_domains.meta_pixel_id AND public.is_workspace_member(auth.uid(), mp.workspace_id)));

-- Identities, sessions: workspace-scoped read only (service_role writes)
CREATE POLICY "id_select" ON public.identities FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "sess_select" ON public.sessions FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Events: workspace-scoped read only
CREATE POLICY "evt_select" ON public.events FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Event deliveries: workspace-scoped read only
CREATE POLICY "ed_select" ON public.event_deliveries FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Conversions
CREATE POLICY "conv_select" ON public.conversions FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Attribution touches
CREATE POLICY "at_select" ON public.attribution_touches FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Plans: public read
CREATE POLICY "plans_read" ON public.subscription_plans FOR SELECT USING (true);

-- Subscriptions
CREATE POLICY "sub_select" ON public.subscriptions FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Audit logs: read-only
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- SEED PLANS
INSERT INTO public.subscription_plans (name, monthly_event_limit, pixel_limit, workspace_limit, features_json) VALUES
  ('Free', 10000, 1, 1, '{"dedup": true, "attribution": "last_click"}'),
  ('Pro', 1000000, 10, 5, '{"dedup": true, "attribution": "all", "ai_analytics": true}'),
  ('Enterprise', NULL, NULL, NULL, '{"dedup": true, "attribution": "all", "ai_analytics": true, "dedicated_support": true}');
