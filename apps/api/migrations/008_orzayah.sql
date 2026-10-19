-- =====================================================================
-- Migration 008 — Paiement digital ORZAYAH (abonnements encaissés par dépôt)
-- Idempotente : réexécutable sans risque.
-- =====================================================================

-- Validité d'abonnement de l'usager (le marchand l'a déjà via organizations)
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

-- Journal des encaissements ORZAYAH (dépôts Mobile Money vers le compte gaRAN)
CREATE TABLE IF NOT EXISTS orzayah_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  text NOT NULL UNIQUE,
  reference        text,                         -- référence renvoyée par ORZAYAH
  purpose          text NOT NULL CHECK (purpose IN ('subscription_merchant', 'subscription_consumer', 'sale')),
  subject_type     text NOT NULL CHECK (subject_type IN ('organization', 'consumer')),
  subject_id       uuid NOT NULL,
  amount           bigint NOT NULL CHECK (amount >= 0),   -- centimes envoyés à ORZAYAH
  months           integer,
  operator         text,
  account_number   text,
  status           text NOT NULL DEFAULT 'INITIATED',
  failure_reason   text,
  applied          boolean NOT NULL DEFAULT false,        -- abonnement déjà crédité ?
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orzayah_payments_subject_idx ON orzayah_payments (subject_type, subject_id, created_at DESC);

DROP TRIGGER IF EXISTS orzayah_payments_touch ON orzayah_payments;
CREATE TRIGGER orzayah_payments_touch BEFORE UPDATE ON orzayah_payments
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
