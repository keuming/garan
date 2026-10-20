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
import { OPERATORS } from '../lib/orzayah.js';
import { initiateSubscription, pollSubscription, PLAN_FCFA } from './subscription.service.js';
import { validate, zEmail, zImei, zOptionalEmail, zPhone, zPin, zText, zUuid } from '../lib/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { verifyAccessToken } from '../lib/security.js';

/**
 * Espace « usager » : l'acheteur final enregistre lui-même le téléphone qu'il a
 * acquis et le relie à son compte (linkage), et le délie quand il le revend.
 * Connexion par téléphone + code PIN, comme les marchands.
 */
export const consumerRouter = Router();

const DUMMY_HASH = bcrypt.hashSync('garan-consumer-dummy', config.BCRYPT_ROUNDS);
const meta = (req) => ({ userAgent: req.get('user-agent')?.slice(0, 200), ip: req.ip });
const accessToken = (c) => signAccessToken({ sub: c.id, typ: 'consumer' });

async function loadConsumer(id) {
  const { rows } = await query(
    `SELECT id, full_name, phone, email, status, subscription_expires_at, created_at FROM consumers WHERE id = $1`,
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
  if (!rows[0] || rows[0].status !== 'active') throw unauthorized('Compte désactivé');
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
      throw conflict('PHONE_TAKEN', 'Ce numéro a déjà un compte. Connectez-vous.');
    }
    const { rows } = await query(
      `INSERT INTO consumers (full_name, phone, email, pin_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [b.full_name, b.phone, b.email, await hashSecret(b.pin)]
    );
    req.auth = { typ: 'consumer', sub: rows[0].id };
    await audit(req, 'consumer.register', { entity: 'consumer', entityId: rows[0].id });
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
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Numéro ou code PIN incorrect');
    }
    if (c.locked_until && new Date(c.locked_until) > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Trop de tentatives. Réessayez plus tard.', { locked_until: c.locked_until });
    }
    if (!(await verifySecret(pin, c.pin_hash))) {
      const attempts = c.failed_attempts + 1;
      const lock = attempts >= config.PIN_MAX_ATTEMPTS;
      await query(
        `UPDATE consumers SET failed_attempts = $2,
           locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END WHERE id = $1`,
        [c.id, lock ? 0 : attempts, lock, config.PIN_LOCK_MINUTES]
      );
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Numéro ou code PIN incorrect', {
        remaining_attempts: lock ? 0 : config.PIN_MAX_ATTEMPTS - attempts
      });
    }
    if (c.status !== 'active') throw unauthorized('Compte désactivé');
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
    if (!rows[0] || rows[0].status !== 'active') throw unauthorized('Compte désactivé');
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

consumerRouter.get('/me', requireConsumer, async (req, res) => res.json({ consumer: await loadConsumer(req.auth.sub) }));

consumerRouter.patch(
  '/me',
  requireConsumer,
  validate({ body: z.object({ full_name: zText(120).optional(), email: zOptionalEmail }) }),
  async (req, res) => {
    const fields = Object.entries({ full_name: req.v.body.full_name, email: req.v.body.email }).filter(([, v]) => v !== undefined);
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    await query(`UPDATE consumers SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [req.auth.sub, ...fields.map(([, v]) => v)]);
    res.json({ consumer: await loadConsumer(req.auth.sub) });
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

/* ------------------------- Pièces justificatives ------------------------- */

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
  if (!req.file) throw badRequest('FILE_REQUIRED', 'Fichier manquant (champ « file »)');
  const mime = sniff(req.file.buffer);
  if (!mime) throw badRequest('INVALID_FILE_TYPE', 'Image (JPEG, PNG, WebP) ou PDF attendu');
  const now = new Date();
  const key = `consumer-docs/${req.auth.sub}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ALLOWED[mime]}`;
  await storage.put(key, req.file.buffer, mime);
  res.status(201).json({ key });
});

/* ------------------------- Téléphones de l'usager ------------------------- */

const REPORTED = new Set(['stolen', 'lost', 'blocked']);

/** Avant de lier : état de l'IMEI et disponibilité. */
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
        ? 'Ce téléphone est signalé volé ou perdu. Rapprochez-vous de la police.'
        : mineAlready
          ? 'Ce téléphone est déjà enregistré à votre compte.'
          : heldByOther
            ? 'Ce téléphone est déjà enregistré par un autre usager. S’il vous appartient, il doit d’abord être délié par l’ancien propriétaire.'
            : 'Téléphone disponible à l’enregistrement.'
    });
  }
);

consumerRouter.get('/devices', requireConsumer, async (req, res) => {
  const { rows } = await query(
    `SELECT r.id AS registration_id, r.status, r.acquired_at, r.released_at, r.purchase_place, r.merchant_name,
            r.receipt_number, r.receipt_key, r.box_photo_key,
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

/** Linkage : enregistre un téléphone acquis et le relie au compte de l'usager. */
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
      box_photo_key: z.string().max(200).optional().nullable()
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const prefix = `consumer-docs/${req.auth.sub}/`;
    for (const key of [b.receipt_key, b.box_photo_key]) {
      if (key && !key.startsWith(prefix)) throw badRequest('INVALID_DOCUMENT', 'Pièce jointe invalide');
    }
    const result = await withTransaction(async (c) => {
      const found = await c.query(
        `SELECT id, status, owner_type, owner_consumer_id FROM devices WHERE imei1 = $1 OR imei2 = $1 FOR UPDATE`,
        [b.imei1]
      );
      let device = found.rows[0];
      if (device && REPORTED.has(device.status)) {
        throw conflict('DEVICE_REPORTED', 'Ce téléphone est signalé volé ou perdu : enregistrement impossible.');
      }
      if (device && device.owner_type === 'consumer') {
        if (device.owner_consumer_id === req.auth.sub) throw conflict('ALREADY_MINE', 'Ce téléphone est déjà à votre compte.');
        throw conflict('HELD_BY_OTHER', 'Ce téléphone est enregistré par un autre usager ; il doit d’abord être délié.');
      }
      if (!device) {
        const brandLabel = b.brand_label && b.brand_label.trim() ? b.brand_label.trim() : null;
        if ((!b.brand_id && !brandLabel) || (!b.model_id && !b.model_label)) throw badRequest('DEVICE_DETAILS_REQUIRED', 'Marque et modèle requis pour un téléphone inconnu');
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
        `INSERT INTO device_registrations (device_id, consumer_id, purchase_place, merchant_name, receipt_number, receipt_key, box_photo_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [device.id, req.auth.sub, b.purchase_place ?? null, b.merchant_name ?? null, b.receipt_number ?? null, b.receipt_key ?? null, b.box_photo_key ?? null]
      );
      return reg.rows[0].id;
    });
    await audit(req, 'consumer.device_registered', { entity: 'device_registration', entityId: result });
    res.status(201).json({ registration_id: result });
  }
);

/** Délinkage : l'usager a revendu/cédé le téléphone ; il le détache de son compte. */
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

/** Déclaration de vol / perte d'un téléphone lié : l'usager est le propriétaire, on confirme directement. */
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
      if (!rows[0]) throw notFound('Téléphone lié introuvable');
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
    res.status(201).json({ reference: result, status: 'confirmed', message: 'Téléphone signalé dans tout le réseau gaRAN. Rapprochez-vous de la police avec votre reçu.' });
  }
);

/* ---------------------- Abonnement (paiement ORZAYAH) ---------------------- */

consumerRouter.get('/subscription/plan', requireConsumer, (req, res) => res.json({ price_fcfa: PLAN_FCFA.consumer, currency: 'XOF', period: 'month' }));

consumerRouter.post(
  '/subscription/orzayah',
  requireConsumer,
  validate({ body: z.object({ operator: z.enum(OPERATORS).optional(), account_number: z.string().trim().regex(/^\d{8,15}$/, 'Numéro Mobile Money invalide').optional(), months: z.coerce.number().int().min(1).max(12).default(1) }) }),
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

/** Vérification publique simple d'un IMEI, utile avant un achat d'occasion. */
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
