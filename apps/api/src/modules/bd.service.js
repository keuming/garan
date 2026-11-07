import crypto from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';

/* Barème des commissions Business Développeur (FCFA). */
export const BD_SETUP_CONSUMER_FCFA = 250; // usager parrainé : mise en service (une fois)
export const BD_SUBSCRIPTION_CONSUMER_FCFA = 25; // usager parrainé : par mois d'abonnement
export const BD_SETUP_MERCHANT_FCFA = 2000; // marchand parrainé : activation du compte (une fois)

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 (lisibilité)
function randomCode(n = 6) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

/* ------------------------------------------------------------------ */
/* Côté usager                                                         */
/* ------------------------------------------------------------------ */

/** Résout un code promo saisi à l'inscription : renvoie l'id du BD actif, sinon null. */
export async function resolvePromoCode(code) {
  if (!code || !String(code).trim()) return null;
  const { rows } = await query(
    `SELECT id FROM business_developers WHERE upper(promo_code) = upper($1) AND status = 'active'`,
    [String(code).trim()]
  );
  return rows[0]?.id ?? null;
}

/** Statut BD d'un usager (+ code promo + stats si actif), pour l'accueil. */
export async function bdSummary(consumerId) {
  const bd = (await query(`SELECT id, status, promo_code FROM business_developers WHERE consumer_id = $1`, [consumerId])).rows[0];
  if (!bd) return { status: 'none' };
  let stats = null;
  if (bd.status === 'active') {
    const s = (await query(
      `SELECT
         (SELECT count(*) FROM consumers WHERE referred_by_bd_id = $1)::int AS usagers,
         (SELECT count(*) FROM organizations WHERE referred_by_bd_id = $1)::int AS marchands,
         COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1), 0)::int AS total_fcfa,
         COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1 AND payout_id IS NULL), 0)::int AS due_fcfa`,
      [bd.id]
    )).rows[0];
    stats = s;
  }
  return { status: bd.status, promo_code: bd.promo_code, stats };
}

/** Demande à devenir BD. Prérequis : appareil actif + mise en service payée + abonnement en cours. */
export async function requestBecomeBD(consumerId) {
  const existing = (await query(`SELECT status FROM business_developers WHERE consumer_id = $1`, [consumerId])).rows[0];
  if (existing) {
    if (existing.status === 'rejected') {
      await query(`UPDATE business_developers SET status = 'pending', requested_at = now(), decided_at = NULL, decided_by = NULL WHERE consumer_id = $1`, [consumerId]);
      return { status: 'pending' };
    }
    return { status: existing.status, already: true };
  }
  const ok = (await query(
    `SELECT 1 FROM device_registrations
     WHERE consumer_id = $1 AND status = 'active' AND setup_paid_at IS NOT NULL
       AND subscription_expires_at IS NOT NULL AND subscription_expires_at > now()
     LIMIT 1`,
    [consumerId]
  )).rowCount;
  if (!ok) {
    throw badRequest('BD_PREREQ', "Pour devenir Business Développeur : enregistrez un téléphone, réglez sa mise en service et ayez un abonnement en cours.");
  }
  await query(`INSERT INTO business_developers (consumer_id, status) VALUES ($1, 'pending') ON CONFLICT (consumer_id) DO NOTHING`, [consumerId]);
  return { status: 'pending' };
}

/* ------------------------------------------------------------------ */
/* Crédit des commissions (appelé dans la transaction du paiement)     */
/* ------------------------------------------------------------------ */

async function activeBdId(c, column, id) {
  const r = (await c.query(`SELECT referred_by_bd_id FROM ${column === 'consumer' ? 'consumers' : 'organizations'} WHERE id = $1`, [id])).rows[0];
  const bdId = r?.referred_by_bd_id;
  if (!bdId) return null;
  const active = (await c.query(`SELECT 1 FROM business_developers WHERE id = $1 AND status = 'active'`, [bdId])).rowCount;
  return active ? bdId : null;
}

/** Commissions d'un usager parrainé : 250 à la 1re mise en service + 25 par mois d'abonnement. */
export async function creditConsumerReferral(c, { consumerId, firstSetup, months, source }) {
  const bdId = await activeBdId(c, 'consumer', consumerId);
  if (!bdId) return;
  if (firstSetup) {
    await c.query(
      `INSERT INTO bd_commissions (business_developer_id, referred_kind, referred_id, kind, amount_fcfa, source)
       VALUES ($1, 'consumer', $2, 'setup_consumer', $3, $4)
       ON CONFLICT (referred_kind, referred_id) WHERE kind IN ('setup_consumer', 'setup_merchant') DO NOTHING`,
      [bdId, consumerId, BD_SETUP_CONSUMER_FCFA, source ?? null]
    );
  }
  const m = Math.max(1, Number(months) || 1);
  await c.query(
    `INSERT INTO bd_commissions (business_developer_id, referred_kind, referred_id, kind, amount_fcfa, source)
     VALUES ($1, 'consumer', $2, 'subscription_consumer', $3, $4)`,
    [bdId, consumerId, BD_SUBSCRIPTION_CONSUMER_FCFA * m, source ?? null]
  );
}

/** Commission d'un marchand parrainé : 2000 à l'activation complète du compte (une fois). */
export async function creditMerchantReferral(c, { orgId, source }) {
  const bdId = await activeBdId(c, 'organization', orgId);
  if (!bdId) return;
  await c.query(
    `INSERT INTO bd_commissions (business_developer_id, referred_kind, referred_id, kind, amount_fcfa, source)
     VALUES ($1, 'organization', $2, 'setup_merchant', $3, $4)
     ON CONFLICT (referred_kind, referred_id) WHERE kind IN ('setup_consumer', 'setup_merchant') DO NOTHING`,
    [bdId, orgId, BD_SETUP_MERCHANT_FCFA, source ?? null]
  );
}

/* ------------------------------------------------------------------ */
/* Côté back-office                                                    */
/* ------------------------------------------------------------------ */

/** Liste des BD (filtrable par statut) avec le détail des gains. */
export async function listBusinessDevelopers(status = null) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE bd.status = $1`; }
  const { rows } = await query(
    `SELECT bd.id, bd.status, bd.promo_code, bd.requested_at, bd.decided_at,
            c.full_name, c.phone, c.email,
            (SELECT count(*) FROM consumers x WHERE x.referred_by_bd_id = bd.id)::int AS usagers,
            (SELECT count(*) FROM organizations o WHERE o.referred_by_bd_id = bd.id)::int AS marchands,
            COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions k WHERE k.business_developer_id = bd.id), 0)::int AS total_fcfa,
            COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions k WHERE k.business_developer_id = bd.id AND k.payout_id IS NULL), 0)::int AS due_fcfa,
            COALESCE((SELECT sum(amount_fcfa) FROM bd_payouts p WHERE p.business_developer_id = bd.id), 0)::int AS paid_fcfa
     FROM business_developers bd
     JOIN consumers c ON c.id = bd.consumer_id
     ${where}
     ORDER BY (bd.status = 'pending') DESC, bd.requested_at DESC`,
    params
  );
  return rows;
}

/** Détail d'un BD : identité, stats, filleuls récents, commissions récentes, reversements. */
export async function businessDeveloperDetail(bdId) {
  const bd = (await query(
    `SELECT bd.id, bd.status, bd.promo_code, bd.requested_at, bd.decided_at, c.id AS consumer_id, c.full_name, c.phone, c.email
     FROM business_developers bd JOIN consumers c ON c.id = bd.consumer_id WHERE bd.id = $1`,
    [bdId]
  )).rows[0];
  if (!bd) throw notFound('Business Développeur introuvable');
  const commissions = (await query(
    `SELECT kind, amount_fcfa, referred_kind, created_at, payout_id FROM bd_commissions
     WHERE business_developer_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [bdId]
  )).rows;
  const payouts = (await query(
    `SELECT amount_fcfa, method, reference, note, created_at FROM bd_payouts
     WHERE business_developer_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [bdId]
  )).rows;
  const totals = (await query(
    `SELECT
       COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1), 0)::int AS total_fcfa,
       COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1 AND payout_id IS NULL), 0)::int AS due_fcfa,
       COALESCE((SELECT sum(amount_fcfa) FROM bd_payouts WHERE business_developer_id = $1), 0)::int AS paid_fcfa,
       (SELECT count(*) FROM consumers WHERE referred_by_bd_id = $1)::int AS usagers,
       (SELECT count(*) FROM organizations WHERE referred_by_bd_id = $1)::int AS marchands`,
    [bdId]
  )).rows[0];
  return { ...bd, ...totals, commissions, payouts };
}

/** Valide une demande BD : génère un code promo unique et active le compte. */
export async function decideBusinessDeveloper(bdId, action, adminId) {
  const bd = (await query(`SELECT id, status, promo_code FROM business_developers WHERE id = $1`, [bdId])).rows[0];
  if (!bd) throw notFound('Demande introuvable');
  if (action === 'approve') {
    let code = bd.promo_code;
    if (!code) {
      for (let i = 0; i < 6; i++) {
        const candidate = randomCode(6);
        const taken = (await query(`SELECT 1 FROM business_developers WHERE promo_code = $1`, [candidate])).rowCount;
        if (!taken) { code = candidate; break; }
      }
      if (!code) throw badRequest('CODE_GEN', 'Génération du code promo impossible, réessayez.');
    }
    await query(`UPDATE business_developers SET status = 'active', promo_code = $2, decided_at = now(), decided_by = $3 WHERE id = $1`, [bdId, code, adminId ?? null]);
    return { status: 'active', promo_code: code };
  }
  const next = action === 'reject' ? 'rejected' : action === 'suspend' ? 'suspended' : action === 'reactivate' ? 'active' : null;
  if (!next) throw badRequest('BD_ACTION', 'Action invalide.');
  await query(`UPDATE business_developers SET status = $2, decided_at = now(), decided_by = $3 WHERE id = $1`, [bdId, next, adminId ?? null]);
  return { status: next };
}

/** Enregistre un reversement : solde tout le dû du BD et marque les commissions concernées. */
export async function recordPayout(bdId, { method, reference, note }, adminId) {
  return withTransaction(async (c) => {
    const due = (await c.query(
      `SELECT COALESCE(sum(amount_fcfa), 0)::int AS due FROM bd_commissions WHERE business_developer_id = $1 AND payout_id IS NULL`,
      [bdId]
    )).rows[0].due;
    if (due <= 0) throw badRequest('NO_DUE', 'Aucun montant dû à reverser pour ce Business Développeur.');
    const payout = (await c.query(
      `INSERT INTO bd_payouts (business_developer_id, amount_fcfa, method, reference, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [bdId, due, method ?? null, reference ?? null, note ?? null, adminId ?? null]
    )).rows[0];
    await c.query(`UPDATE bd_commissions SET payout_id = $2 WHERE business_developer_id = $1 AND payout_id IS NULL`, [bdId, payout.id]);
    return { payout_id: payout.id, amount_fcfa: due };
  });
}
