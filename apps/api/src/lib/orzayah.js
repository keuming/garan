import { config } from '../config.js';
import { AppError } from './errors.js';
import { logger } from '../logger.js';

/**
 * Client de l'API ORZAYAH (paiement digital).
 * Contrat : base https://api.orzayah.com/api/public/v1, en-tête X-Api-Key,
 * montants en CENTIMES (1 FCFA = 100), réponses { success, data } / { success, error }.
 * La clé donne accès à de l'argent réel : elle reste côté serveur (variable Render).
 */

export const OPERATORS = ['ORANGE', 'MTN', 'MOOV', 'WAVE'];

const base = () => config.ORZAYAH_API_URL.replace(/\/$/, '');
export const orzayahEnabled = () => Boolean(config.ORZAYAH_API_URL && config.ORZAYAH_API_KEY);

export const toCentimes = (fcfa) => Math.round(Number(fcfa || 0) * 100);
export const fromCentimes = (c) => Math.round(Number(c || 0) / 100);

const FINAL = new Set(['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED']);
export const isFinal = (s) => FINAL.has(s);
export const isSuccess = (s) => s === 'SUCCESS';

async function oz(path, { method = 'GET', body } = {}) {
  if (!orzayahEnabled()) {
    throw new AppError(503, 'ORZAYAH_NOT_CONFIGURED', 'Le paiement ORZAYAH n’est pas encore activé (clé API manquante).');
  }
  let res;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { 'X-Api-Key': config.ORZAYAH_API_KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000)
    });
  } catch (err) {
    logger.warn({ err: err.message, path }, 'ORZAYAH injoignable');
    throw new AppError(502, 'ORZAYAH_UNREACHABLE', 'Service de paiement ORZAYAH indisponible. Réessayez dans un instant.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const message = json.error?.message ?? `Erreur ORZAYAH (${res.status})`;
    logger.warn({ status: res.status, message, path }, 'Erreur ORZAYAH');
    throw new AppError(res.status === 409 ? 409 : 400, 'ORZAYAH_ERROR', message);
  }
  return json.data;
}

/** Encaisse : débite un compte Mobile Money vers le compte gaRAN (le payeur confirme sur son téléphone). */
export const createDeposit = ({ operator, accountNumber, amount, idempotencyKey }) =>
  oz('/deposits', { method: 'POST', body: { operator, accountNumber, amount, idempotencyKey } });

/** Reverse : paie un marchand ORZAYAH depuis le solde gaRAN. */
export const createMerchantPayment = ({ merchantId, amount, description, idempotencyKey }) =>
  oz('/merchant-payments', { method: 'POST', body: { merchantId, amount, description, idempotencyKey } });

/** Statut d'une opération (id ORZAYAH, référence publique ou idempotencyKey). */
export const getOperation = (ref) => oz(`/transactions/${encodeURIComponent(ref)}`);

/** Solde du compte partenaire gaRAN. */
export async function getBalance() {
  const b = await oz('/balance');
  return { currency: b.currency ?? 'XOF', balance: fromCentimes(b.balance), balance_centimes: b.balance, is_frozen: Boolean(b.isFrozen) };
}

/** Lien de collecte pay.orzayah.com : le payeur choisit son mode de paiement sur la page ORZAYAH. */
export const createPaymentLink = ({ amount, description, idempotencyKey }) =>
  oz('/payment-links', { method: 'POST', body: { amount, description, idempotencyKey } });

/** Statut d'un lien : PENDING tant qu'il n'est pas payé, puis statut du paiement (SUCCESS, FAILED...). */
export const getPaymentLink = (slug) => oz(`/payment-links/${encodeURIComponent(slug)}`);
