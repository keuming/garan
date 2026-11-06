-- =====================================================================
-- gaRAN — Migration 016 : e-mail du compte enregistré sur l'appareil
--   Saisi au moment du linkage (Gmail pour Android, iCloud pour iOS).
--   Sert au certificat de sécurité et au reçu d'achat certifiés gaRAN.
-- Idempotent.
-- =====================================================================

ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS account_email text;
