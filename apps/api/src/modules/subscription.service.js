import crypto from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { notFound } from '../lib/errors.js';
import { createPaymentLink, getPaymentLink, getOperation, opStatus } from '../lib/orzayah.js';
import { logger } from '../logger.js';

/* Tarifs d'abonnement en FCFA. PLAN_FCFA = abonnement mensuel ; SETUP_FCFA = mise en service
   (activation du compte + propagation sur le réseau), facturée une seule fois à la 1re souscription.
   1re souscription : mise en service + 1 mois (usager 1000 + 125 = 1125 ; marchand 10000 + 1000 = 11000).
   Renouvellements : mensuel uniquement. */
export const PLAN_FCFA = { organization: 1000, consumer: 125 };
export const SETUP_FCFA = { organization: 10000, consumer: 1000 };

/** Devis d'abonnement pour un sujet : applique la mise en service si c'est sa 1re souscription. */
export async function subscriptionQuote({ subjectType, subjectId, months = 1 }) {
  const table = subjectType === 'organization' ? 'organizations' : 'consumers';
  const { rows } = await query(`SELECT subscription_expires_at FROM ${table} WHERE id = $1`, [subjectId]);
  const isFirst = !rows[0]?.subscription_expires_at;
  const monthFcfa = PLAN_FCFA[subjectType];
  const setupFcfa = isFirst ? SETUP_FCFA[subjectType] : 0;
  const amountDueFcfa = setupFcfa + monthFcfa * months;
  return { month_fcfa: monthFcfa, setup_fcfa: SETUP_FCFA[subjectType], is_first: isFirst, months, amount_due_fcfa: amountDueFcfa, currency: 'XOF', period: 'month' };
}

/* Page de collecte ORZAYAH (pay.orzayah.com) : le payeur choisit Mobile Money ou carte. */
const PAY_BASE = (process.env.ORZAYAH_PAY_BASE ?? 'https://pay.orzayah.com/p').replace(/\/$/, '');
const payUrl = (slug) => `${PAY_BASE}/${encodeURIComponent(slug)}`;

/**
 * Initie l'encaissement d'un abonnement par LIEN de collecte ORZAYAH (pay.orzayah.com).
 * Le payeur est redirigé vers la page sécurisée et choisit lui-même son moyen de paiement :
 * aucun opérateur ni numéro n'est demandé dans l'app. Crée la trace et renvoie l'URL de paiement.
 */
export async function initiateSubscription({ subjectType, subjectId, months = 1 }) {
  const quote = await subscriptionQuote({ subjectType, subjectId, months });
  const amountFcfa = quote.amount_due_fcfa;
  const amountCentimes = amountFcfa * 100;
  const purpose = subjectType === 'organization' ? 'subscription_merchant' : 'subscription_consumer';
  const idempotencyKey = `sub-${subjectType.slice(0, 4)}-${crypto.randomUUID()}`;
  const label = subjectType === 'organization' ? 'Abonnement marchand gaRAN' : 'Abonnement gaRAN';
  const description = quote.is_first ? `${label} — mise en service + ${months} mois` : `${label} — ${months} mois`;

  const { rows } = await query(
    `INSERT INTO orzayah_payments (idempotency_key, purpose, subject_type, subject_id, amount, months, operator, status)
     VALUES ($1,$2,$3,$4,$5,$6,'LINK','INITIATED') RETURNING id`,
    [idempotencyKey, purpose, subjectType, subjectId, amountCentimes, months]
  );
  const paymentId = rows[0].id;

  try {
    const link = await createPaymentLink({ amount: amountCentimes, description, idempotencyKey });
    const url = link.url ?? payUrl(link.slug);
    await query(`UPDATE orzayah_payments SET reference = $2, status = 'PENDING' WHERE id = $1`, [paymentId, link.slug]);
    return {
      payment_id: paymentId,
      status: 'PENDING',
      amount_fcfa: amountFcfa,
      months,
      is_first: quote.is_first,
      payment_url: url,
      next_action: { type: 'REDIRECT', url }
    };
  } catch (err) {
    await query(`UPDATE orzayah_payments SET status = 'FAILED', failure_reason = $2 WHERE id = $1`, [paymentId, err.message?.slice(0, 500) ?? 'erreur']).catch(() => {});
    throw err;
  }
}

async function applySubscription(c, row) {
  const months = row.months || 1;
  if (row.subject_type === 'organization') {
    const { rows } = await c.query(
      `UPDATE organizations
       SET subscription_expires_at = GREATEST(now(), COALESCE(subscription_expires_at, now())) + ($2 || ' months')::interval,
           status = 'active'
       WHERE id = $1 RETURNING subscription_expires_at`,
      [row.subject_id, months]
    );
    await c.query(
      `INSERT INTO subscription_payments (organization_id, amount, months, method, reference)
       VALUES ($1, $2, $3, 'mobile_money', $4)`,
      [row.subject_id, Math.round(Number(row.amount) / 100), months, row.reference ?? row.idempotency_key]
    );
    return rows[0].subscription_expires_at;
  }
  const { rows } = await c.query(
    `UPDATE consumers
     SET subscription_expires_at = GREATEST(now(), COALESCE(subscription_expires_at, now())) + ($2 || ' months')::interval
     WHERE id = $1 RETURNING subscription_expires_at`,
    [row.subject_id, months]
  );
  return rows[0].subscription_expires_at;
}

/**
 * Relit le statut d'un paiement auprès d'ORZAYAH et, au succès, crédite l'abonnement
 * une seule fois (idempotent). Renvoie { status, applied, expires_at }.
 */
export async function pollSubscription(paymentId, { subjectType, subjectId }) {
  const row = (
    await query(
      `SELECT * FROM orzayah_payments WHERE id = $1 AND subject_type = $2 AND subject_id = $3`,
      [paymentId, subjectType, subjectId]
    )
  ).rows[0];
  if (!row) throw notFound('Paiement introuvable');
  if (row.applied) return { status: 'SUCCESS', applied: true, expires_at: null };

  let op;
  try {
    op = row.operator === 'LINK'
      ? await getPaymentLink(row.reference ?? row.idempotency_key)
      : await getOperation(row.reference ?? row.idempotency_key);
  } catch (err) {
    logger.warn({ err: err.message, paymentId }, 'ORZAYAH : relecture du statut impossible');
    return { status: row.status, applied: false, expires_at: null, pending: true };
  }
  const status = opStatus(op) ?? row.status;
  await query(`UPDATE orzayah_payments SET status = $2, failure_reason = $3 WHERE id = $1`, [paymentId, status, op.failureReason ?? op.failure_reason ?? null]);

  if (status !== 'SUCCESS') return { status, applied: false, expires_at: null };

  const expires = await withTransaction(async (c) => {
    const locked = (await c.query(`SELECT applied, subject_type, subject_id, months, amount, reference, idempotency_key FROM orzayah_payments WHERE id = $1 FOR UPDATE`, [paymentId])).rows[0];
    if (locked.applied) return null;
    const exp = await applySubscription(c, locked);
    await c.query(`UPDATE orzayah_payments SET applied = true WHERE id = $1`, [paymentId]);
    return exp;
  });
  return { status: 'SUCCESS', applied: true, expires_at: expires };
}

/* ------------------------------------------------------------------------- */
/* Rattrapage des paiements en attente                                         */
/* ------------------------------------------------------------------------- */

const SUB_PURPOSES = ['subscription_merchant', 'subscription_consumer'];
const SYNC_THROTTLE_MS = 15000;
const lastSync = new Map();

/**
 * Relit auprès d'ORZAYAH les paiements d'abonnement encore en attente d'un compte et crédite
 * l'abonnement s'ils sont payés (idempotent, via pollSubscription). Sert quand l'application a été
 * fermée pendant le paiement : le suivi côté écran est alors perdu, mais la trace reste en base.
 * Limité à 5 paiements récents (10 jours) ; appels ORZAYAH en parallèle avec une échéance globale.
 * Renvoie { checked, applied, expires_at }.
 */
export async function syncSubscriptions({ subjectType, subjectId, force = false, deadlineMs = 8000 }) {
  const key = `${subjectType}:${subjectId}`;
  const now = Date.now();
  if (!force && now - (lastSync.get(key) ?? 0) < SYNC_THROTTLE_MS) return { checked: 0, applied: false, expires_at: null, throttled: true };
  if (lastSync.size > 5000) lastSync.clear();
  lastSync.set(key, now);

  const { rows } = await query(
    `SELECT p.id FROM orzayah_payments p
     WHERE p.subject_type = $1 AND p.subject_id = $2
       AND p.purpose = ANY($3::text[])
       AND p.applied IS NOT TRUE
       AND (p.status NOT IN ('SUCCESS','FAILED','CANCELLED','EXPIRED','REFUNDED') OR p.status = 'SUCCESS')
       AND COALESCE((to_jsonb(p)->>'created_at')::timestamptz, now()) > now() - interval '10 days'
     ORDER BY (to_jsonb(p)->>'created_at') DESC NULLS LAST
     LIMIT 5`,
    [subjectType, subjectId, SUB_PURPOSES]
  );
  if (!rows.length) return { checked: 0, applied: false, expires_at: null };

  const results = await Promise.race([
    Promise.allSettled(rows.map((r) => pollSubscription(r.id, { subjectType, subjectId }))),
    new Promise((resolve) => setTimeout(() => resolve(null), deadlineMs))
  ]);
  if (!results) {
    logger.warn({ subjectType, subjectId, checked: rows.length }, 'Abonnement : relecture ORZAYAH trop lente (échéance atteinte)');
    return { checked: rows.length, applied: false, expires_at: null, timeout: true };
  }
  let applied = false;
  let expiresAt = null;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.applied) {
      applied = true;
      expiresAt = r.value.expires_at ?? expiresAt;
    } else if (r.status === 'rejected') {
      logger.warn({ err: r.reason?.message, subjectType, subjectId }, 'Abonnement : relecture d’un paiement impossible');
    }
  }
  return { checked: rows.length, applied, expires_at: expiresAt };
}
