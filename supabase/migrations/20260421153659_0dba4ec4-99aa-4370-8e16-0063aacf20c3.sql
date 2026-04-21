CREATE TABLE IF NOT EXISTS public.duplicate_detections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  order_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_seen_day DATE GENERATED ALWAYS AS ((first_seen_at AT TIME ZONE 'UTC')::date) STORED,
  occurrences INTEGER NOT NULL DEFAULT 1,
  total_value NUMERIC(14,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_taken TEXT NOT NULL DEFAULT 'logged_only',
  resolution TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duplicate_detections_day
  ON public.duplicate_detections (workspace_id, order_id, event_name, first_seen_day);

CREATE INDEX IF NOT EXISTS idx_duplicate_detections_ws_time
  ON public.duplicate_detections (workspace_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_duplicate_detections_order
  ON public.duplicate_detections (workspace_id, order_id);

ALTER TABLE public.duplicate_detections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dd_select" ON public.duplicate_detections;
CREATE POLICY "dd_select" ON public.duplicate_detections
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "dd_update_member" ON public.duplicate_detections;
CREATE POLICY "dd_update_member" ON public.duplicate_detections
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

DROP TRIGGER IF EXISTS trg_duplicate_detections_updated ON public.duplicate_detections;
CREATE TRIGGER trg_duplicate_detections_updated
  BEFORE UPDATE ON public.duplicate_detections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.detect_duplicate_conversion(
  _workspace_id UUID,
  _order_id TEXT,
  _event_name TEXT,
  _source TEXT,
  _event_id TEXT,
  _value NUMERIC DEFAULT 0,
  _currency TEXT DEFAULT 'BRL',
  _window_hours INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing RECORD;
  result JSONB;
BEGIN
  IF _order_id IS NULL OR _order_id = '' THEN
    RETURN jsonb_build_object('is_duplicate', false, 'reason', 'no_order_id');
  END IF;

  SELECT id, sources, occurrences, event_ids, first_seen_at
    INTO existing
  FROM public.duplicate_detections
  WHERE workspace_id = _workspace_id
    AND order_id = _order_id
    AND event_name = _event_name
    AND last_seen_at >= now() - make_interval(hours => _window_hours)
  ORDER BY last_seen_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.duplicate_detections
       SET occurrences = existing.occurrences + 1,
           sources = CASE WHEN existing.sources ? _source THEN existing.sources
                          ELSE existing.sources || to_jsonb(_source) END,
           event_ids = CASE
             WHEN _event_id IS NULL OR existing.event_ids ? _event_id THEN existing.event_ids
             ELSE existing.event_ids || to_jsonb(_event_id)
           END,
           last_seen_at = now(),
           total_value = COALESCE(total_value, 0) + COALESCE(_value, 0)
     WHERE id = existing.id;

    result := jsonb_build_object(
      'is_duplicate', true,
      'detection_id', existing.id,
      'previous_sources', existing.sources,
      'occurrences', existing.occurrences + 1,
      'first_seen_at', existing.first_seen_at
    );
  ELSE
    INSERT INTO public.duplicate_detections (
      workspace_id, order_id, event_name, sources, event_ids,
      total_value, currency, action_taken, resolution
    ) VALUES (
      _workspace_id, _order_id, _event_name,
      jsonb_build_array(_source),
      CASE WHEN _event_id IS NOT NULL THEN jsonb_build_array(_event_id) ELSE '[]'::jsonb END,
      COALESCE(_value, 0), COALESCE(_currency, 'BRL'),
      'logged_only', 'pending'
    );
    result := jsonb_build_object('is_duplicate', false);
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE VIEW public.v_duplicate_summary AS
SELECT
  workspace_id,
  COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '24 hours') AS dupes_24h,
  COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '7 days')  AS dupes_7d,
  COUNT(*) AS dupes_total,
  COUNT(DISTINCT order_id) AS unique_orders_affected,
  COALESCE(SUM(total_value) FILTER (WHERE last_seen_at >= now() - interval '24 hours'), 0) AS value_at_risk_24h
FROM public.duplicate_detections
GROUP BY workspace_id;