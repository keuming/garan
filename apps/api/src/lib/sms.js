import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Envoi de SMS via la passerelle Inter Active Media (bulksms.interactivemedia.com).
 * Tant que SMS_API_URL + SMS_API_KEY ne sont pas configurés, l'envoi est un no-op
 * silencieux : l'application continue de fonctionner sans erreur.
 *
 * Contrat Inter Active Media :
 *   POST <SMS_API_URL>
 *   En-tête   x-app-token: <SMS_API_KEY>   (on envoie aussi x-api-key par sécurité)
 *   Corps     { receiver, sender, content, messageType: "SMS" }
 *   Réponse   { code: 200, message: "OK", message_id: "..." }
 * Le destinataire doit être au format international sans « + » (ex. 2250708090910).
 *
 * Variables Render attendues :
 *   SMS_API_URL = https://bulksms.interactivemedia.com/communicationManagement/v1/communicationMessage
 *   SMS_API_KEY = <token Inter Active Media>
 *   SMS_SENDER  = <sender ID validé, ex. gaRAN>
 *   DEFAULT_COUNTRY_CODE = 225 (Côte d'Ivoire, par défaut)
 */

export const smsEnabled = () => Boolean(config.SMS_API_URL && config.SMS_API_KEY);

/** Normalise un numéro au format international sans « + » (ex. 07 08 09 10 11 -> 2250708091011). */
export function formatMsisdn(raw, countryCode = config.DEFAULT_COUNTRY_CODE) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2); // 00225... -> 225...
  if (digits.startsWith(countryCode)) return digits; // déjà préfixé
  return `${countryCode}${digits}`;
}

export async function sendSms({ to, message }) {
  const receiver = formatMsisdn(to);
  if (!receiver) return { sent: false, reason: 'NO_RECIPIENT' };
  if (!smsEnabled()) {
    logger.warn({ to: receiver }, 'SMS non envoyé : passerelle non configurée (SMS_API_URL/SMS_API_KEY)');
    return { sent: false, reason: 'SMS_NOT_CONFIGURED' };
  }
  try {
    const res = await fetch(config.SMS_API_URL, {
      method: 'POST',
      headers: {
        'x-app-token': config.SMS_API_KEY,
        'x-api-key': config.SMS_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receiver,
        sender: config.SMS_SENDER || 'gaRAN',
        content: message,
        messageType: 'SMS'
      }),
      signal: AbortSignal.timeout(15000)
    });
    const raw = await res.text().catch(() => '');
    let json = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch { /* réponse non JSON */ }
    const code = Number(json.code ?? res.status);
    if (!res.ok || (json.code != null && code !== 200)) {
      logger.warn({ status: res.status, body: raw.slice(0, 200), to: receiver }, 'Échec envoi SMS');
      return { sent: false, reason: 'SEND_FAILED' };
    }
    return { sent: true, id: json.message_id ?? null };
  } catch (err) {
    logger.warn({ err: err.message, to: receiver }, 'Passerelle SMS injoignable');
    return { sent: false, reason: 'UNREACHABLE' };
  }
}
