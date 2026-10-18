import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { hashSecret, revokeAllRefreshTokens } from '../lib/security.js';
import { audit } from '../lib/audit.js';
import { validate, zEmail, zOptionalEmail, zPhone, zPin, zText, zUuid } from '../lib/validate.js';
import { requireAdmin } from '../middleware/auth.js';

/**
 * Gestion des clients depuis le back-office.
 *
 *  Organisation (compte client)
 *   ├─ type « merchant »        : marchand simple — une boutique et son compte de connexion
 *   └─ type « super_merchant »  : super marchand / grossiste — un compte principal (superviseur)
 *                                 et plusieurs sous-comptes CLIENT (une boutique + son compte chacun)
 *
 * Toutes les connexions mobiles se font par téléphone (login) + code PIN à 4 chiffres.
 */
export const adminClientsRouter = Router();

const STAFF = ['superadmin', 'admin'];

const zOrgType = z.enum(['merchant', 'super_merchant']);
const zLocation = {
  country: zText(60),
  city: zText(80),
  district: zText(80)
};
const zAccount = z.object({
  full_name: zText(120),
  phone: zPhone,
  pin: zPin
});
const zShopFields = z.object({
  name: zText(120),
  phone: zPhone,
  email: zOptionalEmail,
  rccm: z.string().trim().max(60).optional().nullable(),
  ...zLocation,
  address: z.string().trim().max(200).optional().nullable()
});

async function assertPhoneFree(client, phone, exceptUserId = null) {
  const { rows } = await client.query(`SELECT id FROM users WHERE phone = $1`, [phone]);
  if (rows[0] && rows[0].id !== exceptUserId) {
    throw conflict('PHONE_TAKEN', `Le numéro ${phone} est déjà utilisé comme identifiant`);
  }
}

async function insertShop(client, orgId, s) {
  const { rows } = await client.query(
    `INSERT INTO shops (organization_id, name, phone, email, rccm, country, city, district, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [orgId, s.name, s.phone, s.email ?? null, s.rccm ?? null, s.country, s.city, s.district, s.address ?? null]
  );
  return rows[0];
}

async function insertUser(client, { orgId, shopId, role, account }) {
  const { rows } = await client.query(
    `INSERT INTO users (organization_id, shop_id, role, full_name, phone, pin_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, role, full_name, phone, shop_id, status`,
    [orgId, shopId, role, account.full_name, account.phone, await hashSecret(account.pin)]
  );
  return rows[0];
}

/* ===================================================================== */
/* Organisations : création, modification, suppression                    */
/* ===================================================================== */

/**
 * Crée un compte client complet.
 * - merchant       : organisation + sa boutique + son compte (login téléphone + PIN)
 * - super_merchant : organisation + compte principal (superviseur) ; les sous-comptes CLIENT
 *                    s'ajoutent ensuite (ou dès la création via `clients`)
 */
adminClientsRouter.post(
  '/organizations',
  requireAdmin(...STAFF),
  validate({
    body: z.object({
      type: zOrgType,
      name: zText(120),
      rccm: zText(60),
      email: zEmail,
      phone: zPhone,
      ...zLocation,
      status: z.enum(['trial', 'active']).default('trial'),
      max_shops: z.coerce.number().int().min(1).max(1000).optional(),
      subscription_expires_at: z.coerce.date().optional().nullable(),
      owner: zAccount
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const maxShops = b.type === 'merchant' ? 1 : (b.max_shops ?? 5);
    const result = await withTransaction(async (c) => {
      await assertPhoneFree(c, b.owner.phone);
      const org = await c.query(
        `INSERT INTO organizations (type, name, rccm, email, phone, country, city, district, status, max_shops,
                                    subscription_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 COALESCE($11, now() + make_interval(days => $12)))
         RETURNING *`,
        [b.type, b.name, b.rccm, b.email, b.phone, b.country, b.city, b.district, b.status, maxShops,
         b.subscription_expires_at ?? null, config.TRIAL_DAYS]
      );
      const o = org.rows[0];
      let shopId = null;
      if (b.type === 'merchant') {
        const shop = await insertShop(c, o.id, { name: b.name, phone: b.phone, email: b.email, rccm: b.rccm, country: b.country, city: b.city, district: b.district });
        shopId = shop.id;
      }
      const owner = await insertUser(c, { orgId: o.id, shopId: null, role: 'owner', account: b.owner });
      return { organization: o, owner, shop_id: shopId };
    });
    await audit(req, 'admin.organization_created', { entity: 'organization', entityId: result.organization.id, meta: { type: b.type } });
    res.status(201).json(result);
  }
);

adminClientsRouter.patch(
  '/organizations/:id',
  requireAdmin(...STAFF),
  validate({
    params: z.object({ id: zUuid }),
    body: z.object({
      type: zOrgType.optional(),
      name: zText(120).optional(),
      rccm: zText(60).optional(),
      email: zEmail.optional(),
      phone: zPhone.optional(),
      country: zText(60).optional(),
      city: zText(80).optional(),
      district: zText(80).optional(),
      status: z.enum(['trial', 'active', 'suspended', 'expired']).optional(),
      plan: zText(40).optional(),
      max_shops: z.coerce.number().int().min(1).max(1000).optional(),
      subscription_expires_at: z.coerce.date().nullable().optional()
    })
  }),
  async (req, res) => {
    const { id } = req.v.params;
    const fields = Object.entries(req.v.body).filter(([, v]) => v !== undefined);
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    const b = req.v.body;
    if (b.type === 'merchant' || (b.max_shops !== undefined)) {
      const { rows } = await query(
        `SELECT o.type, (SELECT count(*)::int FROM shops s WHERE s.organization_id = o.id AND s.status = 'active') AS active_shops
         FROM organizations o WHERE o.id = $1`,
        [id]
      );
      if (!rows[0]) throw notFound('Organisation introuvable');
      const targetType = b.type ?? rows[0].type;
      const targetMax = targetType === 'merchant' ? 1 : (b.max_shops ?? undefined);
      if (targetMax !== undefined && rows[0].active_shops > targetMax) {
        throw conflict('TOO_MANY_SHOPS', `Ce client a ${rows[0].active_shops} boutiques actives : désactivez-en avant de réduire la limite`);
      }
      if (targetType === 'merchant') {
        const i = fields.findIndex(([k]) => k === 'max_shops');
        if (i >= 0) fields[i] = ['max_shops', 1];
        else fields.push(['max_shops', 1]);
      }
    }
    const { rows } = await query(
      `UPDATE organizations SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...fields.map(([, v]) => v)]
    );
    if (!rows[0]) throw notFound('Organisation introuvable');
    if (b.status === 'suspended') {
      await query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE subject_type = 'user' AND revoked_at IS NULL
           AND subject_id IN (SELECT id FROM users WHERE organization_id = $1)`,
        [id]
      );
    }
    await audit(req, 'admin.organization_updated', { entity: 'organization', entityId: id, meta: { fields: fields.map(([k]) => k) } });
    res.json(rows[0]);
  }
);

/** Suppression définitive : uniquement pour un compte sans aucune opération ni paiement. */
adminClientsRouter.delete(
  '/organizations/:id',
  requireAdmin('superadmin'),
  validate({ params: z.object({ id: zUuid }) }),
  async (req, res) => {
    const { id } = req.v.params;
    await withTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT
           (SELECT count(*)::int FROM transactions WHERE organization_id = $1) AS tx,
           (SELECT count(*)::int FROM subscription_payments WHERE organization_id = $1) AS pay,
           (SELECT count(*)::int FROM security_alerts a JOIN shops s ON s.id = a.shop_id WHERE s.organization_id = $1) AS alerts,
           (SELECT count(*)::int FROM devices d JOIN shops s ON s.id = d.owner_shop_id WHERE s.organization_id = $1) AS stock,
           EXISTS (SELECT 1 FROM organizations WHERE id = $1) AS exists`,
        [id]
      );
      const r = rows[0];
      if (!r.exists) throw notFound('Organisation introuvable');
      if (r.tx || r.pay || r.alerts || r.stock) {
        throw conflict(
          'HAS_HISTORY',
          'Ce client a déjà un historique (opérations, paiements ou alertes) : il ne peut pas être supprimé. Suspendez-le à la place.'
        );
      }
      await c.query(
        `DELETE FROM refresh_tokens WHERE subject_type = 'user' AND subject_id IN (SELECT id FROM users WHERE organization_id = $1)`,
        [id]
      );
      await c.query(`UPDATE persons SET created_by_shop_id = NULL WHERE created_by_shop_id IN (SELECT id FROM shops WHERE organization_id = $1)`, [id]);
      await c.query(`DELETE FROM users WHERE organization_id = $1`, [id]);
      await c.query(`DELETE FROM shops WHERE organization_id = $1`, [id]);
      await c.query(`DELETE FROM organizations WHERE id = $1`, [id]);
    });
    await audit(req, 'admin.organization_deleted', { entity: 'organization', entityId: id });
    res.status(204).end();
  }
);

/* ===================================================================== */
/* Sous-comptes CLIENT : une boutique + son compte de connexion           */
/* ===================================================================== */

adminClientsRouter.post(
  '/organizations/:id/clients',
  requireAdmin(...STAFF),
  validate({ params: z.object({ id: zUuid }), body: z.object({ shop: zShopFields, account: zAccount }) }),
  async (req, res) => {
    const { id } = req.v.params;
    const { shop, account } = req.v.body;
    const out = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT o.id, o.type, o.max_shops,
                (SELECT count(*)::int FROM shops s WHERE s.organization_id = o.id AND s.status = 'active') AS active_shops
         FROM organizations o WHERE o.id = $1 FOR UPDATE`,
        [id]
      );
      const o = rows[0];
      if (!o) throw notFound('Organisation introuvable');
      if (o.active_shops >= o.max_shops) {
        throw new AppError(
          402,
          'SHOP_LIMIT_REACHED',
          o.type === 'merchant'
            ? 'Un marchand simple n’a qu’une boutique : passez-le en super marchand pour ajouter des sous-comptes.'
            : `Limite atteinte (${o.max_shops} boutiques) : augmentez « Boutiques autorisées » dans l’abonnement.`
        );
      }
      await assertPhoneFree(c, account.phone);
      const s = await insertShop(c, id, shop);
      const u = await insertUser(c, { orgId: id, shopId: s.id, role: 'agent', account });
      return { shop: s, user: u };
    });
    await audit(req, 'admin.client_created', { entity: 'shop', entityId: out.shop.id, meta: { organization_id: id } });
    res.status(201).json(out);
  }
);

adminClientsRouter.patch(
  '/shops/:id',
  requireAdmin(...STAFF),
  validate({
    params: z.object({ id: zUuid }),
    body: zShopFields.partial().extend({ status: z.enum(['active', 'disabled']).optional() })
  }),
  async (req, res) => {
    const { id } = req.v.params;
    const fields = Object.entries(req.v.body).filter(([, v]) => v !== undefined);
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    if (req.v.body.status === 'active') {
      const { rows } = await query(
        `SELECT o.max_shops,
                (SELECT count(*)::int FROM shops x WHERE x.organization_id = o.id AND x.status = 'active') AS active_shops,
                s.status
         FROM shops s JOIN organizations o ON o.id = s.organization_id WHERE s.id = $1`,
        [id]
      );
      if (rows[0] && rows[0].status !== 'active' && rows[0].active_shops >= rows[0].max_shops) {
        throw new AppError(402, 'SHOP_LIMIT_REACHED', 'Limite de boutiques atteinte pour ce client');
      }
    }
    const { rows } = await query(
      `UPDATE shops SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...fields.map(([, v]) => v)]
    );
    if (!rows[0]) throw notFound('Boutique introuvable');
    if (req.v.body.status === 'disabled') {
      await query(`UPDATE users SET status = 'disabled' WHERE shop_id = $1 AND role = 'agent'`, [id]);
      await query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE subject_type = 'user' AND revoked_at IS NULL
           AND subject_id IN (SELECT id FROM users WHERE shop_id = $1)`,
        [id]
      );
    }
    await audit(req, 'admin.shop_updated', { entity: 'shop', entityId: id, meta: { fields: fields.map(([k]) => k) } });
    res.json(rows[0]);
  }
);

adminClientsRouter.delete(
  '/shops/:id',
  requireAdmin(...STAFF),
  validate({ params: z.object({ id: zUuid }) }),
  async (req, res) => {
    const { id } = req.v.params;
    await withTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT
           EXISTS (SELECT 1 FROM shops WHERE id = $1) AS exists,
           (SELECT count(*)::int FROM transactions WHERE shop_id = $1) AS tx,
           (SELECT count(*)::int FROM security_alerts WHERE shop_id = $1) AS alerts,
           (SELECT count(*)::int FROM devices WHERE owner_shop_id = $1) AS stock`,
        [id]
      );
      const r = rows[0];
      if (!r.exists) throw notFound('Boutique introuvable');
      if (r.tx || r.alerts || r.stock) {
        throw conflict('HAS_HISTORY', 'Cette boutique a déjà des opérations : elle ne peut pas être supprimée. Désactivez-la à la place.');
      }
      await c.query(
        `DELETE FROM refresh_tokens WHERE subject_type = 'user' AND subject_id IN (SELECT id FROM users WHERE shop_id = $1 AND role = 'agent')`,
        [id]
      );
      await c.query(`DELETE FROM users WHERE shop_id = $1 AND role = 'agent'`, [id]);
      await c.query(`UPDATE users SET shop_id = NULL WHERE shop_id = $1`, [id]);
      await c.query(`UPDATE persons SET created_by_shop_id = NULL WHERE created_by_shop_id = $1`, [id]);
      await c.query(`DELETE FROM shops WHERE id = $1`, [id]);
    });
    await audit(req, 'admin.shop_deleted', { entity: 'shop', entityId: id });
    res.status(204).end();
  }
);

/* ===================================================================== */
/* Comptes de connexion mobiles (login téléphone + PIN)                   */
/* ===================================================================== */

/** Ajoute un compte vendeur supplémentaire à une boutique existante. */
adminClientsRouter.post(
  '/shops/:id/users',
  requireAdmin(...STAFF),
  validate({ params: z.object({ id: zUuid }), body: zAccount }),
  async (req, res) => {
    const user = await withTransaction(async (c) => {
      const { rows } = await c.query(`SELECT id, organization_id FROM shops WHERE id = $1`, [req.v.params.id]);
      if (!rows[0]) throw notFound('Boutique introuvable');
      await assertPhoneFree(c, req.v.body.phone);
      return insertUser(c, { orgId: rows[0].organization_id, shopId: rows[0].id, role: 'agent', account: req.v.body });
    });
    await audit(req, 'admin.user_created', { entity: 'user', entityId: user.id });
    res.status(201).json(user);
  }
);

adminClientsRouter.patch(
  '/users/:id',
  requireAdmin(...STAFF),
  validate({
    params: z.object({ id: zUuid }),
    body: z.object({
      full_name: zText(120).optional(),
      phone: zPhone.optional(),
      pin: zPin.optional(),
      status: z.enum(['active', 'disabled']).optional(),
      shop_id: zUuid.optional(),
      unlock: z.boolean().optional()
    })
  }),
  async (req, res) => {
    const { id } = req.v.params;
    const b = req.v.body;
    const updated = await withTransaction(async (c) => {
      const { rows } = await c.query(`SELECT id, role, organization_id FROM users WHERE id = $1 FOR UPDATE`, [id]);
      const u = rows[0];
      if (!u) throw notFound('Compte introuvable');
      if (u.role === 'owner' && b.shop_id) throw badRequest('OWNER_NO_SHOP', 'Le compte principal couvre toutes les boutiques');
      if (b.phone) await assertPhoneFree(c, b.phone, id);
      if (b.shop_id) {
        const s = await c.query(`SELECT 1 FROM shops WHERE id = $1 AND organization_id = $2`, [b.shop_id, u.organization_id]);
        if (!s.rowCount) throw badRequest('INVALID_SHOP', 'Cette boutique n’appartient pas au même client');
      }
      const sets = [];
      const vals = [];
      const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length + 1}`); };
      if (b.full_name) set('full_name', b.full_name);
      if (b.phone) set('phone', b.phone);
      if (b.shop_id) set('shop_id', b.shop_id);
      if (b.status) set('status', b.status);
      if (b.pin) set('pin_hash', await hashSecret(b.pin));
      if (b.pin || b.unlock || b.status === 'active') { set('failed_attempts', 0); set('locked_until', null); }
      if (!sets.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
      const out = await c.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $1
         RETURNING id, role, full_name, phone, shop_id, status, locked_until, last_login_at`,
        [id, ...vals]
      );
      return out.rows[0];
    });
    if (b.pin || b.phone || b.status === 'disabled') await revokeAllRefreshTokens('user', id);
    await audit(req, 'admin.user_updated', { entity: 'user', entityId: id, meta: { fields: Object.keys(b) } });
    res.json(updated);
  }
);

adminClientsRouter.delete(
  '/users/:id',
  requireAdmin(...STAFF),
  validate({ params: z.object({ id: zUuid }) }),
  async (req, res) => {
    const { id } = req.v.params;
    await withTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT u.role,
                (SELECT count(*)::int FROM transactions WHERE user_id = u.id) AS tx,
                (SELECT count(*)::int FROM security_alerts WHERE user_id = u.id) AS alerts
         FROM users u WHERE u.id = $1`,
        [id]
      );
      const u = rows[0];
      if (!u) throw notFound('Compte introuvable');
      if (u.role === 'owner') throw badRequest('OWNER_UNDELETABLE', 'Le compte principal ne peut pas être supprimé (supprimez le client entier)');
      if (u.tx || u.alerts) {
        throw conflict('HAS_HISTORY', 'Ce compte a enregistré des opérations : il ne peut pas être supprimé. Désactivez-le à la place.');
      }
      await c.query(`DELETE FROM refresh_tokens WHERE subject_type = 'user' AND subject_id = $1`, [id]);
      await c.query(`DELETE FROM users WHERE id = $1`, [id]);
    });
    await audit(req, 'admin.user_deleted', { entity: 'user', entityId: id });
    res.status(204).end();
  }
);
