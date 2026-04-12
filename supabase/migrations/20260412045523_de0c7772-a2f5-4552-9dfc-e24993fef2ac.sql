
-- 1. Expand gateway_integrations
ALTER TABLE public.gateway_integrations
  ADD COLUMN IF NOT EXISTS public_config_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS settings_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

-- 2. Create gateway_webhook_logs
CREATE TABLE public.gateway_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  gateway_integration_id uuid REFERENCES public.gateway_integrations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_event_id text,
  event_type text,
  signature_valid boolean,
  http_headers_json jsonb,
  query_params_json jsonb,
  payload_json jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'pending',
  processing_attempts integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gateway_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gwl_select" ON public.gateway_webhook_logs FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- 3. Create gateway_api_sync_logs
CREATE TABLE public.gateway_api_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  gateway_integration_id uuid REFERENCES public.gateway_integrations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  sync_type text NOT NULL,
  request_json jsonb,
  response_json jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gateway_api_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gasl_select" ON public.gateway_api_sync_logs FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- 4. Create gateway_customers
CREATE TABLE public.gateway_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  gateway_integration_id uuid REFERENCES public.gateway_integrations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  identity_id uuid,
  external_customer_id text,
  name text,
  email text,
  phone text,
  document text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gateway_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gc_select" ON public.gateway_customers FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- 5. Create reconciliation_logs
CREATE TABLE public.reconciliation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider text,
  entity_type text NOT NULL,
  entity_id uuid,
  external_id text,
  reconciliation_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  details_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rl_select" ON public.reconciliation_logs FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- 6. Create dead_letter_events
CREATE TABLE public.dead_letter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  provider text,
  payload_json jsonb,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  last_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dead_letter_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dle_select" ON public.dead_letter_events FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- 7. Expand orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gateway_integration_id uuid REFERENCES public.gateway_integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_subscription_id text,
  ADD COLUMN IF NOT EXISTS financial_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fulfillment_status text,
  ADD COLUMN IF NOT EXISTS installments integer,
  ADD COLUMN IF NOT EXISTS subtotal_value numeric,
  ADD COLUMN IF NOT EXISTS shipping_value numeric,
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS first_page text,
  ADD COLUMN IF NOT EXISTS current_page text,
  ADD COLUMN IF NOT EXISTS order_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- 8. Expand order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS external_item_id text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS variant_name text;

-- 9. Expand payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_integration_id uuid REFERENCES public.gateway_integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_charge_id text,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS net_amount numeric,
  ADD COLUMN IF NOT EXISTS fee_amount numeric,
  ADD COLUMN IF NOT EXISTS installments integer,
  ADD COLUMN IF NOT EXISTS pix_qr_code text,
  ADD COLUMN IF NOT EXISTS boleto_url text,
  ADD COLUMN IF NOT EXISTS boleto_barcode text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

-- 10. Expand leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pixel_id uuid,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 11. Restructure event_mappings - add new columns
ALTER TABLE public.event_mappings
  ADD COLUMN IF NOT EXISTS internal_event_name text,
  ADD COLUMN IF NOT EXISTS external_platform text DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS external_event_name text,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS conditions_json jsonb;

-- Rename provider column alias
ALTER TABLE public.event_mappings 
  ADD COLUMN IF NOT EXISTS provider text;

-- 12. Production indexes - orders
CREATE INDEX IF NOT EXISTS idx_orders_ws_created ON public.orders (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_ws_provider ON public.orders (workspace_id, gateway, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_ws_ext_order ON public.orders (workspace_id, gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_ws_email ON public.orders (workspace_id, customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_ws_paid ON public.orders (workspace_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_ws_utm ON public.orders (workspace_id, utm_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_ws_status ON public.orders (workspace_id, status, created_at DESC);

-- indexes - payments
CREATE INDEX IF NOT EXISTS idx_payments_ws_order ON public.payments (workspace_id, order_id);
CREATE INDEX IF NOT EXISTS idx_payments_ws_ext ON public.payments (workspace_id, gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_ws_status ON public.payments (workspace_id, status, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_ws_provider ON public.payments (workspace_id, gateway, created_at DESC);

-- indexes - gateway_webhook_logs
CREATE INDEX IF NOT EXISTS idx_gwl_ws_provider ON public.gateway_webhook_logs (workspace_id, provider, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_gwl_ws_status ON public.gateway_webhook_logs (workspace_id, processing_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_gwl_ext_event ON public.gateway_webhook_logs (external_event_id);
CREATE INDEX IF NOT EXISTS idx_gwl_integration ON public.gateway_webhook_logs (gateway_integration_id, received_at DESC);

-- indexes - leads
CREATE INDEX IF NOT EXISTS idx_leads_ws_created ON public.leads (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ws_email ON public.leads (workspace_id, email);
CREATE INDEX IF NOT EXISTS idx_leads_ws_phone ON public.leads (workspace_id, phone);

-- indexes - event_mappings
CREATE INDEX IF NOT EXISTS idx_em_ws_provider ON public.event_mappings (workspace_id, gateway);

-- indexes - gateway_customers
CREATE INDEX IF NOT EXISTS idx_gc_ws_ext ON public.gateway_customers (workspace_id, external_customer_id);
CREATE INDEX IF NOT EXISTS idx_gc_ws_email ON public.gateway_customers (workspace_id, email);

-- indexes - reconciliation_logs
CREATE INDEX IF NOT EXISTS idx_rl_ws_entity ON public.reconciliation_logs (workspace_id, entity_type, entity_id);

-- indexes - dead_letter_events
CREATE INDEX IF NOT EXISTS idx_dle_ws_source ON public.dead_letter_events (workspace_id, source_type, created_at DESC);

-- Trigger for gateway_customers updated_at
CREATE TRIGGER update_gateway_customers_updated_at
  BEFORE UPDATE ON public.gateway_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
