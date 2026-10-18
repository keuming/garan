-- =====================================================================
-- gaRAN — Migration 005 : sous-marchands indépendants
--   Un super marchand (grossiste) regroupe plusieurs sous-marchands.
--   Chaque sous-marchand est une organisation « merchant » à part entière,
--   avec son PROPRE abonnement, reliée au super marchand par parent_id.
-- Idempotent.
-- =====================================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizations_parent_idx ON organizations (parent_id) WHERE parent_id IS NOT NULL;

-- Un parent doit être un super marchand, et un super marchand n'a pas lui-même de parent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_parent_not_self') THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;
