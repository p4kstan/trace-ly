CREATE OR REPLACE FUNCTION public.data_reuse_summary_keyset(
  _workspace_id uuid,
  _limit integer DEFAULT 500,
  _cursor_created_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 500), 1), 10000);
  v_total bigint := 0;
  v_summary jsonb;
  v_window_count integer := 0;
  v_next_created_at timestamptz := NULL;
  v_next_id uuid := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF NOT public.is_workspace_member(auth.uid(), _workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT count(*) INTO v_total FROM public.orders WHERE workspace_id = _workspace_id;

  WITH win AS (
    SELECT id, status, total_value, currency, created_at,
           customer_email, customer_phone, ads_consent_granted,
           gclid, gbraid, wbraid, fbclid, ttclid, msclkid
      FROM public.orders
     WHERE workspace_id = _workspace_id
       AND (
         _cursor_created_at IS NULL
         OR created_at < _cursor_created_at
         OR (created_at = _cursor_created_at AND id < _cursor_id)
       )
     ORDER BY created_at DESC, id DESC
     LIMIT v_limit
  ),
  flags AS (
    SELECT
      count(*) AS inspected,
      count(*) FILTER (WHERE lower(coalesce(status,'')) IN ('paid','approved')) AS paid,
      count(*) FILTER (WHERE ads_consent_granted IS TRUE) AS with_consent,
      count(*) FILTER (WHERE customer_email IS NOT NULL AND customer_email <> '') AS has_email,
      count(*) FILTER (WHERE customer_phone IS NOT NULL AND customer_phone <> '') AS has_phone,
      count(*) FILTER (WHERE gclid IS NOT NULL AND gclid <> '') AS has_gclid,
      count(*) FILTER (WHERE gbraid IS NOT NULL AND gbraid <> '') AS has_gbraid,
      count(*) FILTER (WHERE wbraid IS NOT NULL AND wbraid <> '') AS has_wbraid,
      count(*) FILTER (WHERE fbclid IS NOT NULL AND fbclid <> '') AS has_fbclid,
      count(*) FILTER (WHERE ttclid IS NOT NULL AND ttclid <> '') AS has_ttclid,
      count(*) FILTER (WHERE msclkid IS NOT NULL AND msclkid <> '') AS has_msclkid,
      count(*) FILTER (
        WHERE ads_consent_granted IS TRUE
          AND lower(coalesce(status,'')) IN ('paid','approved')
          AND (
            (customer_email IS NOT NULL AND customer_email <> '') OR
            (customer_phone IS NOT NULL AND customer_phone <> '')
          )
      ) AS audience_seed_eligible
    FROM win
  ),
  cur AS (
    SELECT created_at, id FROM win ORDER BY created_at ASC, id ASC LIMIT 1
  )
  SELECT
    to_jsonb(flags.*),
    (SELECT count(*) FROM win),
    (SELECT created_at FROM cur),
    (SELECT id FROM cur)
    INTO v_summary, v_window_count, v_next_created_at, v_next_id
  FROM flags;

  -- When fewer than `v_limit` rows were returned, no more pages exist.
  IF v_window_count < v_limit THEN
    v_next_created_at := NULL;
    v_next_id := NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'workspace_id', _workspace_id,
    'limit', v_limit,
    'inspected', v_window_count,
    'total_orders', v_total,
    'summary', COALESCE(v_summary, '{}'::jsonb),
    'next_cursor', CASE
      WHEN v_next_created_at IS NULL THEN NULL
      ELSE jsonb_build_object('created_at', v_next_created_at, 'id', v_next_id)
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.data_reuse_summary_keyset(uuid, integer, timestamptz, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.data_reuse_summary_keyset(uuid, integer, timestamptz, uuid) TO authenticated;