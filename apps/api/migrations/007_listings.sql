-- =====================================================================
-- Migration 007 — Disponibilité (vitrine e-commerce), paiement & compte ORZAYAH
-- Idempotente : réexécutable sans risque.
-- =====================================================================

-- 1) Numéro de compte ORZAYAH du marchand (pour l'encaissement et le solde)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS orzayah_number text;

-- 2) Mode de paiement d'une vente (espèces ou ORZAYAH)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method text
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'orzayah'));

-- 3) Articles disponibles en boutique (vitrine façon e-commerce)
--    Un « article » = un modèle du catalogue, avec photo, description, prix et quantité.
--    La quantité est décrémentée automatiquement à chaque vente liée à l'article.
CREATE TABLE IF NOT EXISTS listings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_id          uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  brand_id         integer REFERENCES brands(id),
  model_id         integer REFERENCES models(id),
  model_label      text,
  title            text NOT NULL,                 -- libellé affiché (marque + modèle)
  description      text,
  photo_key        text,                          -- clé de stockage de l'unique photo
  price            bigint NOT NULL DEFAULT 0 CHECK (price >= 0),
  quantity         integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_shop_idx ON listings (shop_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS listings_org_idx  ON listings (organization_id);

DROP TRIGGER IF EXISTS listings_touch ON listings;
CREATE TRIGGER listings_touch BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
