
-- WhatsApp tracking tables
CREATE TABLE public.whatsapp_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  click_id TEXT NOT NULL UNIQUE,
  destination_phone TEXT NOT NULL,
  message_template TEXT,
  page_url TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  gclid TEXT,
  gbraid TEXT,
  wbraid TEXT,
  fbclid TEXT,
  fbp TEXT,
  fbc TEXT,
  ga_client_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  email_hash TEXT,
  phone_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_clicks_workspace_created ON public.whatsapp_clicks(workspace_id, created_at DESC);
CREATE INDEX idx_wa_clicks_click_id ON public.whatsapp_clicks(click_id);
CREATE INDEX idx_wa_clicks_status ON public.whatsapp_clicks(workspace_id, status);

ALTER TABLE public.whatsapp_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_clicks_member_select" ON public.whatsapp_clicks
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wa_clicks_admin_update" ON public.whatsapp_clicks
  FOR UPDATE USING (public.is_workspace_admin(auth.uid(), workspace_id));
CREATE POLICY "wa_clicks_admin_delete" ON public.whatsapp_clicks
  FOR DELETE USING (public.is_workspace_admin(auth.uid(), workspace_id));
-- INSERT only via service role (edge functions)

CREATE TABLE public.whatsapp_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  click_id TEXT NOT NULL,
  click_uuid UUID REFERENCES public.whatsapp_clicks(id) ON DELETE SET NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  source TEXT NOT NULL DEFAULT 'manual',
  event_id TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_conv_workspace_created ON public.whatsapp_conversions(workspace_id, created_at DESC);
CREATE INDEX idx_wa_conv_click_id ON public.whatsapp_conversions(click_id);

ALTER TABLE public.whatsapp_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_conv_member_select" ON public.whatsapp_conversions
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "wa_conv_admin_insert" ON public.whatsapp_conversions
  FOR INSERT WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));
CREATE POLICY "wa_conv_admin_update" ON public.whatsapp_conversions
  FOR UPDATE USING (public.is_workspace_admin(auth.uid(), workspace_id));
CREATE POLICY "wa_conv_admin_delete" ON public.whatsapp_conversions
  FOR DELETE USING (public.is_workspace_admin(auth.uid(), workspace_id));
