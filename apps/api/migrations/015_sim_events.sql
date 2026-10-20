-- =====================================================================
-- gaRAN — Migration 015 : journal des cartes SIM vues par l'app
--   Permet au back-office de suivre les SIM connectées sur un appareil,
--   en particulier APRÈS une déclaration de vol (after_theft = true).
-- Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS sim_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id   uuid REFERENCES consumers(id),
  device_id     uuid REFERENCES devices(id),
  sim_id        text NOT NULL,
  phone_number  text,
  operator      text,
  ip            text,
  after_theft   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sim_events_device_idx   ON sim_events (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sim_events_consumer_idx ON sim_events (consumer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sim_events_theft_idx    ON sim_events (after_theft, created_at DESC);
