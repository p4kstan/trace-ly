
-- Attribution results table
CREATE TABLE IF NOT EXISTS public.attribution_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversion_id uuid,
  identity_id uuid,
  touch_id uuid,
  model text NOT NULL,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  credit numeric NOT NULL DEFAULT 0,
  touch_time timestamptz,
  conversion_value numeric DEFAULT 0,
  attributed_value numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attribution_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attr_results_select" ON public.attribution_results
  FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_attr_results_ws_model ON public.attribution_results(workspace_id, model);
CREATE INDEX idx_attr_results_ws_source ON public.attribution_results(workspace_id, source);
CREATE INDEX idx_attr_results_conversion ON public.attribution_results(conversion_id);

-- Attribution computation function
CREATE OR REPLACE FUNCTION public.compute_attribution(
  _workspace_id uuid,
  _identity_id uuid,
  _conversion_id uuid,
  _conversion_value numeric,
  _model text DEFAULT 'last_click'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _touches RECORD;
  _touch_count int;
  _idx int := 0;
  _total_weight numeric := 0;
  _weights numeric[];
  _half_life_days numeric := 7;
  _now timestamptz := now();
BEGIN
  -- Count touches
  SELECT count(*) INTO _touch_count
  FROM attribution_touches
  WHERE workspace_id = _workspace_id AND identity_id = _identity_id;

  IF _touch_count = 0 THEN RETURN; END IF;

  -- Compute weights based on model
  IF _model = 'first_click' THEN
    FOR _touches IN
      SELECT * FROM attribution_touches
      WHERE workspace_id = _workspace_id AND identity_id = _identity_id
      ORDER BY touch_time ASC
    LOOP
      _idx := _idx + 1;
      INSERT INTO attribution_results (workspace_id, conversion_id, identity_id, touch_id, model, source, medium, campaign, content, term, credit, touch_time, conversion_value, attributed_value)
      VALUES (_workspace_id, _conversion_id, _identity_id, _touches.id, _model, _touches.source, _touches.medium, _touches.campaign, _touches.content, _touches.term,
        CASE WHEN _idx = 1 THEN 1.0 ELSE 0.0 END,
        _touches.touch_time, _conversion_value,
        CASE WHEN _idx = 1 THEN _conversion_value ELSE 0 END
      );
    END LOOP;

  ELSIF _model = 'last_click' THEN
    FOR _touches IN
      SELECT * FROM attribution_touches
      WHERE workspace_id = _workspace_id AND identity_id = _identity_id
      ORDER BY touch_time ASC
    LOOP
      _idx := _idx + 1;
      INSERT INTO attribution_results (workspace_id, conversion_id, identity_id, touch_id, model, source, medium, campaign, content, term, credit, touch_time, conversion_value, attributed_value)
      VALUES (_workspace_id, _conversion_id, _identity_id, _touches.id, _model, _touches.source, _touches.medium, _touches.campaign, _touches.content, _touches.term,
        CASE WHEN _idx = _touch_count THEN 1.0 ELSE 0.0 END,
        _touches.touch_time, _conversion_value,
        CASE WHEN _idx = _touch_count THEN _conversion_value ELSE 0 END
      );
    END LOOP;

  ELSIF _model = 'linear' THEN
    FOR _touches IN
      SELECT * FROM attribution_touches
      WHERE workspace_id = _workspace_id AND identity_id = _identity_id
      ORDER BY touch_time ASC
    LOOP
      INSERT INTO attribution_results (workspace_id, conversion_id, identity_id, touch_id, model, source, medium, campaign, content, term, credit, touch_time, conversion_value, attributed_value)
      VALUES (_workspace_id, _conversion_id, _identity_id, _touches.id, _model, _touches.source, _touches.medium, _touches.campaign, _touches.content, _touches.term,
        1.0 / _touch_count, _touches.touch_time, _conversion_value, _conversion_value / _touch_count
      );
    END LOOP;

  ELSIF _model = 'time_decay' THEN
    -- First pass: compute total weight
    FOR _touches IN
      SELECT * FROM attribution_touches
      WHERE workspace_id = _workspace_id AND identity_id = _identity_id
      ORDER BY touch_time ASC
    LOOP
      _total_weight := _total_weight + power(2, -1.0 * EXTRACT(EPOCH FROM (_now - _touches.touch_time)) / (86400 * _half_life_days));
    END LOOP;

    IF _total_weight = 0 THEN _total_weight := 1; END IF;

    -- Second pass: insert with normalized weights
    FOR _touches IN
      SELECT * FROM attribution_touches
      WHERE workspace_id = _workspace_id AND identity_id = _identity_id
      ORDER BY touch_time ASC
    LOOP
      DECLARE
        w numeric := power(2, -1.0 * EXTRACT(EPOCH FROM (_now - _touches.touch_time)) / (86400 * _half_life_days));
        credit_val numeric := w / _total_weight;
      BEGIN
        INSERT INTO attribution_results (workspace_id, conversion_id, identity_id, touch_id, model, source, medium, campaign, content, term, credit, touch_time, conversion_value, attributed_value)
        VALUES (_workspace_id, _conversion_id, _identity_id, _touches.id, _model, _touches.source, _touches.medium, _touches.campaign, _touches.content, _touches.term,
          credit_val, _touches.touch_time, _conversion_value, _conversion_value * credit_val
        );
      END;
    END LOOP;

  ELSIF _model = 'position_based' THEN
    FOR _touches IN
      SELECT * FROM attribution_touches
      WHERE workspace_id = _workspace_id AND identity_id = _identity_id
      ORDER BY touch_time ASC
    LOOP
      _idx := _idx + 1;
      DECLARE
        credit_val numeric;
      BEGIN
        IF _touch_count = 1 THEN
          credit_val := 1.0;
        ELSIF _idx = 1 THEN
          credit_val := 0.4;
        ELSIF _idx = _touch_count THEN
          credit_val := 0.4;
        ELSE
          credit_val := 0.2 / GREATEST(_touch_count - 2, 1);
        END IF;

        INSERT INTO attribution_results (workspace_id, conversion_id, identity_id, touch_id, model, source, medium, campaign, content, term, credit, touch_time, conversion_value, attributed_value)
        VALUES (_workspace_id, _conversion_id, _identity_id, _touches.id, _model, _touches.source, _touches.medium, _touches.campaign, _touches.content, _touches.term,
          credit_val, _touches.touch_time, _conversion_value, _conversion_value * credit_val
        );
      END;
    END LOOP;
  END IF;
END;
$$;
