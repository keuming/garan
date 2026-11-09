-- =====================================================================
-- gaRAN — Migration 025 : routage opérateur, relances et notification usager
-- Enrichit les demandes de blocage pour : relancer une demande transmise sans
-- réponse, et tracer la dernière notification envoyée au propriétaire.
-- Idempotent.
-- =====================================================================

ALTER TABLE block_requests ADD COLUMN IF NOT EXISTS reminder_count int NOT NULL DEFAULT 0;
ALTER TABLE block_requests ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;
ALTER TABLE block_requests ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz;
ALTER TABLE block_requests ADD COLUMN IF NOT EXISTS owner_notified_status text;

-- Demandes transmises depuis un moment et toujours sans réponse : à relancer.
CREATE INDEX IF NOT EXISTS block_requests_followup_idx
  ON block_requests (transmitted_at)
  WHERE status = 'transmitted';
