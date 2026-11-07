-- =====================================================================
-- Migration 020 — Programme Business Développeur (parrainage)
-- Un usager validé devient Business Développeur (BD) : il obtient un code
-- promo et touche des commissions quand ses filleuls paient.
--   Usager parrainé   : +250 FCFA à la mise en service (une fois) + 25 FCFA / abonnement mensuel
--   Marchand parrainé : +2000 FCFA à l'activation complète du compte (une fois)
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS business_developers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL UNIQUE REFERENCES consumers(id) ON DELETE CASCADE,
  promo_code text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);

-- Attribution du parrainage (code promo saisi à l'inscription).
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS referred_by_bd_id uuid REFERENCES business_developers(id);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS referred_by_bd_id uuid REFERENCES business_developers(id);

-- Journal des commissions dues/reversées.
CREATE TABLE IF NOT EXISTS bd_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_developer_id uuid NOT NULL REFERENCES business_developers(id) ON DELETE CASCADE,
  referred_kind text NOT NULL CHECK (referred_kind IN ('consumer', 'organization')),
  referred_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('setup_consumer', 'subscription_consumer', 'setup_merchant')),
  amount_fcfa integer NOT NULL,
  source text,
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bd_commissions_bd_idx ON bd_commissions (business_developer_id);
CREATE INDEX IF NOT EXISTS bd_commissions_due_idx ON bd_commissions (business_developer_id) WHERE payout_id IS NULL;
-- Garantit l'unicité des commissions « une seule fois » (mise en service usager / marchand).
CREATE UNIQUE INDEX IF NOT EXISTS bd_commissions_setup_once
  ON bd_commissions (referred_kind, referred_id)
  WHERE kind IN ('setup_consumer', 'setup_merchant');

-- Reversements effectués aux BD.
CREATE TABLE IF NOT EXISTS bd_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_developer_id uuid NOT NULL REFERENCES business_developers(id) ON DELETE CASCADE,
  amount_fcfa integer NOT NULL,
  method text,
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bd_payouts_bd_idx ON bd_payouts (business_developer_id);
