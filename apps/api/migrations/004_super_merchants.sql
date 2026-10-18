-- =====================================================================
-- gaRAN — Migration 004 : architecture clients
--   merchant        : marchand simple (une boutique)
--   super_merchant  : super marchand / grossiste, plusieurs sous-comptes CLIENT
-- Idempotent.
-- =====================================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'merchant';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_type_check') THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_type_check CHECK (type IN ('merchant', 'super_merchant'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS organizations_type_idx ON organizations (type);

-- Les organisations qui ont déjà plusieurs boutiques autorisées deviennent super marchands
UPDATE organizations SET type = 'super_merchant' WHERE max_shops > 1 AND type = 'merchant';
