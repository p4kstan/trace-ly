-- Audit_logs.actor_user_id: change from NO ACTION to ON DELETE CASCADE
-- Using NOT VALID + VALIDATE to avoid full table lock
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.audit_logs VALIDATE CONSTRAINT audit_logs_actor_user_id_fkey;

-- The other 3 FKs (api_keys.workspace_id, audit_logs.workspace_id, conversions.workspace_id)
-- already have ON DELETE CASCADE — verified via pg_constraint.confdeltype = 'c'.