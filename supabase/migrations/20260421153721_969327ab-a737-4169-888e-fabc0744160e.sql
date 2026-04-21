DROP VIEW IF EXISTS public.v_duplicate_summary;
CREATE VIEW public.v_duplicate_summary
WITH (security_invoker = true) AS
SELECT
  workspace_id,
  COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '24 hours') AS dupes_24h,
  COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '7 days')  AS dupes_7d,
  COUNT(*) AS dupes_total,
  COUNT(DISTINCT order_id) AS unique_orders_affected,
  COALESCE(SUM(total_value) FILTER (WHERE last_seen_at >= now() - interval '24 hours'), 0) AS value_at_risk_24h
FROM public.duplicate_detections
GROUP BY workspace_id;