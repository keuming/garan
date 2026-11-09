-- gaRAN gère les ordinateurs, tablettes et autres appareils électroniques, qui
-- n'ont pas d'IMEI mais un numéro de série. On généralise la déclaration de vol/
-- perte (theft_reports) à ces appareils : l'IMEI devient facultatif et un numéro
-- de série (+ type d'appareil) peut l'accompagner ou le remplacer.
ALTER TABLE theft_reports ALTER COLUMN imei DROP NOT NULL;

ALTER TABLE theft_reports ADD COLUMN IF NOT EXISTS serial_number text;
ALTER TABLE theft_reports ADD COLUMN IF NOT EXISTS device_type text NOT NULL DEFAULT 'phone'
  CHECK (device_type IN ('phone', 'computer', 'tablet', 'other'));

-- Une déclaration doit toujours porter au moins un identifiant.
ALTER TABLE theft_reports DROP CONSTRAINT IF EXISTS theft_reports_identifier_present;
ALTER TABLE theft_reports ADD CONSTRAINT theft_reports_identifier_present
  CHECK (imei IS NOT NULL OR serial_number IS NOT NULL);

-- Recherche d'un signalement par numéro de série (comme l'index IMEI existant).
CREATE INDEX IF NOT EXISTS theft_reports_serial_idx ON theft_reports (upper(serial_number))
  WHERE serial_number IS NOT NULL;
