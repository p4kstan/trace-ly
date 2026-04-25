-- MCP API tokens for Codex agent integration
CREATE TABLE IF NOT EXISTS public.mcp_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '["traffic-agent:read","traffic-agent:evaluate","traffic-agent:simulate","traffic-agent:dry_run","rag:read"]'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_tokens_workspace ON public.mcp_api_tokens(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mcp_api_tokens_hash ON public.mcp_api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_mcp_api_tokens_revoked ON public.mcp_api_tokens(revoked_at);

ALTER TABLE public.mcp_api_tokens ENABLE ROW LEVEL SECURITY;

-- Members can view tokens metadata (token_hash should never be selected by UI but we restrict at column level via app logic)
CREATE POLICY "Members can view workspace mcp tokens"
  ON public.mcp_api_tokens FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Only admins/owners can insert tokens
CREATE POLICY "Admins can create mcp tokens"
  ON public.mcp_api_tokens FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id) AND created_by = auth.uid());

-- Only admins/owners can update (revoke) tokens
CREATE POLICY "Admins can update mcp tokens"
  ON public.mcp_api_tokens FOR UPDATE
  TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));

-- updated_at trigger
CREATE TRIGGER update_mcp_api_tokens_updated_at
  BEFORE UPDATE ON public.mcp_api_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();