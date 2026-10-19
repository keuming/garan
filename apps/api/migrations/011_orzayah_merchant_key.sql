-- =====================================================================
-- Migration 011 — Compte ORZAYAH du marchand relié à gaRAN (encaissement direct)
-- Idempotente : réexécutable sans risque.
-- La clé API ORZAYAH du marchand (service « Dépôt ») est stockée chiffrée (AES-256-GCM).
-- Les liens de paiement des ventes créditent ainsi directement son portefeuille.
-- =====================================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS orzayah_api_key_enc   text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS orzayah_api_key_last4 text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS orzayah_linked_at     timestamptz;
