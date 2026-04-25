
-- 1) Ack fields on queue_health_alerts
ALTER TABLE public.queue_health_alerts
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

-- Constrain status values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'queue_health_alerts_status_chk'
  ) THEN
    ALTER TABLE public.queue_health_alerts
      ADD CONSTRAINT queue_health_alerts_status_chk
      CHECK (status IN ('open','acknowledged','resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qha_ws_status
  ON public.queue_health_alerts (workspace_id, status, last_seen_at DESC);

-- 2) Auditable ack RPC (PII-free)
CREATE OR REPLACE FUNCTION public.acknowledge_queue_health_alert(
  _alert_id uuid,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid;
  v_provider text;
  v_destination text;
  v_alert_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT workspace_id, provider, destination, alert_type
    INTO v_workspace, v_provider, v_destination, v_alert_type
  FROM public.queue_health_alerts
  WHERE id = _alert_id
  LIMIT 1;

  IF v_workspace IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT public.is_workspace_member(auth.uid(), v_workspace) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.queue_health_alerts
     SET acknowledged   = true,
         acknowledged_at= COALESCE(acknowledged_at, now()),
         acknowledged_by= auth.uid(),
         status         = 'acknowledged'
   WHERE id = _alert_id;

  -- Audit (no PII; note is truncated)
  INSERT INTO public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
  VALUES (
    v_workspace, auth.uid(), 'queue_health_alert_ack', 'queue_health_alert', _alert_id::text,
    jsonb_build_object(
      'provider', v_provider,
      'destination', v_destination,
      'alert_type', v_alert_type,
      'note', CASE WHEN _note IS NULL THEN NULL ELSE left(_note, 200) END
    )
  );

  RETURN jsonb_build_object('ok', true, 'alert_id', _alert_id);
END;
$$;

-- 3) Rate-limit configs (per route, optionally per workspace)
CREATE TABLE IF NOT EXISTS public.rate_limit_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route text NOT NULL,
  workspace_id uuid,
  fail_closed boolean NOT NULL DEFAULT false,
  window_seconds integer NOT NULL DEFAULT 60,
  max_hits integer NOT NULL DEFAULT 30,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rlc_route_ws
  ON public.rate_limit_configs (route, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.rate_limit_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rlc_member_select" ON public.rate_limit_configs;
CREATE POLICY "rlc_member_select" ON public.rate_limit_configs
  FOR SELECT
  USING (
    workspace_id IS NULL
    OR public.is_workspace_member(auth.uid(), workspace_id)
  );

-- No client INSERT/UPDATE/DELETE policy — service role only.

CREATE TRIGGER trg_rlc_updated_at
BEFORE UPDATE ON public.rate_limit_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
