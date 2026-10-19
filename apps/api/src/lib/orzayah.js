import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Intégration ORZAYAH (paiement digital + solde).
 *
 * L'intégration est « préparée » : la couture est propre et centralisée ici.
 * Tant que ORZAYAH_API_URL n'est pas renseigné, le solde renvoie `configured:false`
 * et le paiement se contente de construire l'URL de redirection vers pay.orzayah.com.
 * Pour câbler réellement : définir ORZAYAH_API_URL (+ ORZAYAH_API_KEY) et, au besoin,
 * ajuster les paramètres de l'URL de checkout ci-dessous selon le contrat ORZAYAH réel.
 */

/** Construit l'URL de la page de paiement ORZAYAH pour encaisser une vente. */
export function buildCheckoutUrl({ orzayahNumber, amount, reference, label }) {
  const base = config.ORZAYAH_PAY_URL.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (orzayahNumber) params.set('merchant', orzayahNumber);
  if (amount != null) params.set('amount', String(amount));
  if (reference) params.set('ref', reference);
  if (label) params.set('label', label);
  params.set('return', `${config.PUBLIC_WEB_URL.replace(/\/$/, '')}/paiement/retour`);
  return `${base}/?${params.toString()}`;
}

/**
 * Lit le solde ORZAYAH d'un marchand.
 * Renvoie { configured, balance, currency } ; `balance` est null tant que l'API n'est pas câblée.
 */
export async function fetchBalance(orzayahNumber) {
  if (!orzayahNumber) return { configured: false, balance: null, currency: 'XOF', reason: 'NO_NUMBER' };
  if (!config.ORZAYAH_API_URL) return { configured: false, balance: null, currency: 'XOF', reason: 'API_NOT_WIRED' };
  try {
    const url = `${config.ORZAYAH_API_URL.replace(/\/$/, '')}/balance?account=${encodeURIComponent(orzayahNumber)}`;
    const res = await fetch(url, {
      headers: config.ORZAYAH_API_KEY ? { Authorization: `Bearer ${config.ORZAYAH_API_KEY}` } : {},
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error(`ORZAYAH balance HTTP ${res.status}`);
    const data = await res.json();
    // On tolère plusieurs formes de réponse le temps de figer le contrat.
    const raw = data.balance ?? data.data?.balance ?? data.amount ?? null;
    return { configured: true, balance: raw == null ? null : Number(raw), currency: data.currency ?? 'XOF' };
  } catch (err) {
    logger.warn({ err: err.message }, 'Lecture du solde ORZAYAH indisponible');
    return { configured: false, balance: null, currency: 'XOF', reason: 'UNAVAILABLE' };
  }
}
