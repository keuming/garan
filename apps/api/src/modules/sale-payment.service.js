import crypto from 'node:crypto';
import { query } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { createPaymentLink, getPaymentLink, opStatus } from '../lib/orzayah.js';
import { unseal } from '../lib/secret-box.js';
import { logger } from '../logger.js';

const PAY_BASE = (process.env.ORZAYAH_PAY_BASE ?? 'https://pay.orzayah.com/p').replace(/\/$/, '');
const payUrl = (slug) => `${PAY_BASE}/${encodeURIComponent(slug)}`;
const FINAL_FAIL = ['FAILED', 'CANCELLED', 'EXPIRED'];

/**
 * État d'encaissement d'une vente.
 * - espèces : payé d'office ;
 * - ORZAYAH : payé quand le lien de paiement est confirmé (orzayah_payments.applied).
 * status : paid | unpaid (aucun lien) | pending (lien émis) | failed.
 */
export async function salePaymentView(tx) {
  const method = tx.payment_method ?? 'cash';
  if (tx.type !== 'sale' || method !== 'orzayah') return { method, status: 'paid', paid: true, payment_url: null };
  const row = (
    await query(
      `SELECT id, status, applied, reference, operator, failure_reason FROM orzayah_payments
       WHERE transaction_id = $1 AND purpose = 'sale' ORDER BY created_at DESC LIMIT 1`,
      [tx.id]
    )
  ).rows[0];
  if (!row) return { method, status: 'unpaid', paid: false, payment_url: null };
  if (row.applied) return { method, status: 'paid', paid: true, payment_url: null };
  if (FINAL_FAIL.includes(row.status)) return { method, status: 'failed', paid: false, payment_url: null, failure_reason: row.failure_reason };
  return { method, status: 'pending', paid: false, payment_id: row.id, payment_url: row.operator === 'LINK' && row.reference ? payUrl(row.reference) : null };
}

/** Clé API ORZAYAH du marchand : les paiements arrivent directement dans son portefeuille. */
async function merchantApiKey(orgId) {
  const row = (await query(`SELECT orzayah_api_key_enc FROM organizations WHERE id = $1`, [orgId])).rows[0];
  if (!row?.orzayah_api_key_enc) {
    throw badRequest('ORZAYAH_NOT_LINKED', 'Reliez d’abord votre compte ORZAYAH (Mon compte) pour encaisser par ORZAYAH.');
  }
  try {
    return unseal(row.orzayah_api_key_enc);
  } catch {
    throw badRequest('ORZAYAH_KEY_UNREADABLE', 'Votre clé ORZAYAH doit être saisie à nouveau (Mon compte).');
  }
}

/** Émet (ou renvoie) le lien de paiement ORZAYAH d'une vente. */
export async function startSalePayment(tx) {
  if (tx.type !== 'sale' || tx.payment_method !== 'orzayah') {
    throw badRequest('NOT_ORZAYAH_SALE', 'Cette vente n’est pas à encaisser par ORZAYAH');
  }
  const current = await salePaymentView(tx);
  if (current.status === 'paid' || (current.status === 'pending' && current.payment_url)) return current;

  const apiKey = await merchantApiKey(tx.organization_id);
  const amountFcfa = Number(tx.price);
  if (!Number.isFinite(amountFcfa) || amountFcfa <= 0) throw badRequest('INVALID_AMOUNT', 'Montant de vente nul : rien à encaisser');
  const idempotencyKey = `sale-${tx.id}-${crypto.randomUUID().slice(0, 8)}`;
  const ins = await query(
    `INSERT INTO orzayah_payments (idempotency_key, purpose, subject_type, subject_id, amount, operator, status, transaction_id)
     VALUES ($1, 'sale', 'organization', $2, $3, 'LINK', 'INITIATED', $4) RETURNING id`,
    [idempotencyKey, tx.organization_id, amountFcfa * 100, tx.id]
  );
  const paymentId = ins.rows[0].id;
  try {
    const link = await createPaymentLink({
      amount: amountFcfa * 100,
      description: `Vente ${tx.receipt_number}`.slice(0, 120),
      idempotencyKey
    }, { apiKey });
    await query(`UPDATE orzayah_payments SET reference = $2, status = 'PENDING' WHERE id = $1`, [paymentId, link.slug]);
    return { method: 'orzayah', status: 'pending', paid: false, payment_id: paymentId, payment_url: link.url ?? payUrl(link.slug) };
  } catch (err) {
    await query(`UPDATE orzayah_payments SET status = 'FAILED', failure_reason = $2 WHERE id = $1`, [paymentId, String(err.message ?? 'erreur').slice(0, 500)]).catch(() => {});
    throw err;
  }
}

/** Relit le lien chez ORZAYAH et marque la vente comme payée dès la confirmation. */
export async function pollSalePayment(tx) {
  const view = await salePaymentView(tx);
  if (view.status !== 'pending' || !view.payment_id) return view;
  const row = (await query(`SELECT reference FROM orzayah_payments WHERE id = $1`, [view.payment_id])).rows[0];
  try {
    const op = await getPaymentLink(row.reference, { apiKey: await merchantApiKey(tx.organization_id) });
    const status = opStatus(op) ?? 'PENDING';
    await query(
      `UPDATE orzayah_payments SET status = $2, failure_reason = $3, applied = (applied OR $2 = 'SUCCESS') WHERE id = $1`,
      [view.payment_id, status, op.failureReason ?? op.transaction?.failureReason ?? op.failure_reason ?? null]
    );
  } catch (err) {
    logger.warn({ err: err.message, saleId: tx.id }, 'ORZAYAH : relecture du paiement de vente impossible');
    return view;
  }
  return salePaymentView(tx);
}
