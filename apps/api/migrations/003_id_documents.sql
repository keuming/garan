-- =====================================================================
-- gaRAN — Migration 003 : stockage des pièces d'identité en base
-- Utilisé quand STORAGE_DRIVER=db (démarrage sans service S3/R2).
-- Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS id_documents (
  key           text PRIMARY KEY,
  content_type  text NOT NULL,
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  data          bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
