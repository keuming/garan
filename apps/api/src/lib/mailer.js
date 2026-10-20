import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Envoi d'e-mails transactionnels via Resend (https://resend.com).
 * La clé reste côté serveur. Si RESEND_API_KEY / MAIL_FROM ne sont pas configurés,
 * l'envoi est un no-op silencieux : l'application continue de fonctionner normalement.
 */

export const mailerEnabled = () => Boolean(config.RESEND_API_KEY && config.MAIL_FROM);

/**
 * Envoie un e-mail. Ne lève jamais : renvoie { sent, id?, reason? }.
 * L'appelant peut donc l'« oublier » sans bloquer la requête.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: 'NO_RECIPIENT' };
  if (!mailerEnabled()) {
    logger.warn({ to, subject }, 'E-mail non envoyé : mailer non configuré (RESEND_API_KEY/MAIL_FROM)');
    return { sent: false, reason: 'MAILER_NOT_CONFIGURED' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.MAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text ?? undefined,
        ...(config.MAIL_REPLY_TO ? { reply_to: config.MAIL_REPLY_TO } : {})
      }),
      signal: AbortSignal.timeout(15000)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ status: res.status, body: json, to }, 'Échec envoi e-mail Resend');
      return { sent: false, reason: 'SEND_FAILED' };
    }
    return { sent: true, id: json.id };
  } catch (err) {
    logger.warn({ err: err.message, to }, 'Service e-mail injoignable');
    return { sent: false, reason: 'UNREACHABLE' };
  }
}

/** Gabarit HTML simple et sobre aux couleurs gaRAN. */
export function emailLayout({ title, bodyHtml }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f8f5;font-family:Arial,Helvetica,sans-serif;color:#0c2a20">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#00c271;border-radius:14px;padding:18px 20px;color:#fff;font-weight:800;font-size:20px">gaRAN</div>
    <div style="background:#fff;border:1px solid #e2ede7;border-radius:14px;padding:22px;margin-top:12px">
      <h1 style="margin:0 0 12px;font-size:18px;color:#0c2f23">${title}</h1>
      <div style="font-size:14px;line-height:1.55;color:#334">${bodyHtml}</div>
    </div>
    <p style="color:#8aa096;font-size:12px;margin-top:14px">gaRAN — la protection certifiée de vos appareils · une solution ORZAYAH SERVICES</p>
  </div></body></html>`;
}
