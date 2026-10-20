-- =====================================================================
-- gaRAN — Migration 014 : demandes de blocage opérateur (IMEI)
-- gaRAN prépare et suit la demande ; le blocage réseau reste réalisé par
-- les opérateurs / l'ARTCI. Statuts : requested → transmitted → blocked | rejected.
-- Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS block_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id             uuid REFERENCES devices(id),
  theft_report_id       uuid REFERENCES theft_reports(id),
  imei                  char(15) NOT NULL,
  imei2                 char(15),
  brand_label           text,
  model_label           text,
  owner_name            text,
  owner_phone           text,
  police_report_number  text,
  status                text NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested', 'transmitted', 'blocked', 'rejected')),
  operator              text,
  operator_reference    text,
  note                  text,
  created_by            uuid REFERENCES admins(id),
  transmitted_at        timestamptz,
  blocked_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS block_requests_status_idx ON block_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS block_requests_imei_idx ON block_requests (imei);
-- Une seule demande "ouverte" par appareil (évite les doublons à la confirmation d'un vol).
CREATE UNIQUE INDEX IF NOT EXISTS block_requests_open_device_uidx
  ON block_requests (device_id) WHERE status IN ('requested', 'transmitted');
