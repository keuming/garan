-- =====================================================================
-- gaRAN — Registre digital IMEI des téléphones
-- Migration 001 : schéma initial (PostgreSQL 15+ / Neon)
-- Idempotent : peut être ré-exécuté sans erreur.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Fonction utilitaire : mise à jour automatique de updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION garan_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Organisations : compte principal client (boutique unique ou grossiste)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  rccm                     text,
  email                    text,
  phone                    text NOT NULL,
  country                  text NOT NULL,
  city                     text NOT NULL,
  district                 text NOT NULL,
  status                   text NOT NULL DEFAULT 'trial'
                           CHECK (status IN ('trial','active','suspended','expired')),
  plan                     text NOT NULL DEFAULT 'standard',
  max_shops                integer NOT NULL DEFAULT 1 CHECK (max_shops >= 1),
  subscription_expires_at  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations (status);
CREATE INDEX IF NOT EXISTS organizations_name_idx ON organizations (lower(name));

-- ---------------------------------------------------------------------
-- Magasins (points de vente) rattachés à une organisation
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shops (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name             text NOT NULL,
  phone            text NOT NULL,
  email            text,
  rccm             text,
  country          text NOT NULL,
  city             text NOT NULL,
  district         text NOT NULL,
  address          text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shops_org_idx ON shops (organization_id);

-- ---------------------------------------------------------------------
-- Utilisateurs mobiles : owner (compte principal / superviseur) et agent (magasin)
-- Connexion : numéro de téléphone + code PIN à 4 chiffres (haché bcrypt)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  shop_id          uuid REFERENCES shops(id) ON DELETE RESTRICT,
  role             text NOT NULL CHECK (role IN ('owner','agent')),
  full_name        text NOT NULL,
  phone            text NOT NULL UNIQUE,
  pin_hash         text NOT NULL,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_agent_has_shop CHECK (role <> 'agent' OR shop_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS users_org_idx ON users (organization_id);
CREATE INDEX IF NOT EXISTS users_shop_idx ON users (shop_id);

-- ---------------------------------------------------------------------
-- Administrateurs du back-office promoteur (et accès forces de l'ordre)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  full_name      text NOT NULL,
  role           text NOT NULL CHECK (role IN ('superadmin','admin','support','police')),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Jetons de rafraîchissement (stockés hachés, rotation à chaque usage)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type  text NOT NULL CHECK (subject_type IN ('user','admin')),
  subject_id    uuid NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  user_agent    text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_subject_idx ON refresh_tokens (subject_type, subject_id);

-- ---------------------------------------------------------------------
-- Référentiel marques / modèles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS brands_name_uidx ON brands (lower(name));

CREATE TABLE IF NOT EXISTS models (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id      integer NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  release_year  integer,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS models_brand_name_uidx ON models (brand_id, lower(name));

-- ---------------------------------------------------------------------
-- Personnes physiques (acheteurs et vendeurs), identifiées par leur pièce
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS persons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,
  phone1              text NOT NULL,
  phone2              text NOT NULL,
  email               text,
  id_doc_type         text NOT NULL
                      CHECK (id_doc_type IN ('CNI','PASSPORT','PERMIS','ATTESTATION','CARTE_CONSULAIRE','CARTE_SEJOUR')),
  id_doc_number       text NOT NULL,
  id_doc_front_key    text,
  id_doc_back_key     text,
  created_by_shop_id  uuid REFERENCES shops(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS persons_doc_uidx ON persons (id_doc_type, upper(id_doc_number));
CREATE INDEX IF NOT EXISTS persons_phone1_idx ON persons (phone1);

-- ---------------------------------------------------------------------
-- Appareils, identifiés par IMEI (1 ou 2 pour les double SIM)
-- owner_type : none (inconnu), shop (en stock), person (vendu à un particulier)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imei1            char(15) NOT NULL UNIQUE CHECK (imei1 ~ '^[0-9]{15}$'),
  imei2            char(15) UNIQUE CHECK (imei2 IS NULL OR imei2 ~ '^[0-9]{15}$'),
  brand_id         integer REFERENCES brands(id),
  model_id         integer REFERENCES models(id),
  model_label      text,
  color            text,
  storage_gb       integer CHECK (storage_gb IS NULL OR storage_gb > 0),
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','stolen','lost','blocked')),
  owner_type       text NOT NULL DEFAULT 'none' CHECK (owner_type IN ('none','shop','person')),
  owner_shop_id    uuid REFERENCES shops(id),
  owner_person_id  uuid REFERENCES persons(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_imei_distinct CHECK (imei2 IS NULL OR imei2 <> imei1),
  CONSTRAINT devices_owner_consistency CHECK (
    (owner_type = 'none'   AND owner_shop_id IS NULL     AND owner_person_id IS NULL) OR
    (owner_type = 'shop'   AND owner_shop_id IS NOT NULL AND owner_person_id IS NULL) OR
    (owner_type = 'person' AND owner_person_id IS NOT NULL AND owner_shop_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS devices_owner_shop_idx ON devices (owner_shop_id) WHERE owner_shop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS devices_owner_person_idx ON devices (owner_person_id) WHERE owner_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices (status) WHERE status <> 'active';

-- Un IMEI ne peut figurer qu'une seule fois, que ce soit en imei1 ou en imei2
CREATE OR REPLACE FUNCTION garan_check_imei_cross_unique() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM devices d WHERE d.id <> NEW.id AND d.imei2 = NEW.imei1) THEN
    RAISE EXCEPTION 'IMEI % déjà enregistré', NEW.imei1 USING ERRCODE = '23505';
  END IF;
  IF NEW.imei2 IS NOT NULL AND EXISTS (SELECT 1 FROM devices d WHERE d.id <> NEW.id AND d.imei1 = NEW.imei2) THEN
    RAISE EXCEPTION 'IMEI % déjà enregistré', NEW.imei2 USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Transactions : registre immuable (append-only) des mouvements
-- stock_in : entrée en stock d'un téléphone neuf (fournisseur)
-- purchase : rachat à un particulier   |   sale : vente à un particulier
-- Montants en unités entières (FCFA / XOF n'a pas de décimales)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1000;

CREATE TABLE IF NOT EXISTS transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number     text NOT NULL UNIQUE,
  verification_code  text NOT NULL UNIQUE,
  type               text NOT NULL CHECK (type IN ('stock_in','purchase','sale')),
  device_id          uuid NOT NULL REFERENCES devices(id),
  organization_id    uuid NOT NULL REFERENCES organizations(id),
  shop_id            uuid NOT NULL REFERENCES shops(id),
  user_id            uuid NOT NULL REFERENCES users(id),
  person_id          uuid REFERENCES persons(id),
  condition          text NOT NULL CHECK (condition IN ('new','like_new','used')),
  price              bigint NOT NULL CHECK (price >= 0),
  currency           char(3) NOT NULL DEFAULT 'XOF',
  supplier_name      text,
  notes              text,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_person_required CHECK (type = 'stock_in' OR person_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS transactions_shop_time_idx   ON transactions (shop_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_org_time_idx    ON transactions (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_device_time_idx ON transactions (device_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_person_idx      ON transactions (person_id) WHERE person_id IS NOT NULL;

CREATE OR REPLACE FUNCTION garan_transactions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le registre des transactions est immuable (% interdit)', TG_OP;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Alertes de sécurité : tentative de rachat/vente d'un téléphone signalé,
-- ou vendeur différent du propriétaire enregistré
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN ('reported_device_attempt','ownership_mismatch')),
  device_id    uuid REFERENCES devices(id),
  imei         char(15) NOT NULL,
  shop_id      uuid REFERENCES shops(id),
  user_id      uuid REFERENCES users(id),
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','handled')),
  handled_by   uuid REFERENCES admins(id),
  handled_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_alerts_status_idx ON security_alerts (status, created_at DESC);

-- ---------------------------------------------------------------------
-- Déclarations de vol / perte
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS theft_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id             uuid REFERENCES devices(id),
  imei                  char(15) NOT NULL,
  kind                  text NOT NULL DEFAULT 'stolen' CHECK (kind IN ('stolen','lost')),
  reporter_name         text NOT NULL,
  reporter_phone        text NOT NULL,
  id_doc_type           text NOT NULL,
  id_doc_number         text NOT NULL,
  police_report_number  text,
  description           text,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','rejected','resolved')),
  auto_confirmed        boolean NOT NULL DEFAULT false,
  reviewed_by           uuid REFERENCES admins(id),
  reviewed_at           timestamptz,
  review_note           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS theft_reports_status_idx ON theft_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS theft_reports_imei_idx ON theft_reports (imei);

-- ---------------------------------------------------------------------
-- Paiements d'abonnement enregistrés par le promoteur
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id),
  amount           bigint NOT NULL CHECK (amount >= 0),
  months           integer NOT NULL CHECK (months BETWEEN 1 AND 36),
  method           text NOT NULL CHECK (method IN ('cash','mobile_money','bank','other')),
  reference        text,
  paid_at          timestamptz NOT NULL DEFAULT now(),
  recorded_by      uuid REFERENCES admins(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_payments_org_idx ON subscription_payments (organization_id, paid_at DESC);

-- ---------------------------------------------------------------------
-- Journal d'audit (qui a fait quoi, y compris consultation des pièces)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type  text NOT NULL CHECK (actor_type IN ('user','admin','public','system')),
  actor_id    uuid,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  ip          text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_time_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_type, actor_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Déclencheurs (recréés proprement pour rester idempotent)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS organizations_touch ON organizations;
CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
DROP TRIGGER IF EXISTS shops_touch ON shops;
CREATE TRIGGER shops_touch BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
DROP TRIGGER IF EXISTS users_touch ON users;
CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
DROP TRIGGER IF EXISTS admins_touch ON admins;
CREATE TRIGGER admins_touch BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
DROP TRIGGER IF EXISTS persons_touch ON persons;
CREATE TRIGGER persons_touch BEFORE UPDATE ON persons
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
DROP TRIGGER IF EXISTS devices_touch ON devices;
CREATE TRIGGER devices_touch BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION garan_touch_updated_at();
DROP TRIGGER IF EXISTS devices_imei_cross ON devices;
CREATE TRIGGER devices_imei_cross BEFORE INSERT OR UPDATE OF imei1, imei2 ON devices
  FOR EACH ROW EXECUTE FUNCTION garan_check_imei_cross_unique();
DROP TRIGGER IF EXISTS transactions_no_update ON transactions;
CREATE TRIGGER transactions_no_update BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION garan_transactions_immutable();
