-- 1. Novas colunas
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS ga_client_id TEXT,
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ga_client_id TEXT,
  ADD COLUMN IF NOT EXISTS client_ip TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'dry_run',
  ADD COLUMN IF NOT EXISTS guardrails_json JSONB;

-- 2. Converter rows legadas pending -> queued
UPDATE public.event_queue SET status = 'queued' WHERE status = 'pending';

-- 3. Dedup event_queue (mantém o mais recente por (workspace,event_id,provider) onde event_id IS NOT NULL)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, event_id, provider
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.event_queue
  WHERE event_id IS NOT NULL
)
DELETE FROM public.event_queue WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. Substituir índice parcial quebrado por unique completo (ainda WHERE event_id IS NOT NULL para permitir múltiplos NULL)
DROP INDEX IF EXISTS public.uq_event_queue_dedup;
CREATE UNIQUE INDEX uq_event_queue_dedup
  ON public.event_queue (workspace_id, event_id, provider)
  WHERE event_id IS NOT NULL;

-- 5. Dedup orders por (workspace, gateway, gateway_order_id)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, gateway, gateway_order_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.orders
  WHERE gateway IS NOT NULL AND gateway_order_id IS NOT NULL
)
DELETE FROM public.orders WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_gateway_order
  ON public.orders (workspace_id, gateway, gateway_order_id)
  WHERE gateway IS NOT NULL AND gateway_order_id IS NOT NULL;

-- 6. Dedup payments por (workspace, gateway, gateway_payment_id)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, gateway, gateway_payment_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.payments
  WHERE gateway IS NOT NULL AND gateway_payment_id IS NOT NULL
)
DELETE FROM public.payments WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_gateway_payment
  ON public.payments (workspace_id, gateway, gateway_payment_id)
  WHERE gateway IS NOT NULL AND gateway_payment_id IS NOT NULL;

-- 7. Índices de busca para enrichment
CREATE INDEX IF NOT EXISTS idx_sessions_ga_client_id
  ON public.sessions (ga_client_id) WHERE ga_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_ga_client_id
  ON public.orders (ga_client_id) WHERE ga_client_id IS NOT NULL;