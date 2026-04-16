
DO $$
DECLARE
  ws uuid := 'b477d45c-263b-4b29-befb-a43dd13c97d8';
BEGIN
  DELETE FROM public.event_deliveries WHERE workspace_id = ws;
  DELETE FROM public.event_queue WHERE workspace_id = ws;
  DELETE FROM public.attribution_results WHERE workspace_id = ws;
  DELETE FROM public.attribution_hybrid WHERE workspace_id = ws;
  DELETE FROM public.attribution_touches WHERE workspace_id = ws;
  DELETE FROM public.conversions WHERE workspace_id = ws;
  DELETE FROM public.dead_letter_events WHERE workspace_id = ws;
  DELETE FROM public.events WHERE workspace_id = ws;
  DELETE FROM public.orders WHERE workspace_id = ws;
  DELETE FROM public.ai_insights WHERE workspace_id = ws;
  DELETE FROM public.anomaly_alerts WHERE workspace_id = ws;
END $$;
