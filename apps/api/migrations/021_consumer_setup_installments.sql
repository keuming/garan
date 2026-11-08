-- =====================================================================
-- Migration 021 — Mise en service USAGER payable en plusieurs versements
-- Chaque appareil règle ses 1 000 FCFA de mise en service en versements de
-- 250 FCFA (jusqu'à 4), dans un délai de 30 jours à compter du 1er versement.
-- Dès la 1re tranche payée, le compte est activé ; le reliquat est rappelé.
-- Idempotente : réexécutable sans risque.
-- =====================================================================

ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS setup_paid_fcfa integer NOT NULL DEFAULT 0;
ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS setup_first_payment_at timestamptz;

-- Autorise le motif 'setup_consumer' dans le journal des encaissements ORZAYAH.
ALTER TABLE orzayah_payments DROP CONSTRAINT IF EXISTS orzayah_payments_purpose_check;
ALTER TABLE orzayah_payments ADD CONSTRAINT orzayah_payments_purpose_check
  CHECK (purpose IN ('subscription_merchant', 'subscription_consumer', 'sale', 'setup_merchant', 'setup_consumer'));

-- Appareils dont la mise en service (groupée, ancien modèle) est déjà réglée :
-- on considère les 1 000 FCFA entièrement payés.
UPDATE device_registrations
SET setup_paid_fcfa = 1000,
    setup_first_payment_at = COALESCE(setup_first_payment_at, setup_paid_at)
WHERE setup_paid_fcfa = 0 AND setup_paid_at IS NOT NULL;
