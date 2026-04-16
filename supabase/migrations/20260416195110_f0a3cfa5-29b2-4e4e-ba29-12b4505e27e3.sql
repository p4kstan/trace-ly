
-- ========== GOOGLE ADS: permitir múltiplas contas ==========

-- 1) Remover UNIQUE(workspace_id) se existir (permite N contas por workspace)
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.google_ads_credentials'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.google_ads_credentials DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 2) Adicionar colunas de roteamento e apelido
ALTER TABLE public.google_ads_credentials
  ADD COLUMN IF NOT EXISTS account_label text,
  ADD COLUMN IF NOT EXISTS routing_mode text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS routing_domains text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS routing_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- 3) Marcar contas existentes como padrão (preserva dados)
UPDATE public.google_ads_credentials
SET is_default = true,
    account_label = COALESCE(account_label, 'Conta principal')
WHERE is_default = false;

-- 4) Novo unique permitindo várias contas por workspace, mas evitando duplicar customer_id
CREATE UNIQUE INDEX IF NOT EXISTS google_ads_credentials_ws_customer_uniq
  ON public.google_ads_credentials (workspace_id, customer_id);

-- 5) Garantir que só uma conta seja "default" por workspace
CREATE UNIQUE INDEX IF NOT EXISTS google_ads_credentials_one_default
  ON public.google_ads_credentials (workspace_id) WHERE is_default = true;


-- ========== META: nova tabela de ad accounts ==========

CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  account_label text,
  ad_account_id text NOT NULL,
  pixel_id text,
  access_token text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  routing_mode text NOT NULL DEFAULT 'all',
  routing_domains text[] NOT NULL DEFAULT '{}',
  routing_tags text[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ad_accounts_ws_account_uniq UNIQUE (workspace_id, ad_account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_ad_accounts_one_default
  ON public.meta_ad_accounts (workspace_id) WHERE is_default = true;

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maa_select" ON public.meta_ad_accounts
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "maa_manage" ON public.meta_ad_accounts
  FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER trg_maa_updated_at
  BEFORE UPDATE ON public.meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
