-- Tabela de domínios permitidos por workspace (independente de pixel)
CREATE TABLE IF NOT EXISTS public.workspace_allowed_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_wad_workspace ON public.workspace_allowed_domains(workspace_id);

ALTER TABLE public.workspace_allowed_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wad_select" ON public.workspace_allowed_domains
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "wad_manage" ON public.workspace_allowed_domains
  FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));