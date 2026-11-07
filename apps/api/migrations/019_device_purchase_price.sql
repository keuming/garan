-- =====================================================================
-- Migration 019 — Prix d'achat de l'appareil
-- Permet de faire figurer le prix d'achat sur le reçu certifié.
-- Saisi au linkage par l'usager, ou repris automatiquement du prix de
-- vente lorsqu'un marchand active gaRAN pour l'acheteur. Idempotente.
-- =====================================================================

ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS purchase_price integer;
