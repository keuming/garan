import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Envoi de SMS via une passerelle HTTP générique (branchable).
 * Tant que SMS_API_URL + SMS_API_KEY ne sont pas configurés, l'envoi est un no-op
 * silencieux : l'application continue de fonctionner sans erreur.
 *
 * La passerelle attendue reçoit un POST JSON { to, message, sender } avec
 * l'en-tête Authorization: Bearer <SMS_API_KEY>. Adaptez le corps à votre
 * fournisseur si besoin.
 */

export const smsEnabled = () => Boolean(config.SMS_API_URL && config.SMS_API_KEY);

export async function sendSms({ to, message }) {
  if (!to) return { sent: false, reason: 'NO_RECIPIENT' };
  if (!smsEnabled()) {
    logger.warn({ to }, 'SMS non envoyé : passerelle non configurée (SMS_API_URL/SMS_API_KEY)');
    return { sent: false, reason: 'SMS_NOT_CONFIGURED' };
  }
  try {
    const res = await fetch(config.SMS_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.SMS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message, sender: config.SMS_SENDER || 'gaRAN' }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: body.slice(0, 200), to }, 'Échec envoi SMS');
      return { sent: false, reason: 'SEND_FAILED' };
    }
    return { sent: true };
  } catch (err) {
    logger.warn({ err: err.message, to }, 'Passerelle SMS injoignable');
    return { sent: false, reason: 'UNREACHABLE' };
  }
}
