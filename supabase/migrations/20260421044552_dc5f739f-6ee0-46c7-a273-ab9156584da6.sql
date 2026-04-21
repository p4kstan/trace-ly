-- Automation rules for Google Ads optimisation
CREATE TABLE public.automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  customer_id TEXT,
  campaign_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- Trigger definition (no-code)
  -- Example: { "metric": "cpa", "operator": ">", "threshold": 50, "window_days": 7, "scope": "keyword" }
  condition_json JSONB NOT NULL,
  -- Action when condition is met
  -- Example: { "type": "pause_keyword" } or { "type": "decrease_bid", "factor": 0.8 }
  action_json JSONB NOT NULL,
  last_evaluated_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view automation rules"
  ON public.automation_rules FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can create automation rules"
  ON public.automation_rules FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can update automation rules"
  ON public.automation_rules FOR UPDATE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can delete automation rules"
  ON public.automation_rules FOR DELETE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX idx_automation_rules_workspace ON public.automation_rules(workspace_id);
CREATE INDEX idx_automation_rules_campaign ON public.automation_rules(workspace_id, campaign_id) WHERE campaign_id IS NOT NULL;

CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();