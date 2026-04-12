
-- 3. Gateway Integrations: Create a safe view without credentials
CREATE OR REPLACE VIEW public.gateway_integrations_safe AS
SELECT 
  id, workspace_id, provider, name, status, environment, 
  api_base_url, created_at, updated_at, public_config_json, settings_json, last_sync_at
FROM public.gateway_integrations;

-- Safe function to get integrations without credentials
CREATE OR REPLACE FUNCTION public.get_integration_metadata(_workspace_id uuid)
RETURNS TABLE(
  id uuid, workspace_id uuid, provider text, name text, status text,
  environment text, api_base_url text, created_at timestamptz, updated_at timestamptz,
  public_config_json jsonb, settings_json jsonb, last_sync_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, workspace_id, provider, name, status, environment,
         api_base_url, created_at, updated_at, public_config_json, settings_json, last_sync_at
  FROM public.gateway_integrations
  WHERE workspace_id = _workspace_id;
$$;
