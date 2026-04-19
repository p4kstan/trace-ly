-- ════════════════════════════════════════════════════════════
-- BLOCO B — P0: Deduplicação event_queue + P1: Cache GA4
-- ════════════════════════════════════════════════════════════

-- ── P0.1: Limpa duplicatas existentes antes de criar o índice ──
-- Mantém o registro mais antigo (menor created_at) por (workspace_id, event_id, provider)
DELETE FROM public.event_queue eq
USING public.event_queue eq2
WHERE eq.workspace_id = eq2.workspace_id
  AND eq.event_id = eq2.event_id
  AND eq.provider = eq2.provider
  AND eq.event_id IS NOT NULL
  AND eq.created_at > eq2.created_at;

-- ── P0.2: Unique index parcial — só ativos (queued/retry/pending) ──
-- Permite reenvios manuais futuros (registros antigos não bloqueiam)
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_queue_dedup
  ON public.event_queue (workspace_id, event_id, provider)
  WHERE event_id IS NOT NULL
    AND status IN ('queued', 'retry', 'pending', 'processing');

-- ════════════════════════════════════════════════════════════
-- P1: Tabela ga4_reports_cache (server-side, compartilhada por workspace)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ga4_reports_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  query_hash TEXT NOT NULL,
  report_data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ga4_cache_ws_hash UNIQUE (workspace_id, query_hash)
);

CREATE INDEX IF NOT EXISTS idx_ga4_cache_expires ON public.ga4_reports_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_ga4_cache_ws ON public.ga4_reports_cache (workspace_id);

-- ── RLS ──
ALTER TABLE public.ga4_reports_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read cache for their workspace"
  ON public.ga4_reports_cache
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- INSERT/UPDATE/DELETE são feitos exclusivamente pela edge function (service role).
-- Não criamos policies pra authenticated nesses commands → bloqueio implícito.

-- ── Cleanup function (chamada manualmente ou via pg_cron futuro) ──
CREATE OR REPLACE FUNCTION public.cleanup_expired_ga4_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.ga4_reports_cache WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;