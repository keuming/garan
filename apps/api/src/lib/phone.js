import { config } from '../config.js';

/**
 * Normalise un numéro au format E.164.
 * "07 07 12 34 56" -> "+2250707123456" (indicatif par défaut : DEFAULT_COUNTRY_CODE)
 * "00225 0707123456" et "+225 0707123456" -> "+2250707123456"
 * Retourne null si le numéro est invalide.
 */
export function normalizePhone(raw, defaultCc = config.DEFAULT_COUNTRY_CODE) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) {
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }
  if (!/^\d{8,12}$/.test(s)) return null;
  const full = `+${defaultCc}${s}`;
  return /^\+\d{8,15}$/.test(full) ? full : null;
}

/** Masque un numéro : +225 07 •• •• 56 */
export function maskPhone(phone) {
  if (!phone) return null;
  return `${phone.slice(0, -6)}••••${phone.slice(-2)}`;
}
