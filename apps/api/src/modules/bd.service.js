import crypto from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { config } from '../config.js';

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

/** Soldes d'un BD, ventilés usager / marchand (gagné, dû, reversé). */
async function bdBalances(bdId) {
  const s = (await query(
    `SELECT
       (SELECT count(*) FROM consumers WHERE referred_by_bd_id = $1)::int AS usagers,
       (SELECT count(*) FROM organizations WHERE referred_by_bd_id = $1)::int AS marchands,
       COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1), 0)::int AS total_fcfa,
       COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1 AND payout_id IS NULL), 0)::int AS due_fcfa,
       COALESCE((SELECT sum(amount_fcfa) FROM bd_payouts WHERE business_developer_id = $1), 0)::int AS paid_fcfa,
       -- Gains « usager » (mise en service + abonnements des usagers parrainés)
       COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1 AND referred_kind = 'consumer'), 0)::int AS consumer_total_fcfa,
       COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1 AND referred_kind = 'consumer' AND payout_id IS NULL), 0)::int AS consumer_due_fcfa,
       -- Gains « marchand »
       COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1 AND referred_kind = 'organization'), 0)::int AS merchant_total_fcfa,
       COALESCE((SELECT sum(amount_fcfa) FROM bd_commissions WHERE business_developer_id = $1 AND referred_kind = 'organization' AND payout_id IS NULL), 0)::int AS merchant_due_fcfa`,
    [bdId]
  )).rows[0];
  return s;
}

/** Statut BD d'un usager (+ code promo, soldes ventilés, compte ORZAYAH, demande en cours), pour l'accueil. */
export async function bdSummary(consumerId) {
  const bd = (await query(
    `SELECT id, status, promo_code, orzayah_account FROM business_developers WHERE consumer_id = $1`,
    [consumerId]
  )).rows[0];
  if (!bd) return { status: 'none', orzayah_signup_url: config.ORZAYAH_SIGNUP_URL };
  let stats = null;
  let pendingRequest = null;
  if (bd.status === 'active') {
    stats = await bdBalances(bd.id);
    pendingRequest = (await query(
      `SELECT id, amount_fcfa, method, mobile_money_number, requested_at FROM bd_payout_requests
       WHERE business_developer_id = $1 AND status = 'pending' ORDER BY requested_at DESC LIMIT 1`,
      [bd.id]
    )).rows[0] ?? null;
  }
  return {
    status: bd.status,
    promo_code: bd.promo_code,
    orzayah_account: bd.orzayah_account ?? null,
    orzayah_signup_url: config.ORZAYAH_SIGNUP_URL,
    pending_request: pendingRequest,
    stats
  };
}

/** Tableau de bord complet du BD (soldes + historique des gains + reversements). */
export async function bdDashboard(consumerId) {
  const bd = (await query(
    `SELECT id, status, promo_code, orzayah_account, payout_mobile_money FROM business_developers WHERE consumer_id = $1`,
    [consumerId]
  )).rows[0];
  if (!bd) throw notFound('Vous n’êtes pas Business Développeur.');
  if (bd.status !== 'active') return { status: bd.status, promo_code: bd.promo_code, orzayah_signup_url: config.ORZAYAH_SIGNUP_URL };
  const stats = await bdBalances(bd.id);
  const commissions = (await query(
    `SELECT id, kind, referred_kind, amount_fcfa, created_at, payout_id FROM bd_commissions
     WHERE business_developer_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [bd.id]
  )).rows;
  const payouts = (await query(
    `SELECT amount_fcfa, method, reference, created_at FROM bd_payouts
     WHERE business_developer_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [bd.id]
  )).rows;
  const requests = (await query(
    `SELECT id, amount_fcfa, method, mobile_money_number, status, requested_at, decided_at FROM bd_payout_requests
     WHERE business_developer_id = $1 ORDER BY requested_at DESC LIMIT 20`,
    [bd.id]
  )).rows;
  return {
    status: bd.status,
    promo_code: bd.promo_code,
    orzayah_account: bd.orzayah_account ?? null,
    payout_mobile_money: bd.payout_mobile_money ?? null,
    orzayah_signup_url: config.ORZAYAH_SIGNUP_URL,
    stats,
    pending_request: requests.find((r) => r.status === 'pending') ?? null,
    commissions,
    payouts,
    requests
  };
}

/** Rattache (ou met à jour) le compte ORZAYAH du BD pour gérer ses gains de façon autonome. */
export async function setBdOrzayahAccount(consumerId, { orzayah_account }) {
  const bd = (await query(`SELECT id FROM business_developers WHERE consumer_id = $1 AND status = 'active'`, [consumerId])).rows[0];
  if (!bd) throw badRequest('BD_INACTIVE', 'Compte Business Développeur introuvable ou inactif.');
  const value = (orzayah_account ?? '').trim() || null;
  await query(`UPDATE business_developers SET orzayah_account = $2 WHERE id = $1`, [bd.id, value]);
  return { orzayah_account: value };
}

/** Le BD demande le reversement de son dû (Mobile Money ou vers son compte ORZAYAH). */
export async function requestBdPayout(consumerId, { method = 'mobile_money', mobile_money_number = null }) {
  const bd = (await query(`SELECT id, orzayah_account FROM business_developers WHERE consumer_id = $1 AND status = 'active'`, [consumerId])).rows[0];
  if (!bd) throw badRequest('BD_INACTIVE', 'Compte Business Développeur introuvable ou inactif.');
  const m = method === 'orzayah' ? 'orzayah' : 'mobile_money';
  const momo = (mobile_money_number ?? '').trim() || null;
  if (m === 'mobile_money' && !momo) throw badRequest('MOMO_REQUIRED', 'Indiquez le numéro Mobile Money à créditer.');
  if (m === 'orzayah' && !bd.orzayah_account) throw badRequest('ORZAYAH_REQUIRED', 'Rattachez d’abord votre compte ORZAYAH.');
  return withTransaction(async (c) => {
    const pending = (await c.query(`SELECT 1 FROM bd_payout_requests WHERE business_developer_id = $1 AND status = 'pending'`, [bd.id])).rowCount;
    if (pending) throw badRequest('REQUEST_PENDING', 'Une demande de reversement est déjà en cours de traitement.');
    const due = (await c.query(
      `SELECT COALESCE(sum(amount_fcfa), 0)::int AS due FROM bd_commissions WHERE business_developer_id = $1 AND payout_id IS NULL`,
      [bd.id]
    )).rows[0].due;
    if (due <= 0) throw badRequest('NO_DUE', 'Aucun montant disponible à reverser pour le moment.');
    const row = (await c.query(
      `INSERT INTO bd_payout_requests (business_developer_id, amount_fcfa, method, mobile_money_number, orzayah_account)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, amount_fcfa, method, mobile_money_number, status, requested_at`,
      [bd.id, due, m, momo, m === 'orzayah' ? bd.orzayah_account : null]
    )).rows[0];
    if (momo) await c.query(`UPDATE business_developers SET payout_mobile_money = $2 WHERE id = $1`, [bd.id, momo]);
    return row;
  });
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
/**
 * Crédite les commissions BD liées à un usager parrainé.
 * - setup=true : commission « mise en service » (une seule fois, à la mise en service complète).
 * - months>0  : commission « abonnement » proportionnelle aux mois réglés.
 * Les deux natures sont désormais indépendantes (mise en service et abonnement payés séparément).
 */
export async function creditConsumerReferral(c, { consumerId, setup = false, months = 0, source }) {
  const bdId = await activeBdId(c, 'consumer', consumerId);
  if (!bdId) return;
  if (setup) {
    await c.query(
      `INSERT INTO bd_commissions (business_developer_id, referred_kind, referred_id, kind, amount_fcfa, source)
       VALUES ($1, 'consumer', $2, 'setup_consumer', $3, $4)
       ON CONFLICT (referred_kind, referred_id) WHERE kind IN ('setup_consumer', 'setup_merchant') DO NOTHING`,
      [bdId, consumerId, BD_SETUP_CONSUMER_FCFA, source ?? null]
    );
  }
  const m = Number(months) || 0;
  if (m > 0) {
    await c.query(
      `INSERT INTO bd_commissions (business_developer_id, referred_kind, referred_id, kind, amount_fcfa, source)
       VALUES ($1, 'consumer', $2, 'subscription_consumer', $3, $4)`,
      [bdId, consumerId, BD_SUBSCRIPTION_CONSUMER_FCFA * m, source ?? null]
    );
  }
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
  const payoutRequests = (await query(
    `SELECT id, amount_fcfa, method, mobile_money_number, orzayah_account, status, requested_at, decided_at FROM bd_payout_requests
     WHERE business_developer_id = $1 ORDER BY requested_at DESC LIMIT 20`,
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
  return { ...bd, ...totals, commissions, payouts, payout_requests: payoutRequests };
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
    // Clôture une éventuelle demande de reversement en attente.
    await c.query(
      `UPDATE bd_payout_requests SET status = 'paid', payout_id = $2, decided_at = now(), decided_by = $3
       WHERE business_developer_id = $1 AND status = 'pending'`,
      [bdId, payout.id, adminId ?? null]
    );
    return { payout_id: payout.id, amount_fcfa: due };
  });
}

/** Liste des demandes de reversement émises par les BD (filtrables par statut). */
export async function listPayoutRequests(status = 'pending') {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE r.status = $1`; }
  const { rows } = await query(
    `SELECT r.id, r.amount_fcfa, r.method, r.mobile_money_number, r.orzayah_account, r.status,
            r.requested_at, r.decided_at, bd.id AS business_developer_id, bd.promo_code,
            c.full_name, c.phone
     FROM bd_payout_requests r
     JOIN business_developers bd ON bd.id = r.business_developer_id
     JOIN consumers c ON c.id = bd.consumer_id
     ${where}
     ORDER BY (r.status = 'pending') DESC, r.requested_at DESC
     LIMIT 200`,
    params
  );
  return rows;
}

/** Traite une demande de reversement : 'pay' solde le dû (enregistre le reversement), 'reject' la refuse. */
export async function decidePayoutRequest(requestId, action, { method, reference, note }, adminId) {
  const reqRow = (await query(`SELECT business_developer_id, status, method, mobile_money_number FROM bd_payout_requests WHERE id = $1`, [requestId])).rows[0];
  if (!reqRow) throw notFound('Demande de reversement introuvable');
  if (reqRow.status !== 'pending') throw badRequest('REQUEST_DONE', 'Cette demande a déjà été traitée.');
  if (action === 'reject') {
    await query(`UPDATE bd_payout_requests SET status = 'rejected', decided_at = now(), decided_by = $2, note = $3 WHERE id = $1`, [requestId, adminId ?? null, note ?? null]);
    return { status: 'rejected' };
  }
  if (action !== 'pay') throw badRequest('REQUEST_ACTION', 'Action invalide.');
  // Enregistre le reversement (solde tout le dû) ; recordPayout clôture la demande en attente.
  const payMethod = method ?? reqRow.method ?? 'mobile_money';
  const payRef = reference ?? reqRow.mobile_money_number ?? null;
  const r = await recordPayout(reqRow.business_developer_id, { method: payMethod, reference: payRef, note }, adminId);
  return { status: 'paid', ...r };
}
