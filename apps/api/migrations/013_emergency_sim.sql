-- =====================================================================
-- gaRAN — Migration 013 : numéro de secours + détection de changement de SIM
--   emergency_number / emergency_name : contact de secours prévenu en cas d'alerte
--   last_sim_id : dernier identifiant de carte SIM vu par l'app (pour détecter un changement)
-- Idempotent.
-- =====================================================================

ALTER TABLE consumers ADD COLUMN IF NOT EXISTS emergency_number text;
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS emergency_name   text;
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS last_sim_id      text;
