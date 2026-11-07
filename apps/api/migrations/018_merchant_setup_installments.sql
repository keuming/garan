-- =====================================================================
-- Migration 018 — Mise en service marchand payable en plusieurs versements
-- Le marchand peut régler ses 10 000 FCFA de mise en service en versements
-- de 2 500 FCFA (jusqu'à 4), dans un délai de 30 jours à compter du 1er.
-- Idempotente : réexécutable sans risque.
-- =====================================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS setup_paid_fcfa integer NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS setup_first_payment_at timestamptz;

-- Autorise le motif 'setup_merchant' dans le journal des encaissements ORZAYAH.
ALTER TABLE orzayah_payments DROP CONSTRAINT IF EXISTS orzayah_payments_purpose_check;
ALTER TABLE orzayah_payments ADD CONSTRAINT orzayah_payments_purpose_check
  CHECK (purpose IN ('subscription_merchant', 'subscription_consumer', 'sale', 'setup_merchant'));

-- Marchands déjà abonnés : la mise en service (groupée) est considérée comme réglée.
UPDATE organizations
SET setup_paid_fcfa = 10000
WHERE setup_paid_fcfa = 0 AND subscription_expires_at IS NOT NULL;
