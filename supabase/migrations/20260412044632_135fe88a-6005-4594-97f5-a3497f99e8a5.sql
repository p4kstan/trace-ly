
-- orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  gateway TEXT NOT NULL,
  gateway_order_id TEXT,
  external_checkout_id TEXT,
  session_id UUID,
  identity_id UUID,
  pixel_id UUID,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_document TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_value NUMERIC,
  currency TEXT DEFAULT 'BRL',
  payment_method TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  gclid TEXT,
  ttclid TEXT,
  fbp TEXT,
  fbc TEXT,
  referrer TEXT,
  landing_page TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX idx_orders_workspace ON public.orders(workspace_id);
CREATE INDEX idx_orders_status ON public.orders(workspace_id, status);
CREATE INDEX idx_orders_gateway_order ON public.orders(gateway, gateway_order_id);
CREATE INDEX idx_orders_email ON public.orders(customer_email);

-- order_items table
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC,
  total_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND is_workspace_member(auth.uid(), o.workspace_id)));

-- payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  gateway TEXT NOT NULL,
  gateway_payment_id TEXT,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  amount NUMERIC,
  currency TEXT DEFAULT 'BRL',
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  chargeback_at TIMESTAMPTZ,
  raw_payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX idx_payments_workspace ON public.payments(workspace_id);
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_payments_gateway ON public.payments(gateway, gateway_payment_id);

-- webhook_logs table
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  gateway TEXT NOT NULL,
  event_type TEXT,
  signature_valid BOOLEAN,
  payload_json JSONB,
  processing_status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_logs_select" ON public.webhook_logs FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX idx_webhook_logs_workspace ON public.webhook_logs(workspace_id);
CREATE INDEX idx_webhook_logs_gateway ON public.webhook_logs(workspace_id, gateway);

-- leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  session_id UUID,
  identity_id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  document TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbp TEXT,
  fbc TEXT,
  fbclid TEXT,
  gclid TEXT,
  ttclid TEXT,
  referrer TEXT,
  landing_page TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX idx_leads_workspace ON public.leads(workspace_id);
CREATE INDEX idx_leads_email ON public.leads(email);

-- gateway_integrations table
CREATE TABLE public.gateway_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  credentials_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  api_base_url TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gateway_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gi_select" ON public.gateway_integrations FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "gi_manage" ON public.gateway_integrations FOR ALL TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX idx_gi_workspace ON public.gateway_integrations(workspace_id);

-- event_mappings table (configurable rules)
CREATE TABLE public.event_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  gateway TEXT NOT NULL,
  gateway_event TEXT NOT NULL,
  marketing_event TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  config_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.event_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "em_select" ON public.event_mappings FOR SELECT TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "em_manage" ON public.event_mappings FOR ALL TO authenticated USING (is_workspace_member(auth.uid(), workspace_id));

-- Add missing UTM/click-id fields to sessions
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS gclid TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS fbclid TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ttclid TEXT;

-- Add missing fields to identities
ALTER TABLE public.identities ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.identities ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.identities ADD COLUMN IF NOT EXISTS phone TEXT;

-- Trigger for updated_at on new tables
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_gi_updated_at BEFORE UPDATE ON public.gateway_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
