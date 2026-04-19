-- P2: Alterar FK sessions.identity_id para ON DELETE SET NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND constraint_name = 'sessions_identity_id_fkey'
  ) THEN
    ALTER TABLE public.sessions DROP CONSTRAINT sessions_identity_id_fkey;
  END IF;
END $$;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_identity_id_fkey
  FOREIGN KEY (identity_id)
  REFERENCES public.identities(id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.sessions VALIDATE CONSTRAINT sessions_identity_id_fkey;