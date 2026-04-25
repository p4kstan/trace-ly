-- 1) Resolution columns on queue_health_alerts
ALTER TABLE public.queue_health_alerts
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by text,
  ADD COLUMN IF NOT EXISTS resolution_reason text;

CREATE INDEX IF NOT EXISTS idx_qha_resolved
  ON public.queue_health_alerts (workspace_id, status, resolved_at DESC);

-- 2) Auto-resolve RPC — used by queue-health when condition clears
CREATE OR REPLACE FUNCTION public.auto_resolve_queue_health_alerts(
  _workspace_id uuid,
  _provider text,
  _destination text,
  _alert_type text,
  _reason text DEFAULT 'condition_cleared'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.queue_health_alerts
     SET status = 'resolved',
         resolved_at = now(),
         resolved_by = 'system:queue-health',
         resolution_reason = COALESCE(_reason, 'condition_cleared')
   WHERE workspace_id = _workspace_id
     AND provider = COALESCE(_provider, 'all')
     AND destination = COALESCE(_destination, 'all')
     AND alert_type = _alert_type
     AND status IN ('open','acknowledged');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
    VALUES (
      _workspace_id, NULL, 'queue_health_alert_auto_resolve', 'queue_health_alert', NULL,
      jsonb_build_object(
        'provider', _provider,
        'destination', _destination,
        'alert_type', _alert_type,
        'count', v_count,
        'reason', COALESCE(_reason, 'condition_cleared')
      )
    );
  END IF;

  RETURN v_count;
END;
$$;

-- 3) Safety bounds on rate_limit_configs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rlc_window_seconds_chk') THEN
    ALTER TABLE public.rate_limit_configs
      ADD CONSTRAINT rlc_window_seconds_chk CHECK (window_seconds BETWEEN 10 AND 3600);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rlc_max_hits_chk') THEN
    ALTER TABLE public.rate_limit_configs
      ADD CONSTRAINT rlc_max_hits_chk CHECK (max_hits BETWEEN 1 AND 10000);
  END IF;
END$$;

-- 4) Write policies for workspace-scoped rate_limit_configs (global rows stay read-only)
DROP POLICY IF EXISTS "rlc_member_insert" ON public.rate_limit_configs;
CREATE POLICY "rlc_member_insert"
  ON public.rate_limit_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "rlc_member_update" ON public.rate_limit_configs;
CREATE POLICY "rlc_member_update"
  ON public.rate_limit_configs
  FOR UPDATE
  TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "rlc_member_delete" ON public.rate_limit_configs;
CREATE POLICY "rlc_member_delete"
  ON public.rate_limit_configs
  FOR DELETE
  TO authenticated
  USING (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id));

-- 5) Audit trigger for rate_limit_configs (no PII)
CREATE OR REPLACE FUNCTION public.audit_rate_limit_configs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
    VALUES (NEW.workspace_id, auth.uid(), 'rate_limit_config_create', 'rate_limit_config', NEW.id::text,
      jsonb_build_object('route', NEW.route, 'window_seconds', NEW.window_seconds, 'max_hits', NEW.max_hits, 'fail_closed', NEW.fail_closed));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
    VALUES (NEW.workspace_id, auth.uid(), 'rate_limit_config_update', 'rate_limit_config', NEW.id::text,
      jsonb_build_object(
        'route', NEW.route,
        'before', jsonb_build_object('window_seconds', OLD.window_seconds, 'max_hits', OLD.max_hits, 'fail_closed', OLD.fail_closed),
        'after',  jsonb_build_object('window_seconds', NEW.window_seconds, 'max_hits', NEW.max_hits, 'fail_closed', NEW.fail_closed)
      ));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json)
    VALUES (OLD.workspace_id, auth.uid(), 'rate_limit_config_delete', 'rate_limit_config', OLD.id::text,
      jsonb_build_object('route', OLD.route, 'window_seconds', OLD.window_seconds, 'max_hits', OLD.max_hits, 'fail_closed', OLD.fail_closed));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_rate_limit_configs ON public.rate_limit_configs;
CREATE TRIGGER trg_audit_rate_limit_configs
  AFTER INSERT OR UPDATE OR DELETE ON public.rate_limit_configs
  FOR EACH ROW EXECUTE FUNCTION public.audit_rate_limit_configs();

-- 6) Retention cron status diagnostic RPC
-- Returns whether the daily monitor cron is registered and whether the
-- app.cron_secret GUC appears to be set, WITHOUT exposing any value.
CREATE OR REPLACE FUNCTION public.retention_cron_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_job_count int := 0;
  v_secret_set boolean := false;
  v_secret_val text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Cron job presence (best-effort; cron schema may not be visible).
  BEGIN
    EXECUTE $q$
      SELECT count(*) FROM cron.job
       WHERE command ILIKE '%retention-job%'
    $q$ INTO v_job_count;
  EXCEPTION WHEN OTHERS THEN
    v_job_count := -1; -- unknown
  END;

  -- GUC presence — ONLY check truthiness, never return the value.
  BEGIN
    v_secret_val := current_setting('app.cron_secret', true);
    v_secret_set := (v_secret_val IS NOT NULL AND length(v_secret_val) > 0);
  EXCEPTION WHEN OTHERS THEN
    v_secret_set := false;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'monitor_cron_count', v_job_count,
    'monitor_active', (v_job_count IS NOT NULL AND v_job_count > 0),
    'cron_secret_configured', v_secret_set
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.retention_cron_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_resolve_queue_health_alerts(uuid, text, text, text, text) TO authenticated;