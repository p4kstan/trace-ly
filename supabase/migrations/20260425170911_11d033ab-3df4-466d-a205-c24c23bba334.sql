-- Passo R: normalized ad/conversion destination registry + secure RPCs for the
-- Data Reuse Center. Conservative additive migration — does NOT touch existing
-- gateway_integrations / integration_destinations data.

-- 1) Normalized destination registry --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_conversion_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,                 -- google_ads | ga4 | meta | tiktok | microsoft | other
  destination_id text NOT NULL,           -- stable composite id chosen by operator
  display_name text NOT NULL DEFAULT '',
  account_id text,                        -- customer_id / ad_account_id / property_id
  conversion_action_id text,              -- google ads conversion action / GA4 event
  event_name text,                        -- canonical event (purchase, lead, ...)
  pixel_id text,                          -- meta pixel / tiktok pixel
  credential_ref text,                    -- REFERENCE only (pointer to vault / secret name)
  status text NOT NULL DEFAULT 'pending', -- pending | active | failing | paused | unknown
  consent_gate_required boolean NOT NULL DEFAULT true,
  send_enabled boolean NOT NULL DEFAULT false,
  test_mode_default boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_error_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, destination_id)
);

CREATE INDEX IF NOT EXISTS idx_acd_workspace ON public.ad_conversion_destinations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_acd_workspace_provider ON public.ad_conversion_destinations(workspace_id, provider);

ALTER TABLE public.ad_conversion_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acd_select_member" ON public.ad_conversion_destinations;
CREATE POLICY "acd_select_member"
  ON public.ad_conversion_destinations
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "acd_insert_admin" ON public.ad_conversion_destinations;
CREATE POLICY "acd_insert_admin"
  ON public.ad_conversion_destinations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "acd_update_admin" ON public.ad_conversion_destinations;
CREATE POLICY "acd_update_admin"
  ON public.ad_conversion_destinations
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "acd_delete_admin" ON public.ad_conversion_destinations;
CREATE POLICY "acd_delete_admin"
  ON public.ad_conversion_destinations
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id));

DROP TRIGGER IF EXISTS update_acd_updated_at ON public.ad_conversion_destinations;
CREATE TRIGGER update_acd_updated_at
  BEFORE UPDATE ON public.ad_conversion_destinations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Secure summary RPC for the Data Reuse Center ------------------------------------
-- Aggregates counters server-side from `orders` (the same surface the page uses).
-- Returns NO PII — only counts / flags / status. Pagination via limit+offset
-- with hard ceiling. Extra `total_orders` always returned for the UI.
CREATE OR REPLACE FUNCTION public.data_reuse_summary(
  _workspace_id uuid,
  _limit integer DEFAULT 500,
  _offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 500), 1), 10000);
  v_offset integer := GREATEST(COALESCE(_offset, 0), 0);
  v_total bigint := 0;
  v_summary jsonb;
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
     ORDER BY created_at DESC
     LIMIT v_limit OFFSET v_offset
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
  )
  SELECT to_jsonb(flags.*) INTO v_summary FROM flags;

  RETURN jsonb_build_object(
    'ok', true,
    'workspace_id', _workspace_id,
    'limit', v_limit,
    'offset', v_offset,
    'total_orders', v_total,
    'summary', COALESCE(v_summary, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.data_reuse_summary(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.data_reuse_summary(uuid, integer, integer) TO authenticated;

-- 3) Secure listing RPC for normalized destinations ----------------------------------
-- Returns destination metadata (no credentials) to be used by the consistency checker
-- and the Data Reuse Center. Excludes any potential secret-bearing column.
CREATE OR REPLACE FUNCTION public.list_ad_conversion_destinations(
  _workspace_id uuid
) RETURNS TABLE (
  id uuid,
  provider text,
  destination_id text,
  display_name text,
  account_id text,
  conversion_action_id text,
  event_name text,
  pixel_id text,
  credential_ref text,
  status text,
  consent_gate_required boolean,
  send_enabled boolean,
  test_mode_default boolean,
  last_success_at timestamptz,
  last_error_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, provider, destination_id, display_name, account_id, conversion_action_id,
         event_name, pixel_id, credential_ref, status, consent_gate_required,
         send_enabled, test_mode_default, last_success_at, last_error_at
    FROM public.ad_conversion_destinations
   WHERE workspace_id = _workspace_id
     AND public.is_workspace_member(auth.uid(), _workspace_id);
$$;

REVOKE ALL ON FUNCTION public.list_ad_conversion_destinations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_ad_conversion_destinations(uuid) TO authenticated;