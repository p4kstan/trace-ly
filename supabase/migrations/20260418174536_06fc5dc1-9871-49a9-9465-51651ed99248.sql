
CREATE TABLE public.google_ads_conversion_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  google_ads_credential_id UUID REFERENCES public.google_ads_credentials(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  conversion_id TEXT NOT NULL,
  conversion_label TEXT NOT NULL,
  event_name TEXT DEFAULT 'purchase',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.google_ads_conversion_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view their conversion actions"
ON public.google_ads_conversion_actions FOR SELECT
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Workspace admins can insert conversion actions"
ON public.google_ads_conversion_actions FOR INSERT
WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin','editor')));

CREATE POLICY "Workspace admins can update conversion actions"
ON public.google_ads_conversion_actions FOR UPDATE
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin','editor')));

CREATE POLICY "Workspace admins can delete conversion actions"
ON public.google_ads_conversion_actions FOR DELETE
USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin','editor')));

CREATE INDEX idx_gads_conv_actions_workspace ON public.google_ads_conversion_actions(workspace_id);
CREATE INDEX idx_gads_conv_actions_credential ON public.google_ads_conversion_actions(google_ads_credential_id);

CREATE TRIGGER update_gads_conv_actions_updated_at
BEFORE UPDATE ON public.google_ads_conversion_actions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
