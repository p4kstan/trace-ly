
CREATE TABLE IF NOT EXISTS public.google_ads_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE,
  developer_token text,
  customer_id text NOT NULL,
  login_customer_id text,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_ads_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gac_manage" ON public.google_ads_credentials
  FOR ALL TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER gac_updated_at BEFORE UPDATE ON public.google_ads_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.google_ads_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  status text,
  date date NOT NULL,
  cost_micros bigint DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  ctr numeric DEFAULT 0,
  average_cpc_micros bigint DEFAULT 0,
  conversions numeric DEFAULT 0,
  conversion_value numeric DEFAULT 0,
  quality_score numeric,
  search_impression_share numeric,
  average_position numeric,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, campaign_id, date)
);

ALTER TABLE public.google_ads_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gads_camp_select" ON public.google_ads_campaigns
  FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX IF NOT EXISTS idx_gads_camp_ws_date ON public.google_ads_campaigns(workspace_id, date DESC);
