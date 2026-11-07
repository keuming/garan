-- =====================================================================
-- Migration 017 — Abonnement par appareil
-- La sécurisation concerne chaque appareil : chaque device_registrations
-- porte sa propre mise en service (payée une seule fois) et sa propre
-- échéance d'abonnement mensuel (payable plusieurs mois d'avance).
-- Idempotente : réexécutable sans risque.
-- =====================================================================

ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS setup_paid_at timestamptz;
ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

-- Rattache chaque encaissement d'abonnement à l'appareil concerné.
ALTER TABLE orzayah_payments ADD COLUMN IF NOT EXISTS device_registration_id uuid REFERENCES device_registrations(id);
CREATE INDEX IF NOT EXISTS orzayah_payments_devreg_idx ON orzayah_payments (device_registration_id);

-- Report des abonnements déjà payés au niveau du compte usager vers ses appareils
-- actifs, pour ne pas refacturer la mise en service d'un appareil déjà en service.
UPDATE device_registrations r
SET subscription_expires_at = c.subscription_expires_at,
    setup_paid_at = COALESCE(r.setup_paid_at, r.acquired_at)
FROM consumers c
WHERE r.consumer_id = c.id
  AND r.status = 'active'
  AND c.subscription_expires_at IS NOT NULL
  AND r.subscription_expires_at IS NULL;
