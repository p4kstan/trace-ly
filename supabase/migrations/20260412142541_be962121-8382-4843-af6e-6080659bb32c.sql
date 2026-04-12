
-- MCP Tokens table
CREATE TABLE public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'MCP Token',
  permissions text[] NOT NULL DEFAULT ARRAY['read']::text[],
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_tokens_select" ON public.mcp_tokens FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "mcp_tokens_manage" ON public.mcp_tokens FOR ALL TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_mcp_tokens_token ON public.mcp_tokens (token) WHERE revoked = false;
CREATE INDEX idx_mcp_tokens_workspace ON public.mcp_tokens (workspace_id);

-- MCP Logs table
CREATE TABLE public.mcp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  token_id uuid REFERENCES public.mcp_tokens(id) ON DELETE SET NULL,
  tool text NOT NULL,
  request_json jsonb,
  response_json jsonb,
  duration_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_logs_select" ON public.mcp_logs FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_mcp_logs_workspace ON public.mcp_logs (workspace_id, created_at DESC);
