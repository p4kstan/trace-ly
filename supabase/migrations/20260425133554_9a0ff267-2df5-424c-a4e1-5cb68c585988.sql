
-- ════════════════════════════════════════════════════════════════
-- 1) tracked_events — idempotência por destino (genérica, suporta N etapas)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tracked_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  provider text NOT NULL DEFAULT 'internal',
  destination text NOT NULL DEFAULT 'default',
  event_name text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  source text,
  attempts integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT tracked_events_status_chk
    CHECK (status IN ('reserved','queued','delivered','retry','dead_letter','skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_events_dedup
  ON public.tracked_events (workspace_id, event_id, provider, destination);

CREATE INDEX IF NOT EXISTS idx_tracked_events_ws_status
  ON public.tracked_events (workspace_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracked_events_event
  ON public.tracked_events (event_id);

ALTER TABLE public.tracked_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracked_events_select_member" ON public.tracked_events;
CREATE POLICY "tracked_events_select_member"
  ON public.tracked_events FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- writes happen only via service-role from Edge Functions (no INSERT/UPDATE/DELETE policy needed)

-- ════════════════════════════════════════════════════════════════
-- 2) audience_seed_exports — auditoria de exports first-party (hash-only)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.audience_seed_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid,
  platform text NOT NULL,
  destination_customer_id text,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  require_consent boolean NOT NULL DEFAULT true,
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'created',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audience_seed_exports_platform_chk
    CHECK (platform IN ('google_ads','meta','tiktok','ga4'))
);

CREATE INDEX IF NOT EXISTS idx_audience_seed_exports_ws
  ON public.audience_seed_exports (workspace_id, created_at DESC);

ALTER TABLE public.audience_seed_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audience_seed_exports_select_member" ON public.audience_seed_exports;
CREATE POLICY "audience_seed_exports_select_member"
  ON public.audience_seed_exports FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- ════════════════════════════════════════════════════════════════
-- 3) orders — modelo canônico multi-etapas + msclkid + consent
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS root_order_code text,
  ADD COLUMN IF NOT EXISTS step_key text,
  ADD COLUMN IF NOT EXISTS canonical_event_id text,
  ADD COLUMN IF NOT EXISTS parent_order_code text,
  ADD COLUMN IF NOT EXISTS purchase_tracked_at timestamptz,
  ADD COLUMN IF NOT EXISTS purchase_tracked_source text,
  ADD COLUMN IF NOT EXISTS msclkid text,
  ADD COLUMN IF NOT EXISTS ads_consent_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ads_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ads_consent_source text;

CREATE INDEX IF NOT EXISTS idx_orders_root_order_code
  ON public.orders (workspace_id, root_order_code) WHERE root_order_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_canonical_event_id
  ON public.orders (canonical_event_id) WHERE canonical_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_msclkid
  ON public.orders (msclkid) WHERE msclkid IS NOT NULL;

-- ════════════════════════════════════════════════════════════════
-- 4) identities — consent + retenção + msclkid
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.identities
  ADD COLUMN IF NOT EXISTS msclkid text,
  ADD COLUMN IF NOT EXISTS ads_consent_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ads_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ads_consent_source text,
  ADD COLUMN IF NOT EXISTS pii_retention_until timestamptz;

-- ════════════════════════════════════════════════════════════════
-- 5) sessions — msclkid (idempotente)
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS msclkid text;

CREATE INDEX IF NOT EXISTS idx_sessions_msclkid
  ON public.sessions (msclkid) WHERE msclkid IS NOT NULL;

-- ════════════════════════════════════════════════════════════════
-- 6) event_queue — reindex para suportar múltiplos destinos por provider
-- Estratégia segura: unique parcial em estados ativos
-- ════════════════════════════════════════════════════════════════

-- Preenche destination='default' onde estava NULL/vazio
UPDATE public.event_queue
   SET destination = 'default'
 WHERE destination IS NULL OR destination = '';

-- Garante NOT NULL daqui pra frente
ALTER TABLE public.event_queue
  ALTER COLUMN destination SET DEFAULT 'default';

ALTER TABLE public.event_queue
  ALTER COLUMN destination SET NOT NULL;

-- Remove duplicados ATIVOS antes de criar o novo unique parcial
-- (preserva a linha mais recente em cada combinação)
DELETE FROM public.event_queue eq
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, event_id, provider, destination
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM public.event_queue
   WHERE event_id IS NOT NULL
     AND status IN ('queued','processing','retry')
) dup
WHERE eq.id = dup.id AND dup.rn > 1;

-- Drop índice antigo (3 colunas) e cria o novo (4 colunas, parcial em estados ativos)
DROP INDEX IF EXISTS public.uq_event_queue_dedup;

CREATE UNIQUE INDEX uq_event_queue_dedup
  ON public.event_queue (workspace_id, event_id, provider, destination)
  WHERE event_id IS NOT NULL
    AND status IN ('queued','processing','retry');

CREATE INDEX IF NOT EXISTS idx_event_queue_ws_provider_dest
  ON public.event_queue (workspace_id, provider, destination, status);
