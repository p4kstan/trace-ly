ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS gbraid TEXT,
  ADD COLUMN IF NOT EXISTS wbraid TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_workspace_gbraid
  ON public.sessions (workspace_id, gbraid)
  WHERE gbraid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_workspace_wbraid
  ON public.sessions (workspace_id, wbraid)
  WHERE wbraid IS NOT NULL;