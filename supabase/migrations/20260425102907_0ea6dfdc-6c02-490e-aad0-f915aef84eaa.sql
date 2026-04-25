CREATE UNIQUE INDEX IF NOT EXISTS uq_event_deliveries_ws_event_provider
  ON public.event_deliveries (workspace_id, event_id, provider);