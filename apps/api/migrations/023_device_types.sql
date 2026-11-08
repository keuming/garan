-- =====================================================================
-- Migration 023 — Appareils électroniques non-téléphone (ordinateurs, etc.)
-- gaRAN gère désormais, en plus des téléphones (IMEI), les ordinateurs,
-- tablettes et autres appareils électroniques identifiés par un NUMÉRO DE SÉRIE.
-- Idempotente : réexécutable sans risque.
-- =====================================================================

-- Type d'appareil + numéro de série.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type text NOT NULL DEFAULT 'phone'
  CHECK (device_type IN ('phone', 'computer', 'tablet', 'other'));
ALTER TABLE devices ADD COLUMN IF NOT EXISTS serial_number text;

-- L'IMEI n'est plus obligatoire (les non-téléphones n'en ont pas).
-- La contrainte de format reste : elle accepte NULL, et 15 chiffres sinon.
ALTER TABLE devices ALTER COLUMN imei1 DROP NOT NULL;

-- Un identifiant au moins est requis : IMEI (téléphone) ou numéro de série (autre).
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_identifier_present;
ALTER TABLE devices ADD CONSTRAINT devices_identifier_present
  CHECK (imei1 IS NOT NULL OR serial_number IS NOT NULL);

-- Unicité du numéro de série dans le registre (comme l'IMEI), insensible à la casse.
CREATE UNIQUE INDEX IF NOT EXISTS devices_serial_uniq
  ON devices (upper(serial_number)) WHERE serial_number IS NOT NULL;
