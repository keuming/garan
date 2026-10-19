-- =====================================================================
-- Migration 010 — Encaissement ORZAYAH des ventes (lien de paiement par vente)
-- Idempotente : réexécutable sans risque.
-- Le registre des transactions est immuable : l'état de paiement d'une vente
-- vit dans orzayah_payments (purpose = 'sale'), rattaché à la transaction.
-- =====================================================================
ALTER TABLE orzayah_payments ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES transactions(id);
CREATE INDEX IF NOT EXISTS orzayah_payments_tx_idx ON orzayah_payments (transaction_id) WHERE transaction_id IS NOT NULL;

-- Ventes ORZAYAH déjà enregistrées avant cette migration : considérées comme payées.
INSERT INTO orzayah_payments (idempotency_key, purpose, subject_type, subject_id, amount, operator, status, applied, transaction_id)
SELECT 'legacy-sale-' || t.id, 'sale', 'organization', t.organization_id, t.price * 100, 'LEGACY', 'SUCCESS', true, t.id
FROM transactions t
WHERE t.type = 'sale' AND t.payment_method = 'orzayah'
ON CONFLICT (idempotency_key) DO NOTHING;
