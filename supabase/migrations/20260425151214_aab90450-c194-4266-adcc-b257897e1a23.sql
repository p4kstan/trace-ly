-- ── Rate-limit buckets (persistent, no raw IP) ────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  workspace_id UUID,
  user_id UUID,
  ip_hash TEXT NOT NULL DEFAULT '',
  window_start TIMESTAMPTZ NOT NULL,
  window_seconds INT NOT NULL DEFAULT 60,
  hits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rate_limit_bucket
  ON public.rate_limit_buckets (route, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), ip_hash, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window
  ON public.rate_limit_buckets (window_start);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rl_buckets_no_client_read"
  ON public.rate_limit_buckets FOR SELECT
  USING (false);

-- Atomic upsert helper: increments bucket hits and returns the new count.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  _route TEXT,
  _workspace_id UUID,
  _user_id UUID,
  _ip_hash TEXT,
  _window_seconds INT DEFAULT 60,
  _max_hits INT DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket_start TIMESTAMPTZ;
  current_hits INT;
  retry_after INT;
BEGIN
  -- Snap to window-aligned start (ex: 60s buckets -> floor minute).
  bucket_start := to_timestamp(
    floor(EXTRACT(EPOCH FROM now()) / GREATEST(_window_seconds, 1)) * GREATEST(_window_seconds, 1)
  );

  INSERT INTO public.rate_limit_buckets (
    route, workspace_id, user_id, ip_hash, window_start, window_seconds, hits
  ) VALUES (
    _route, _workspace_id, _user_id, COALESCE(_ip_hash, ''), bucket_start, _window_seconds, 1
  )
  ON CONFLICT (route, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), ip_hash, window_start)
  DO UPDATE SET hits = public.rate_limit_buckets.hits + 1, updated_at = now()
  RETURNING hits INTO current_hits;

  IF current_hits > _max_hits THEN
    retry_after := GREATEST(1, _window_seconds - EXTRACT(EPOCH FROM (now() - bucket_start))::INT);
    RETURN jsonb_build_object(
      'allowed', false,
      'hits', current_hits,
      'limit', _max_hits,
      'retry_after_seconds', retry_after
    );
  END IF;

  RETURN jsonb_build_object('allowed', true, 'hits', current_hits, 'limit', _max_hits);
END;
$$;

-- Cleanup of expired buckets (called by retention job).
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted INT;
BEGIN
  DELETE FROM public.rate_limit_buckets
   WHERE window_start < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- ── Queue health alerts (internal, no external dispatch) ──────────────
CREATE TABLE IF NOT EXISTS public.queue_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'all',
  destination TEXT NOT NULL DEFAULT 'all',
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warn',
  metric_value NUMERIC,
  message TEXT,
  window_minutes INT NOT NULL DEFAULT 15,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurrences INT NOT NULL DEFAULT 1,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qha_ws_seen
  ON public.queue_health_alerts (workspace_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_qha_ws_ack
  ON public.queue_health_alerts (workspace_id, acknowledged, last_seen_at DESC);

ALTER TABLE public.queue_health_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qha_member_select"
  ON public.queue_health_alerts FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "qha_member_update"
  ON public.queue_health_alerts FOR UPDATE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Dedup helper: upsert by (workspace, provider, destination, alert_type)
-- within the configured window — avoids spamming duplicates.
CREATE OR REPLACE FUNCTION public.upsert_queue_health_alert(
  _workspace_id UUID,
  _provider TEXT,
  _destination TEXT,
  _alert_type TEXT,
  _severity TEXT,
  _metric_value NUMERIC,
  _message TEXT,
  _window_minutes INT DEFAULT 15
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id UUID;
BEGIN
  SELECT id INTO existing_id
    FROM public.queue_health_alerts
   WHERE workspace_id = _workspace_id
     AND provider = COALESCE(_provider, 'all')
     AND destination = COALESCE(_destination, 'all')
     AND alert_type = _alert_type
     AND acknowledged = false
     AND last_seen_at >= now() - make_interval(mins => _window_minutes)
   ORDER BY last_seen_at DESC
   LIMIT 1
   FOR UPDATE;

  IF existing_id IS NOT NULL THEN
    UPDATE public.queue_health_alerts
       SET last_seen_at = now(),
           occurrences = occurrences + 1,
           metric_value = _metric_value,
           severity = _severity,
           message = COALESCE(_message, message)
     WHERE id = existing_id;
    RETURN existing_id;
  END IF;

  INSERT INTO public.queue_health_alerts (
    workspace_id, provider, destination, alert_type,
    severity, metric_value, message, window_minutes
  ) VALUES (
    _workspace_id, COALESCE(_provider, 'all'), COALESCE(_destination, 'all'),
    _alert_type, _severity, _metric_value, _message, _window_minutes
  ) RETURNING id INTO existing_id;
  RETURN existing_id;
END;
$$;

-- ── Retention policies ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_policies (
  workspace_id UUID PRIMARY KEY,
  delivered_days INT NOT NULL DEFAULT 180,
  retry_days INT NOT NULL DEFAULT 365,
  dead_letter_days INT NOT NULL DEFAULT 365,
  audit_log_days INT NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ret_member_select"
  ON public.retention_policies FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "ret_member_update"
  ON public.retention_policies FOR UPDATE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "ret_member_insert"
  ON public.retention_policies FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER trg_retention_policies_updated_at
BEFORE UPDATE ON public.retention_policies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();