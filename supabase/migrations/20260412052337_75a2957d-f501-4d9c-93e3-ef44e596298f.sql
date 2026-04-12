
-- Event queue for async processing with retry
CREATE TABLE public.event_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  event_id uuid,
  order_id uuid,
  provider text NOT NULL DEFAULT 'meta',
  destination text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient queue polling
CREATE INDEX idx_event_queue_status_retry ON public.event_queue (status, next_retry_at) WHERE status IN ('queued', 'retry');
CREATE INDEX idx_event_queue_workspace ON public.event_queue (workspace_id);

-- RLS
ALTER TABLE public.event_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eq_select" ON public.event_queue FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Trigger for updated_at
CREATE TRIGGER update_event_queue_updated_at
  BEFORE UPDATE ON public.event_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
