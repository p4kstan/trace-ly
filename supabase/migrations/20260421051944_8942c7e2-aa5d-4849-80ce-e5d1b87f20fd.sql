-- Notification channels for automation rules
CREATE TABLE public.automation_rule_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('slack', 'email', 'webhook')),
  target TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  only_on_action BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rule_alerts_rule ON public.automation_rule_alerts(rule_id);
CREATE INDEX idx_rule_alerts_workspace ON public.automation_rule_alerts(workspace_id);

ALTER TABLE public.automation_rule_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view alerts" ON public.automation_rule_alerts
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members insert alerts" ON public.automation_rule_alerts
  FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members update alerts" ON public.automation_rule_alerts
  FOR UPDATE USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members delete alerts" ON public.automation_rule_alerts
  FOR DELETE USING (public.is_workspace_member(auth.uid(), workspace_id));