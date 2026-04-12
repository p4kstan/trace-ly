
-- Drop the security definer view, replace with regular view
DROP VIEW IF EXISTS public.gateway_integrations_safe;

CREATE VIEW public.gateway_integrations_safe 
WITH (security_invoker = true) AS
SELECT 
  id, workspace_id, provider, name, status, environment, 
  api_base_url, created_at, updated_at, public_config_json, settings_json, last_sync_at
FROM public.gateway_integrations;
