-- Passo U: dedicated dispatch decision audit log (no PII, no secrets).

CREATE TABLE IF NOT EXISTS public.dispatch_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id text,
  provider text NOT NULL,
  destination_id text,
  decision text NOT NULL CHECK (decision IN ('allow','block','dry_run','test_mode','fallback')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_registry_rows int NOT NULL DEFAULT 0,
  test_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_decision_log_ws_created
  ON public.dispatch_decision_log (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_decision_log_filter
  ON public.dispatch_decision_log (workspace_id, provider, destination_id, decision, created_at DESC);

ALTER TABLE public.dispatch_decision_log ENABLE ROW LEVEL SECURITY;

-- Workspace members may READ their workspace decisions.
DROP POLICY IF EXISTS dispatch_decision_log_member_read ON public.dispatch_decision_log;
CREATE POLICY dispatch_decision_log_member_read
  ON public.dispatch_decision_log
  FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- No one writes via REST/RLS. Inserts go through SECURITY DEFINER RPC,
-- which itself only accepts the service-role caller. UPDATE/DELETE blocked.
-- (No INSERT/UPDATE/DELETE policies => denied for everyone except SECURITY DEFINER bypass.)

-- ─── RPC: record decision (Edge-Function-only). ─────────────────────────
CREATE OR REPLACE FUNCTION public.record_dispatch_decision(
  _workspace_id uuid,
  _event_id text,
  _provider text,
  _destination_id text,
  _decision text,
  _reasons jsonb,
  _matched_rows int,
  _test_mode boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_decision text := lower(coalesce(_decision, ''));
BEGIN
  -- Reject anonymous or user-level callers; only service role uses this.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN NULL;
  END IF;

  IF v_decision NOT IN ('allow','block','dry_run','test_mode','fallback') THEN
    v_decision := 'block';
  END IF;

  INSERT INTO public.dispatch_decision_log (
    workspace_id, event_id, provider, destination_id,
    decision, reasons, matched_registry_rows, test_mode
  ) VALUES (
    _workspace_id,
    nullif(_event_id, ''),
    coalesce(_provider, 'unknown'),
    nullif(_destination_id, ''),
    v_decision,
    coalesce(_reasons, '[]'::jsonb),
    coalesce(_matched_rows, 0),
    coalesce(_test_mode, false)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_dispatch_decision(uuid, text, text, text, text, jsonb, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_dispatch_decision(uuid, text, text, text, text, jsonb, int, boolean) TO service_role;

-- ─── RPC: list decisions (member-gated, filterable). ────────────────────
CREATE OR REPLACE FUNCTION public.list_dispatch_decisions(
  _workspace_id uuid,
  _provider text DEFAULT NULL,
  _destination_id text DEFAULT NULL,
  _decision text DEFAULT NULL,
  _limit int DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  event_id text,
  provider text,
  destination_id text,
  decision text,
  reasons jsonb,
  matched_registry_rows int,
  test_mode boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(coalesce(_limit, 50), 1), 200);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.is_workspace_member(auth.uid(), _workspace_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT d.id, d.event_id, d.provider, d.destination_id,
         d.decision, d.reasons, d.matched_registry_rows, d.test_mode, d.created_at
    FROM public.dispatch_decision_log d
   WHERE d.workspace_id = _workspace_id
     AND (_provider IS NULL OR d.provider = lower(_provider))
     AND (_destination_id IS NULL OR d.destination_id = _destination_id)
     AND (_decision IS NULL OR d.decision = lower(_decision))
   ORDER BY d.created_at DESC
   LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_dispatch_decisions(uuid, text, text, text, int) TO authenticated;
