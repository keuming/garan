-- =====================================================================
-- Migration 022 — Reversements à la demande du Business Développeur
-- Le BD peut : rattacher son compte ORZAYAH (gestion autonome de ses gains)
-- et demander le reversement de son dû (Mobile Money ou vers son compte ORZAYAH).
-- Idempotente : réexécutable sans risque.
-- =====================================================================

-- Compte ORZAYAH rattaché + dernier numéro Mobile Money utilisé.
ALTER TABLE business_developers ADD COLUMN IF NOT EXISTS orzayah_account text;
ALTER TABLE business_developers ADD COLUMN IF NOT EXISTS payout_mobile_money text;

-- Demandes de reversement émises par le BD, traitées ensuite par le back-office.
CREATE TABLE IF NOT EXISTS bd_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_developer_id uuid NOT NULL REFERENCES business_developers(id) ON DELETE CASCADE,
  amount_fcfa integer NOT NULL,
  method text NOT NULL DEFAULT 'mobile_money' CHECK (method IN ('mobile_money', 'orzayah')),
  mobile_money_number text,
  orzayah_account text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  payout_id uuid REFERENCES bd_payouts(id),
  note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);
CREATE INDEX IF NOT EXISTS bd_payout_requests_bd_idx ON bd_payout_requests (business_developer_id, requested_at DESC);
-- Une seule demande en attente par BD à la fois.
CREATE UNIQUE INDEX IF NOT EXISTS bd_payout_requests_one_pending
  ON bd_payout_requests (business_developer_id) WHERE status = 'pending';
