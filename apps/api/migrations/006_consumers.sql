-- =====================================================================
-- gaRAN — Migration 006 : usagers (propriétaires finaux) et chaîne de propriété
--   Marchand / super marchand = commerçant vendeur (voir migrations 004-005).
--   Usager = acheteur final, qui enregistre lui-même son téléphone via l'app
--   grand public et le relie à son compte (linkage / délinkage).
-- Idempotent.
-- =====================================================================

-- Comptes usagers (connexion par téléphone + code PIN, comme les marchands)
CREATE TABLE IF NOT EXISTS consumers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  phone            text NOT NULL UNIQUE,
  email            text,
  pin_hash         text NOT NULL,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Les jetons de rafraîchissement acceptent désormais le sujet « consumer »
ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_subject_type_check;
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_subject_type_check
  CHECK (subject_type IN ('user','admin','consumer'));

-- L'appareil peut désormais appartenir à un usager
ALTER TABLE devices ADD COLUMN IF NOT EXISTS owner_consumer_id uuid REFERENCES consumers(id);

ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_owner_type_check;
ALTER TABLE devices ADD CONSTRAINT devices_owner_type_check
  CHECK (owner_type IN ('none','shop','person','consumer'));

ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_owner_consistency;
ALTER TABLE devices ADD CONSTRAINT devices_owner_consistency CHECK (
  (owner_type = 'none'     AND owner_shop_id IS NULL AND owner_person_id IS NULL AND owner_consumer_id IS NULL) OR
  (owner_type = 'shop'     AND owner_shop_id IS NOT NULL AND owner_person_id IS NULL AND owner_consumer_id IS NULL) OR
  (owner_type = 'person'   AND owner_person_id IS NOT NULL AND owner_shop_id IS NULL AND owner_consumer_id IS NULL) OR
  (owner_type = 'consumer' AND owner_consumer_id IS NOT NULL AND owner_shop_id IS NULL AND owner_person_id IS NULL)
);
CREATE INDEX IF NOT EXISTS devices_owner_consumer_idx ON devices (owner_consumer_id) WHERE owner_consumer_id IS NOT NULL;

-- Enregistrement d'un téléphone par un usager (déclaration de possession)
CREATE TABLE IF NOT EXISTS device_registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       uuid NOT NULL REFERENCES devices(id),
  consumer_id     uuid NOT NULL REFERENCES consumers(id),
  purchase_place  text,
  merchant_name   text,
  receipt_number  text,
  receipt_key     text,
  box_photo_key   text,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  acquired_at     timestamptz NOT NULL DEFAULT now(),
  released_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_registrations_device_idx ON device_registrations (device_id, acquired_at);
CREATE INDEX IF NOT EXISTS device_registrations_consumer_idx ON device_registrations (consumer_id, status);
-- Un appareil n'a qu'un seul enregistrement actif à la fois
CREATE UNIQUE INDEX IF NOT EXISTS device_registrations_one_active
  ON device_registrations (device_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS consumers_touch ON consumers;
CREATE TRIGGER consumers_touch BEFORE UPDATE ON consumers
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
