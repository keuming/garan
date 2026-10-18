import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { AppError, conflict, notFound, unauthorized } from '../lib/errors.js';
import {
  hashSecret,
  issueRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  verifySecret
} from '../lib/security.js';
import { validate, zEmail, zPhone, zPin, zText } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { requireUser } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

// Hash factice : la comparaison prend le même temps qu'un compte existe ou non.
const DUMMY_HASH = bcrypt.hashSync('garan-dummy-secret', config.BCRYPT_ROUNDS);

const meta = (req) => ({ userAgent: req.get('user-agent')?.slice(0, 200), ip: req.ip });

const userAccessToken = (u) =>
  signAccessToken({ sub: u.id, typ: 'user', role: u.role, org: u.organization_id, shop: u.shop_id ?? null });

const adminAccessToken = (a) => signAccessToken({ sub: a.id, typ: 'admin', role: a.role });

/** Profil complet renvoyé aux apps mobiles après connexion et sur GET /me. */
export async function loadUserProfile(userId) {
  const { rows } = await query(
    `SELECT u.id, u.role, u.full_name, u.phone, u.shop_id, u.status,
            json_build_object(
              'id', o.id, 'name', o.name, 'status', o.status, 'plan', o.plan, 'max_shops', o.max_shops,
              'subscription_expires_at', o.subscription_expires_at, 'rccm', o.rccm, 'email', o.email
            ) AS organization,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', s.id, 'name', s.name, 'phone', s.phone, 'city', s.city,
                       'district', s.district, 'status', s.status) ORDER BY s.created_at)
              FROM shops s
              WHERE s.organization_id = u.organization_id
                AND (u.role = 'owner' OR s.id = u.shop_id)
            ), '[]'::json) AS shops
     FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [userId]
  );
  if (!rows[0]) throw notFound('Utilisateur introuvable');
  return rows[0];
}

/* ------------------------------------------------------------------ */
/* Inscription d'un magasin (crée l'organisation, le magasin, le compte principal) */
/* ------------------------------------------------------------------ */
authRouter.post(
  '/register',
  authLimiter,
  validate({
    body: z.object({
      country: zText(60),
      city: zText(80),
      district: zText(80),
      shop_name: zText(120),
      contact_phone: zPhone,
      email: zEmail,
      rccm: zText(60),
      full_name: z.string().trim().max(120).optional(),
      login_phone: zPhone,
      pin: zPin
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const exists = await query(`SELECT 1 FROM users WHERE phone = $1`, [b.login_phone]);
    if (exists.rowCount) throw conflict('PHONE_TAKEN', 'Ce numéro est déjà utilisé comme identifiant');

    const pinHash = await hashSecret(b.pin);
    const user = await withTransaction(async (c) => {
      const org = await c.query(
        `INSERT INTO organizations (name, rccm, email, phone, country, city, district, status, subscription_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'trial', now() + make_interval(days => $8))
         RETURNING id`,
        [b.shop_name, b.rccm, b.email, b.contact_phone, b.country, b.city, b.district, config.TRIAL_DAYS]
      );
      const orgId = org.rows[0].id;
      await c.query(
        `INSERT INTO shops (organization_id, name, phone, email, rccm, country, city, district)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orgId, b.shop_name, b.contact_phone, b.email, b.rccm, b.country, b.city, b.district]
      );
      const u = await c.query(
        `INSERT INTO users (organization_id, role, full_name, phone, pin_hash)
         VALUES ($1, 'owner', $2, $3, $4)
         RETURNING id, role, organization_id, shop_id`,
        [orgId, b.full_name || b.shop_name, b.login_phone, pinHash]
      );
      return u.rows[0];
    });

    req.auth = { typ: 'user', sub: user.id };
    await audit(req, 'auth.register', { entity: 'organization', entityId: user.organization_id });
    const refreshToken = await issueRefreshToken('user', user.id, meta(req));
    res.status(201).json({
      access_token: userAccessToken(user),
      refresh_token: refreshToken,
      user: await loadUserProfile(user.id)
    });
  }
);

/* ------------------------------------------------------------------ */
/* Connexion mobile : téléphone + PIN, verrouillage après N échecs      */
/* ------------------------------------------------------------------ */
authRouter.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ phone: zPhone, pin: zPin }) }),
  async (req, res) => {
    const { phone, pin } = req.v.body;
    const { rows } = await query(
      `SELECT id, role, organization_id, shop_id, pin_hash, status, failed_attempts, locked_until
       FROM users WHERE phone = $1`,
      [phone]
    );
    const u = rows[0];
    if (!u) {
      await verifySecret(pin, DUMMY_HASH);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Numéro ou code PIN incorrect');
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Trop de tentatives. Compte bloqué temporairement.', {
        locked_until: u.locked_until
      });
    }
    const ok = await verifySecret(pin, u.pin_hash);
    if (!ok) {
      const attempts = u.failed_attempts + 1;
      const lock = attempts >= config.PIN_MAX_ATTEMPTS;
      await query(
        `UPDATE users
         SET failed_attempts = $2,
             locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
         WHERE id = $1`,
        [u.id, lock ? 0 : attempts, lock, config.PIN_LOCK_MINUTES]
      );
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Numéro ou code PIN incorrect', {
        remaining_attempts: lock ? 0 : config.PIN_MAX_ATTEMPTS - attempts
      });
    }
    if (u.status !== 'active') throw unauthorized('Compte désactivé');

    await query(`UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [
      u.id
    ]);
    req.auth = { typ: 'user', sub: u.id };
    await audit(req, 'auth.login', { entity: 'user', entityId: u.id });
    res.json({
      access_token: userAccessToken(u),
      refresh_token: await issueRefreshToken('user', u.id, meta(req)),
      user: await loadUserProfile(u.id)
    });
  }
);

/* ------------------------------------------------------------------ */
/* Connexion back-office : e-mail + mot de passe                        */
/* ------------------------------------------------------------------ */
authRouter.post(
  '/admin/login',
  authLimiter,
  validate({ body: z.object({ email: zEmail, password: z.string().min(1).max(200) }) }),
  async (req, res) => {
    const { email, password } = req.v.body;
    const { rows } = await query(
      `SELECT id, email, full_name, role, status, password_hash FROM admins WHERE email = $1`,
      [email]
    );
    const a = rows[0];
    const ok = await verifySecret(password, a?.password_hash ?? DUMMY_HASH);
    if (!a || !ok || a.status !== 'active') {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
    }
    await query(`UPDATE admins SET last_login_at = now() WHERE id = $1`, [a.id]);
    req.auth = { typ: 'admin', sub: a.id };
    await audit(req, 'auth.admin_login', { entity: 'admin', entityId: a.id });
    res.json({
      access_token: adminAccessToken(a),
      refresh_token: await issueRefreshToken('admin', a.id, meta(req)),
      admin: { id: a.id, email: a.email, full_name: a.full_name, role: a.role }
    });
  }
);

/* ------------------------------------------------------------------ */
/* Rafraîchissement (rotation) et déconnexion — utilisateurs et admins  */
/* ------------------------------------------------------------------ */
authRouter.post(
  '/refresh',
  validate({ body: z.object({ refresh_token: z.string().min(20).max(200) }) }),
  async (req, res) => {
    const { subjectType, subjectId, refreshToken } = await rotateRefreshToken(req.v.body.refresh_token, meta(req));
    if (subjectType === 'admin') {
      const { rows } = await query(`SELECT id, role, status FROM admins WHERE id = $1`, [subjectId]);
      if (!rows[0] || rows[0].status !== 'active') throw unauthorized('Compte désactivé');
      return res.json({ access_token: adminAccessToken(rows[0]), refresh_token: refreshToken });
    }
    const { rows } = await query(
      `SELECT id, role, organization_id, shop_id, status FROM users WHERE id = $1`,
      [subjectId]
    );
    if (!rows[0] || rows[0].status !== 'active') throw unauthorized('Compte désactivé');
    return res.json({ access_token: userAccessToken(rows[0]), refresh_token: refreshToken });
  }
);

authRouter.post(
  '/logout',
  validate({ body: z.object({ refresh_token: z.string().min(20).max(200) }) }),
  async (req, res) => {
    await revokeRefreshToken(req.v.body.refresh_token);
    res.status(204).end();
  }
);

/* ------------------------------------------------------------------ */
/* Profil et changement de PIN                                          */
/* ------------------------------------------------------------------ */
authRouter.get('/me', requireUser, async (req, res) => {
  res.json({ user: await loadUserProfile(req.auth.sub) });
});

authRouter.post(
  '/me/pin',
  requireUser,
  validate({ body: z.object({ current_pin: zPin, new_pin: zPin }) }),
  async (req, res) => {
    const { rows } = await query(`SELECT pin_hash FROM users WHERE id = $1`, [req.auth.sub]);
    if (!(await verifySecret(req.v.body.current_pin, rows[0].pin_hash))) {
      throw new AppError(400, 'INVALID_PIN', 'Code PIN actuel incorrect');
    }
    await query(`UPDATE users SET pin_hash = $2 WHERE id = $1`, [req.auth.sub, await hashSecret(req.v.body.new_pin)]);
    await revokeAllRefreshTokens('user', req.auth.sub);
    await audit(req, 'auth.pin_changed', { entity: 'user', entityId: req.auth.sub });
    res.status(204).end();
  }
);
