-- ════════════════════════════════════════════════════════════
-- BLOCO B — Mapeamentos canônicos globais (Hotmart/Kiwify/Stripe)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.default_event_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL,
  gateway_event TEXT NOT NULL,
  internal_event_name TEXT NOT NULL,
  external_platform TEXT NOT NULL DEFAULT 'meta',
  external_event_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_default_mapping UNIQUE (gateway, gateway_event, external_platform)
);

CREATE INDEX IF NOT EXISTS idx_default_mappings_lookup
  ON public.default_event_mappings (gateway, gateway_event, external_platform);

-- RLS: leitura pra qualquer authenticated (é um dicionário, não tem PII)
ALTER TABLE public.default_event_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read default mappings"
  ON public.default_event_mappings
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE só via service role (sem policy → bloqueio implícito)

-- ── Seed: Hotmart → Meta ──
INSERT INTO public.default_event_mappings (gateway, gateway_event, internal_event_name, external_platform, external_event_name) VALUES
  ('hotmart', 'PURCHASE_COMPLETE',         'order_paid',            'meta', 'Purchase'),
  ('hotmart', 'PURCHASE_APPROVED',         'order_paid',            'meta', 'Purchase'),
  ('hotmart', 'PURCHASE_REFUNDED',         'order_refunded',        'meta', 'Purchase'),
  ('hotmart', 'PURCHASE_CHARGEBACK',       'order_chargeback',      'meta', 'Purchase'),
  ('hotmart', 'PURCHASE_CANCELED',         'order_canceled',        'meta', 'Purchase'),
  ('hotmart', 'PURCHASE_BILLET_PRINTED',   'boleto_generated',      'meta', 'InitiateCheckout'),
  ('hotmart', 'PURCHASE_DELAYED',          'payment_pending',       'meta', 'AddPaymentInfo'),
  ('hotmart', 'SUBSCRIPTION_CANCELLATION', 'subscription_canceled', 'meta', 'Subscribe'),
  ('hotmart', 'SWITCH_PLAN',               'subscription_renewed',  'meta', 'Subscribe')
ON CONFLICT (gateway, gateway_event, external_platform) DO NOTHING;

-- ── Seed: Kiwify → Meta ──
INSERT INTO public.default_event_mappings (gateway, gateway_event, internal_event_name, external_platform, external_event_name) VALUES
  ('kiwify', 'order_approved',         'order_paid',            'meta', 'Purchase'),
  ('kiwify', 'order_completed',        'order_paid',            'meta', 'Purchase'),
  ('kiwify', 'order_refunded',         'order_refunded',        'meta', 'Purchase'),
  ('kiwify', 'order_chargedback',      'order_chargeback',      'meta', 'Purchase'),
  ('kiwify', 'subscription_created',   'subscription_started',  'meta', 'Subscribe'),
  ('kiwify', 'subscription_renewed',   'subscription_renewed',  'meta', 'Subscribe'),
  ('kiwify', 'subscription_canceled',  'subscription_canceled', 'meta', 'Subscribe'),
  ('kiwify', 'waiting_payment',        'payment_pending',       'meta', 'AddPaymentInfo'),
  ('kiwify', 'pix_created',            'pix_generated',         'meta', 'InitiateCheckout'),
  ('kiwify', 'billet_created',         'boleto_generated',      'meta', 'InitiateCheckout')
ON CONFLICT (gateway, gateway_event, external_platform) DO NOTHING;

-- ── Seed: Stripe → Meta ──
INSERT INTO public.default_event_mappings (gateway, gateway_event, internal_event_name, external_platform, external_event_name) VALUES
  ('stripe', 'checkout.session.completed',     'order_paid',            'meta', 'Purchase'),
  ('stripe', 'payment_intent.succeeded',       'payment_paid',          'meta', 'Purchase'),
  ('stripe', 'payment_intent.created',         'payment_created',       'meta', 'AddPaymentInfo'),
  ('stripe', 'charge.succeeded',               'payment_paid',          'meta', 'Purchase'),
  ('stripe', 'charge.refunded',                'payment_refunded',      'meta', 'Purchase'),
  ('stripe', 'charge.dispute.created',         'order_chargeback',      'meta', 'Purchase'),
  ('stripe', 'customer.subscription.created',  'subscription_started',  'meta', 'Subscribe'),
  ('stripe', 'customer.subscription.updated',  'subscription_renewed',  'meta', 'Subscribe'),
  ('stripe', 'customer.subscription.deleted',  'subscription_canceled', 'meta', 'Subscribe'),
  ('stripe', 'invoice.paid',                   'payment_paid',          'meta', 'Purchase')
ON CONFLICT (gateway, gateway_event, external_platform) DO NOTHING;