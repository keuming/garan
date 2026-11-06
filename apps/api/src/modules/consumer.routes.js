import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { AppError, badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { maskImei } from '../lib/imei.js';
import {
  hashSecret,
  issueRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  verifySecret
} from '../lib/security.js';
import { storage } from '../lib/storage.js';
import { audit } from '../lib/audit.js';
import { sendEmail, emailLayout } from '../lib/mailer.js';
import { sendSms } from '../lib/sms.js';

/** E-mail de bienvenue (si une adresse est fournie Ã  l'inscription). Ne bloque jamais. */
async function sendWelcome({ email, name }) {
  if (!email) return;
  const hello = name ? `Bonjour ${name},` : 'Bonjour,';
  await sendEmail({
    to: email,
    subject: 'Bienvenue sur gaRAN',
    html: emailLayout({ title: 'Bienvenue sur gaRAN', bodyHtml: `<p>${hello}</p><p>Votre compte gaRAN est crÃ©Ã©. ProtÃ©gez vos tÃ©lÃ©phones : liez leur IMEI et signalez un vol en un clic sur tout le rÃ©seau.</p>` }),
    text: `${hello}\nVotre compte gaRAN est crÃ©Ã©. Liez l'IMEI de vos tÃ©lÃ©phones pour les protÃ©ger.`
  }).catch(() => {});
}

/** Notifie un changement d'adresse e-mail : Ã  l'ANCIENNE (sÃ©curitÃ©) et Ã  la NOUVELLE (confirmation). Ne bloque jamais. */
async function notifyEmailChange({ oldEmail, newEmail, name }) {
  const hello = name ? `Bonjour ${name},` : 'Bonjour,';
  if (oldEmail) {
    await sendEmail({
      to: oldEmail,
      subject: 'Votre adresse e-mail gaRAN a Ã©tÃ© modifiÃ©e',
      html: emailLayout({
        title: 'Adresse e-mail modifiÃ©e',
        bodyHtml: `<p>${hello}</p><p>L'adresse e-mail de votre compte gaRAN vient d'Ãªtre remplacÃ©e par <strong>${newEmail}</strong>.</p><p>Si vous Ãªtes Ã  l'origine de ce changement, aucune action n'est nÃ©cessaire.</p><p><strong>Si vous n'Ãªtes pas Ã  l'origine de ce changement</strong>, votre compte est peut-Ãªtre compromis : modifiez votre code PIN immÃ©diatement et contactez-nous.</p>`
      }),
      text: `${hello}\nL'adresse e-mail de votre compte gaRAN a Ã©tÃ© remplacÃ©e par ${newEmail}. Si vous n'Ãªtes pas Ã  l'origine de ce changement, modifiez votre code PIN et contactez-nous.`
    }).catch(() => {});
  }
  await sendEmail({
    to: newEmail,
    subject: 'Confirmation de votre nouvelle adresse e-mail gaRAN',
    html: emailLayout({ title: 'Nouvelle adresse e-mail confirmÃ©e', bodyHtml: `<p>${hello}</p><p>Cette adresse est dÃ©sormais associÃ©e Ã  votre compte gaRAN.</p>` }),
    text: `${hello}\nCette adresse est dÃ©sormais associÃ©e Ã  votre compte gaRAN.`
  }).catch(() => {});
}
import { OPERATORS } from '../lib/orzayah.js';
import { initiateSubscription, pollSubscription, syncSubscriptions, subscriptionQuote } from './subscription.service.js';
import { validate, zEmail, zImei, zOptionalEmail, zPhone, zPin, zText, zUuid } from '../lib/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { verifyAccessToken } from '../lib/security.js';

/**
 * Espace Â« usager Â» : l'acheteur final enregistre lui-mÃªme le tÃ©lÃ©phone qu'il a
 * acquis et le relie Ã  son compte (linkage), et le dÃ©lie quand il le revend.
 * Connexion par tÃ©lÃ©phone + code PIN, comme les marchands.
 */
export const consumerRouter = Router();

const DUMMY_HASH = bcrypt.hashSync('garan-consumer-dummy', config.BCRYPT_ROUNDS);
const meta = (req) => ({ userAgent: req.get('user-agent')?.slice(0, 200), ip: req.ip });
const accessToken = (c) => signAccessToken({ sub: c.id, typ: 'consumer' });

async function loadConsumer(id) {
  const { rows } = await query(
    `SELECT id, full_name, phone, email, emergency_number, emergency_name, status, subscription_expires_at, created_at FROM consumers WHERE id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Compte introuvable');
  return rows[0];
}

/** Middleware : authentifie un usager. */
async function requireConsumer(req, _res, next) {
  const h = req.headers.authorization ?? '';
  const [scheme, token] = h.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();
  const claims = verifyAccessToken(token, 'consumer');
  const { rows } = await query(`SELECT id, status FROM consumers WHERE id = $1`, [claims.sub]);
  if (!rows[0] || rows[0].status !== 'active') throw unauthorized('Compte dÃ©sactivÃ©');
  req.auth = { typ: 'consumer', sub: rows[0].id };
  next();
}

/* ------------------------------- Auth ------------------------------- */

consumerRouter.post(
  '/auth/register',
  authLimiter,
  validate({ body: z.object({ full_name: zText(120), phone: zPhone, email: zOptionalEmail, pin: zPin }) }),
  async (req, res) => {
    const b = req.v.body;
    if ((await query(`SELECT 1 FROM consumers WHERE phone = $1`, [b.phone])).rowCount) {
      throw conflict('PHONE_TAKEN', 'Ce numÃ©ro a dÃ©jÃ  un compte. Connectez-vous.');
    }
    const { rows } = await query(
      `INSERT INTO consumers (full_name, phone, email, pin_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [b.full_name, b.phone, b.email, await hashSecret(b.pin)]
    );
    req.auth = { typ: 'consumer', sub: rows[0].id };
    await audit(req, 'consumer.register', { entity: 'consumer', entityId: rows[0].id });
    await sendWelcome({ email: b.email, name: b.full_name });
    res.status(201).json({
      access_token: accessToken(rows[0]),
      refresh_token: await issueRefreshToken('consumer', rows[0].id, meta(req)),
      consumer: await loadConsumer(rows[0].id)
    });
  }
);

consumerRouter.post(
  '/auth/login',
  authLimiter,
  validate({ body: z.object({ phone: zPhone, pin: zPin }) }),
  async (req, res) => {
    const { phone, pin } = req.v.body;
    const { rows } = await query(
      `SELECT id, pin_hash, status, failed_attempts, locked_until FROM consumers WHERE phone = $1`,
      [phone]
    );
    const c = rows[0];
    if (!c) {
      await verifySecret(pin, DUMMY_HASH);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'NumÃ©ro ou code PIN incorrect');
    }
    if (c.locked_until && new Date(c.locked_until) > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Trop de tentatives. RÃ©essayez plus tard.', { locked_until: c.locked_until });
    }
    if (!(await verifySecret(pin, c.pin_hash))) {
      const attempts = c.failed_attempts + 1;
      const lock = attempts >= config.PIN_MAX_ATTEMPTS;
      await query(
        `UPDATE consumers SET failed_attempts = $2,
           locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END WHERE id = $1`,
        [c.id, lock ? 0 : attempts, lock, config.PIN_LOCK_MINUTES]
      );
      throw new AppError(401, 'INVALID_CREDENTIALS', 'NumÃ©ro ou code PIN incorrect', {
        remaining_attempts: lock ? 0 : config.PIN_MAX_ATTEMPTS - attempts
      });
    }
    if (c.status !== 'active') throw unauthorized('Compte dÃ©sactivÃ©');
    await query(`UPDATE consumers SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [c.id]);
    req.auth = { typ: 'consumer', sub: c.id };
    await audit(req, 'consumer.login', { entity: 'consumer', entityId: c.id });
    res.json({
      access_token: accessToken(c),
      refresh_token: await issueRefreshToken('consumer', c.id, meta(req)),
      consumer: await loadConsumer(c.id)
    });
  }
);

consumerRouter.post(
  '/auth/refresh',
  validate({ body: z.object({ refresh_token: z.string().min(20).max(200) }) }),
  async (req, res) => {
    const { subjectType, subjectId, refreshToken } = await rotateRefreshToken(req.v.body.refresh_token, meta(req));
    if (subjectType !== 'consumer') throw unauthorized();
    const { rows } = await query(`SELECT id, status FROM consumers WHERE id = $1`, [subjectId]);
    if (!rows[0] || rows[0].status !== 'active') throw unauthorized('Compte dÃ©sactivÃ©');
    res.json({ access_token: accessToken(rows[0]), refresh_token: refreshToken });
  }
);

consumerRouter.post(
  '/auth/logout',
  validate({ body: z.object({ refresh_token: z.string().min(20).max(200) }) }),
  async (req, res) => {
    await revokeRefreshToken(req.v.body.refresh_token);
    res.status(204).end();
  }
);

consumerRouter.get('/me', requireConsumer, async (req, res) => {
  // Rattrape un abonnement payÃ© alors que l'application avait Ã©tÃ© fermÃ©e (suivi perdu cÃ´tÃ© Ã©cran).
  const sync = await syncSubscriptions({ subjectType: 'consumer', subjectId: req.auth.sub, deadlineMs: 4000 }).catch(() => null);
  if (sync?.applied) await audit(req, 'consumer.subscription_activated', { entity: 'consumer', entityId: req.auth.sub });
  res.json({ consumer: await loadConsumer(req.auth.sub) });
});

consumerRouter.patch(
  '/me',
  requireConsumer,
  validate({
    body: z.object({
      full_name: zText(120).optional(),
      email: zOptionalEmail,
      emergency_number: z.string().trim().max(20).optional().nullable(),
      emergency_name: z.string().trim().max(120).optional().nullable()
    })
  }),
  async (req, res) => {
    const current = (await query(`SELECT full_name, email FROM consumers WHERE id = $1`, [req.auth.sub])).rows[0];
    const fields = Object.entries({
      full_name: req.v.body.full_name,
      email: req.v.body.email,
      emergency_number: req.v.body.emergency_number,
      emergency_name: req.v.body.emergency_name
    }).filter(([, v]) => v !== undefined);
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    await query(`UPDATE consumers SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [req.auth.sub, ...fields.map(([, v]) => v)]);
    // Changement d'adresse e-mail â†’ on prÃ©vient l'ancienne (anti-dÃ©tournement) et on confirme la nouvelle.
    const newEmail = req.v.body.email;
    if (newEmail && (current?.email ?? null) !== newEmail) {
      await notifyEmailChange({ oldEmail: current?.email ?? null, newEmail, name: req.v.body.full_name ?? current?.full_name });
    }
    res.json({ consumer: await loadConsumer(req.auth.sub) });
  }
);

/** Alerte un changement de carte SIM : e-mail au propriÃ©taire + SMS au numÃ©ro de secours. Ne bloque jamais. */
async function alertSimChange({ consumer, newNumber, operator }) {
  const name = consumer.full_name || 'un usager';
  const detail = [newNumber ? `nouveau numÃ©ro ${newNumber}` : null, operator ? `opÃ©rateur ${operator}` : null].filter(Boolean).join(', ');
  if (consumer.email) {
    await sendEmail({
      to: consumer.email,
      subject: 'gaRAN â€” changement de carte SIM dÃ©tectÃ©',
      html: emailLayout({
        title: 'Changement de carte SIM dÃ©tectÃ©',
        bodyHtml: `<p>Bonjour ${consumer.full_name || ''},</p><p>Une <strong>nouvelle carte SIM</strong> vient d'Ãªtre dÃ©tectÃ©e dans un tÃ©lÃ©phone enregistrÃ© sur votre compte gaRAN${detail ? ` (${detail})` : ''}.</p><p>Si c'est vous (changement d'opÃ©rateur ou nouvelle SIM), ignorez ce message.</p><p><strong>Si ce n'est pas vous</strong>, votre tÃ©lÃ©phone a peut-Ãªtre Ã©tÃ© volÃ© : ouvrez l'app et signalez-le immÃ©diatement (DÃ©clarer un vol), puis prÃ©venez votre contact de secours.</p>`
      }),
      text: `Changement de carte SIM dÃ©tectÃ© sur un tÃ©lÃ©phone de votre compte gaRAN${detail ? ` (${detail})` : ''}. Si ce n'est pas vous, signalez un vol immÃ©diatement.`
    }).catch(() => {});
  }
  if (consumer.emergency_number) {
    await sendSms({
      to: consumer.emergency_number,
      message: `[gaRAN] Alerte: changement de carte SIM sur le telephone de ${name}${newNumber ? `. Nouveau numero: ${newNumber}` : ''}. En cas de vol suspecte, agissez vite.`
    }).catch(() => {});
  }
}

/**
 * Signalement d'un changement de carte SIM par l'app.
 * L'app envoie l'identifiant de la SIM courante ; au premier appel on l'enregistre,
 * et si l'identifiant change ensuite, on dÃ©clenche les alertes.
 */
consumerRouter.post(
  '/security/sim-change',
  requireConsumer,
  validate({
    body: z.object({
      sim_id: z.string().trim().min(3).max(64),
      imei: zImei.optional().nullable(),
      new_number: z.string().trim().max(20).optional().nullable(),
      operator: z.string().trim().max(40).optional().nullable()
    })
  }),
  async (req, res) => {
    const c = (await query(`SELECT id, full_name, email, emergency_number, last_sim_id FROM consumers WHERE id = $1`, [req.auth.sub])).rows[0];
    if (!c) throw notFound('Compte introuvable');
    const prev = c.last_sim_id;
    const simId = req.v.body.sim_id;
    const changed = Boolean(prev) && prev !== simId;

    // Appareil concernÃ© (si l'app fournit l'IMEI) + contexte Â« aprÃ¨s vol Â»
    let device = null;
    if (req.v.body.imei) {
      device = (await query(`SELECT id, status FROM devices WHERE imei1 = $1 OR imei2 = $1`, [req.v.body.imei])).rows[0] ?? null;
    }
    let afterTheft = Boolean(device && REPORTED.has(device.status));
    if (!device) {
      const any = await query(
        `SELECT 1 FROM device_registrations r JOIN devices d ON d.id = r.device_id
         WHERE r.consumer_id = $1 AND r.status = 'active' AND d.status IN ('stolen', 'lost', 'blocked') LIMIT 1`,
        [req.auth.sub]
      );
      afterTheft = any.rowCount > 0;
    }

    await query(`UPDATE consumers SET last_sim_id = $2 WHERE id = $1`, [req.auth.sub, simId]);

    // On trace la SIM si elle change, ou dÃ¨s qu'elle apparaÃ®t sur un appareil volÃ© (traÃ§abilitÃ© back-office).
    if (changed || afterTheft) {
      await query(
        `INSERT INTO sim_events (consumer_id, device_id, sim_id, phone_number, operator, ip, after_theft)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.auth.sub, device?.id ?? null, simId, req.v.body.new_number ?? null, req.v.body.operator ?? null, req.ip ?? null, afterTheft]
      );
    }
    if (changed) {
      await audit(req, 'consumer.sim_change', { entity: 'consumer', entityId: req.auth.sub, meta: { operator: req.v.body.operator ?? null, after_theft: afterTheft } });
      await alertSimChange({ consumer: c, newNumber: req.v.body.new_number, operator: req.v.body.operator });
    }
    res.json({ changed, first_seen: !prev, after_theft: afterTheft });
  }
);

consumerRouter.post(
  '/me/pin',
  requireConsumer,
  validate({ body: z.object({ current_pin: zPin, new_pin: zPin }) }),
  async (req, res) => {
    const { rows } = await query(`SELECT pin_hash FROM consumers WHERE id = $1`, [req.auth.sub]);
    if (!(await verifySecret(req.v.body.current_pin, rows[0].pin_hash))) throw badRequest('INVALID_PIN', 'Code PIN actuel incorrect');
    await query(`UPDATE consumers SET pin_hash = $2 WHERE id = $1`, [req.auth.sub, await hashSecret(req.v.body.new_pin)]);
    await revokeAllRefreshTokens('consumer', req.auth.sub);
    res.status(204).end();
  }
);

/* ------------------------- PiÃ¨ces justificatives ------------------------- */

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.UPLOAD_MAX_MB * 1024 * 1024, files: 1 } });

function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

consumerRouter.post('/uploads', requireConsumer, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED', 'Fichier manquant (champ Â« file Â»)');
  const mime = sniff(req.file.buffer);
  if (!mime) throw badRequest('INVALID_FILE_TYPE', 'Image (JPEG, PNG, WebP) ou PDF attendu');
  const now = new Date();
  const key = `consumer-docs/${req.auth.sub}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ALLOWED[mime]}`;
  await storage.put(key, req.file.buffer, mime);
  res.status(201).json({ key });
});

/* ------------------------- TÃ©lÃ©phones de l'usager ------------------------- */

const REPORTED = new Set(['stolen', 'lost', 'blocked']);

/** Avant de lier : Ã©tat de l'IMEI et disponibilitÃ©. */
consumerRouter.get(
  '/devices/check/:imei',
  requireConsumer,
  validate({ params: z.object({ imei: zImei }) }),
  async (req, res) => {
    const { imei } = req.v.params;
    const { rows } = await query(
      `SELECT d.id, d.status, COALESCE(b.name, d.brand_label) AS brand, COALESCE(m.name, d.model_label) AS model, d.owner_type, d.owner_consumer_id
       FROM devices d LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
       WHERE d.imei1 = $1 OR d.imei2 = $1`,
      [imei]
    );
    const d = rows[0];
    const reported = d ? REPORTED.has(d.status) : false;
    const mineAlready = d?.owner_type === 'consumer' && d.owner_consumer_id === req.auth.sub;
    const heldByOther = d?.owner_type === 'consumer' && d.owner_consumer_id !== req.auth.sub;
    res.json({
      imei,
      known: Boolean(d),
      reported,
      brand: d?.brand ?? null,
      model: d?.model ?? null,
      can_register: !reported && !mineAlready && !heldByOther,
      mine_already: mineAlready,
      held_by_other: heldByOther,
      message: reported
        ? 'Ce tÃ©lÃ©phone est signalÃ© volÃ© ou perdu. Rapprochez-vous de la police.'
        : mineAlready
          ? 'Ce tÃ©lÃ©phone est dÃ©jÃ  enregistrÃ© Ã  votre compte.'
          : heldByOther
            ? 'Ce tÃ©lÃ©phone est dÃ©jÃ  enregistrÃ© par un autre usager. Sâ€™il vous appartient, il doit dâ€™abord Ãªtre dÃ©liÃ© par lâ€™ancien propriÃ©taire.'
            : 'TÃ©lÃ©phone disponible Ã  lâ€™enregistrement.'
    });
  }
);

consumerRouter.get('/devices', requireConsumer, async (req, res) => {
  const { rows } = await query(
    `SELECT r.id AS registration_id, r.status, r.acquired_at, r.released_at, r.purchase_place, r.merchant_name,
            r.receipt_number, r.receipt_key, r.box_photo_key, r.account_email,
            d.id AS device_id, d.imei1, d.imei2, d.status AS device_status, d.color, d.storage_gb,
            COALESCE(b.name, d.brand_label) AS brand, COALESCE(m.name, d.model_label) AS model
     FROM device_registrations r
     JOIN devices d ON d.id = r.device_id
     LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
     WHERE r.consumer_id = $1 ORDER BY (r.status = 'active') DESC, r.acquired_at DESC`,
    [req.auth.sub]
  );
  res.json({ items: rows });
});

/** Linkage : enregistre un tÃ©lÃ©phone acquis et le relie au compte de l'usager. */
consumerRouter.post(
  '/devices/register',
  requireConsumer,
  validate({
    body: z.object({
      imei1: zImei,
      imei2: zImei.optional().nullable(),
      brand_id: z.coerce.number().int().positive().optional(),
      brand_label: z.string().trim().max(60).optional().nullable(),
      model_id: z.coerce.number().int().positive().optional().nullable(),
      model_label: z.string().trim().max(80).optional().nullable(),
      purchase_place: z.string().trim().max(160).optional().nullable(),
      merchant_name: z.string().trim().max(120).optional().nullable(),
      receipt_number: z.string().trim().max(60).optional().nullable(),
      receipt_key: z.string().max(200).optional().nullable(),
      box_photo_key: z.string().max(200).optional().nullable(),
      account_email: zOptionalEmail
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const prefix = `consumer-docs/${req.auth.sub}/`;
    for (const key of [b.receipt_key, b.box_photo_key]) {
      if (key && !key.startsWith(prefix)) throw badRequest('INVALID_DOCUMENT', 'PiÃ¨ce jointe invalide');
    }
    const result = await withTransaction(async (c) => {
      const found = await c.query(
        `SELECT id, status, owner_type, owner_consumer_id FROM devices WHERE imei1 = $1 OR imei2 = $1 FOR UPDATE`,
        [b.imei1]
      );
      let device = found.rows[0];
      if (device && REPORTED.has(device.status)) {
        throw conflict('DEVICE_REPORTED', 'Ce tÃ©lÃ©phone est signalÃ© volÃ© ou perdu : enregistrement impossible.');
      }
      if (device && device.owner_type === 'consumer') {
        if (device.owner_consumer_id === req.auth.sub) throw conflict('ALREADY_MINE', 'Ce tÃ©lÃ©phone est dÃ©jÃ  Ã  votre compte.');
        throw conflict('HELD_BY_OTHER', 'Ce tÃ©lÃ©phone est enregistrÃ© par un autre usager ; il doit dâ€™abord Ãªtre dÃ©liÃ©.');
      }
      if (!device) {
        const brandLabel = b.brand_label && b.brand_label.trim() ? b.brand_label.trim() : null;
        if ((!b.brand_id && !brandLabel) || (!b.model_id && !b.model_label)) throw badRequest('DEVICE_DETAILS_REQUIRED', 'Marque et modÃ¨le requis pour un tÃ©lÃ©phone inconnu');
        const freeBrand = !b.brand_id;
        const ins = await c.query(
          `INSERT INTO devices (imei1, imei2, brand_id, brand_label, model_id, model_label, owner_type, owner_consumer_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'consumer', $7) RETURNING id`,
          [b.imei1, b.imei2 ?? null, freeBrand ? null : b.brand_id, freeBrand ? brandLabel : null, freeBrand ? null : (b.model_id ?? null), !freeBrand && b.model_id ? null : b.model_label, req.auth.sub]
        );
        device = { id: ins.rows[0].id };
      } else {
        await c.query(
          `UPDATE devices SET owner_type = 'consumer', owner_consumer_id = $2, owner_shop_id = NULL, owner_person_id = NULL WHERE id = $1`,
          [device.id, req.auth.sub]
        );
      }
      const reg = await c.query(
        `INSERT INTO device_registrations (device_id, consumer_id, purchase_place, merchant_name, receipt_number, receipt_key, box_photo_key, account_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [device.id, req.auth.sub, b.purchase_place ?? null, b.merchant_name ?? null, b.receipt_number ?? null, b.receipt_key ?? null, b.box_photo_key ?? null, b.account_email ?? null]
      );
      return reg.rows[0].id;
    });
    await audit(req, 'consumer.device_registered', { entity: 'device_registration', entityId: result });
    res.status(201).json({ registration_id: result });
  }
);

/** DÃ©linkage : l'usager a revendu/cÃ©dÃ© le tÃ©lÃ©phone ; il le dÃ©tache de son compte. */
consumerRouter.post(
  '/devices/:registrationId/release',
  requireConsumer,
  validate({ params: z.object({ registrationId: zUuid }) }),
  async (req, res) => {
    await withTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT r.id, r.device_id FROM device_registrations r
         WHERE r.id = $1 AND r.consumer_id = $2 AND r.status = 'active' FOR UPDATE`,
        [req.v.params.registrationId, req.auth.sub]
      );
      if (!rows[0]) throw notFound('Enregistrement actif introuvable');
      await c.query(`UPDATE device_registrations SET status = 'released', released_at = now() WHERE id = $1`, [rows[0].id]);
      await c.query(
        `UPDATE devices SET owner_type = 'none', owner_consumer_id = NULL
         WHERE id = $1 AND owner_type = 'consumer' AND owner_consumer_id = $2`,
        [rows[0].device_id, req.auth.sub]
      );
    });
    await audit(req, 'consumer.device_released', { entity: 'device_registration', entityId: req.v.params.registrationId });
    res.status(204).end();
  }
);

/** DÃ©claration de vol / perte d'un tÃ©lÃ©phone liÃ© : l'usager est le propriÃ©taire, on confirme directement. */
consumerRouter.post(
  '/devices/:registrationId/report-theft',
  requireConsumer,
  validate({ params: z.object({ registrationId: zUuid }), body: z.object({ kind: z.enum(['stolen', 'lost']).default('stolen'), police_report_number: z.string().trim().max(60).optional().nullable(), description: z.string().trim().max(1000).optional().nullable() }) }),
  async (req, res) => {
    const me = (await query(`SELECT full_name, phone FROM consumers WHERE id = $1`, [req.auth.sub])).rows[0];
    const result = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT r.device_id, d.imei1 FROM device_registrations r JOIN devices d ON d.id = r.device_id
         WHERE r.id = $1 AND r.consumer_id = $2 AND r.status = 'active' FOR UPDATE OF d`,
        [req.v.params.registrationId, req.auth.sub]
      );
      if (!rows[0]) throw notFound('TÃ©lÃ©phone liÃ© introuvable');
      const { device_id: deviceId, imei1 } = rows[0];
      const rep = await c.query(
        `INSERT INTO theft_reports (device_id, imei, kind, reporter_name, reporter_phone, id_doc_type, id_doc_number,
                                    police_report_number, description, status, auto_confirmed)
         VALUES ($1,$2,$3,$4,$5,'COMPTE_USAGER',$6,$7,$8,'confirmed',true) RETURNING id`,
        [deviceId, imei1, req.v.body.kind, me.full_name, me.phone, me.phone, req.v.body.police_report_number ?? null, req.v.body.description ?? null]
      );
      await c.query(`UPDATE devices SET status = $2 WHERE id = $1`, [deviceId, req.v.body.kind]);
      return rep.rows[0].id;
    });
    await audit(req, 'consumer.theft_reported', { entity: 'theft_report', entityId: result, meta: { kind: req.v.body.kind } });
    res.status(201).json({ reference: result, status: 'confirmed', message: 'TÃ©lÃ©phone signalÃ© dans tout le rÃ©seau gaRAN. Rapprochez-vous de la police avec votre reÃ§u.' });
  }
);

/* ---------------------- Abonnement (paiement ORZAYAH) ---------------------- */

consumerRouter.get('/subscription/plan', requireConsumer, async (req, res) => {
  const q = await subscriptionQuote({ subjectType: 'consumer', subjectId: req.auth.sub });
  res.json({ ...q, price_fcfa: q.month_fcfa });
});

consumerRouter.post(
  '/subscription/orzayah',
  requireConsumer,
  validate({ body: z.object({ operator: z.enum(OPERATORS).optional(), account_number: z.string().trim().regex(/^\d{8,15}$/, 'NumÃ©ro Mobile Money invalide').optional(), months: z.coerce.number().int().min(1).max(12).default(1) }) }),
  async (req, res) => {
    const r = await initiateSubscription({ subjectType: 'consumer', subjectId: req.auth.sub, months: req.v.body.months, operator: req.v.body.operator, accountNumber: req.v.body.account_number });
    await audit(req, 'consumer.subscription_initiated', { entity: 'orzayah_payment', entityId: r.payment_id });
    res.status(201).json(r);
  }
);

consumerRouter.get(
  '/subscription/orzayah/:id',
  requireConsumer,
  validate({ params: z.object({ id: zUuid }) }),
  async (req, res) => {
    const r = await pollSubscription(req.v.params.id, { subjectType: 'consumer', subjectId: req.auth.sub });
    res.json({ ...r, consumer: await loadConsumer(req.auth.sub) });
  }
);

/** Relit les paiements d'abonnement en attente (bouton Â« VÃ©rifier Â» / retour dans l'appli). */
consumerRouter.post('/subscription/sync', requireConsumer, async (req, res) => {
  const r = await syncSubscriptions({ subjectType: 'consumer', subjectId: req.auth.sub, force: true });
  if (r.applied) await audit(req, 'consumer.subscription_activated', { entity: 'consumer', entityId: req.auth.sub });
  res.json({ ...r, consumer: await loadConsumer(req.auth.sub) });
});

/** VÃ©rification publique simple d'un IMEI, utile avant un achat d'occasion. */
consumerRouter.get(
  '/public/imei/:imei',
  validate({ params: z.object({ imei: zImei }) }),
  async (req, res) => {
    const { rows } = await query(
      `SELECT d.status, COALESCE(b.name, d.brand_label) AS brand, COALESCE(m.name, d.model_label) AS model
       FROM devices d LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
       WHERE d.imei1 = $1 OR d.imei2 = $1`,
      [req.v.params.imei]
    );
    const d = rows[0];
    const result = !d ? 'unknown' : REPORTED.has(d.status) ? 'reported' : 'clean';
    res.json({ imei: maskImei(req.v.params.imei), result, brand: d?.brand ?? null, model: d?.model ?? null });
  }
);
