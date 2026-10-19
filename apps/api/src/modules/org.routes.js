import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { hashSecret, revokeAllRefreshTokens } from '../lib/security.js';
import { validate, zOptionalEmail, zPhone, zPin, zText, zUuid } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { requireOwner, requireUser } from '../middleware/auth.js';
import { OPERATORS } from '../lib/orzayah.js';
import { initiateSubscription, pollSubscription, PLAN_FCFA } from './subscription.service.js';

const zSubscribe = z.object({
  operator: z.enum(OPERATORS),
  account_number: z.string().trim().regex(/^\d{8,15}$/, 'Numéro Mobile Money invalide'),
  months: z.coerce.number().int().min(1).max(12).default(1)
});

/**
 * Espace superviseur (compte principal) : gestion des magasins et des comptes agents.
 * Un grossiste crée plusieurs magasins et un compte (téléphone + PIN) par magasin.
 */
export const orgRouter = Router();
orgRouter.use(requireUser, requireOwner);

/* ------------------------------- Profil ------------------------------- */

// Met à jour le profil marchand (numéro de compte ORZAYAH pour l'encaissement et le solde)
orgRouter.patch(
  '/profile',
  validate({ body: z.object({ orzayah_number: z.string().trim().max(40).optional().nullable() }) }),
  async (req, res) => {
    const { rows } = await query(
      `UPDATE organizations SET orzayah_number = $2 WHERE id = $1 RETURNING orzayah_number`,
      [req.auth.orgId, req.v.body.orzayah_number || null]
    );
    await audit(req, 'org.profile_updated', { entity: 'organization', entityId: req.auth.orgId });
    res.json({ orzayah_number: rows[0].orzayah_number });
  }
);

/* ---------------------- Abonnement (paiement ORZAYAH) ---------------------- */

// Tarif mensuel marchand
orgRouter.get('/subscription/plan', (req, res) => res.json({ price_fcfa: PLAN_FCFA.organization, currency: 'XOF', period: 'month' }));

// Initie le paiement de l'abonnement par dépôt Mobile Money (le marchand confirme sur son téléphone)
orgRouter.post('/subscription/orzayah', validate({ body: zSubscribe }), async (req, res) => {
  const r = await initiateSubscription({ subjectType: 'organization', subjectId: req.auth.orgId, months: req.v.body.months, operator: req.v.body.operator, accountNumber: req.v.body.account_number });
  await audit(req, 'org.subscription_initiated', { entity: 'orzayah_payment', entityId: r.payment_id });
  res.status(201).json(r);
});

// Suit le statut du paiement ; au succès l'abonnement est prolongé
orgRouter.get('/subscription/orzayah/:id', validate({ params: z.object({ id: zUuid }) }), async (req, res) => {
  const r = await pollSubscription(req.v.params.id, { subjectType: 'organization', subjectId: req.auth.orgId });
  const org = (await query(`SELECT status, subscription_expires_at FROM organizations WHERE id = $1`, [req.auth.orgId])).rows[0];
  res.json({ ...r, organization: org });
});

/* ------------------------------- Magasins ------------------------------- */

orgRouter.get('/shops', async (req, res) => {
  const { rows } = await query(
    `SELECT s.*,
            (SELECT count(*)::int FROM users u WHERE u.shop_id = s.id AND u.status = 'active') AS agents_count
     FROM shops s WHERE s.organization_id = $1 ORDER BY s.created_at`,
    [req.auth.orgId]
  );
  res.json({ items: rows });
});

const zShop = z.object({
  name: zText(120),
  phone: zPhone,
  email: zOptionalEmail,
  rccm: z.string().trim().max(60).optional().nullable(),
  country: zText(60),
  city: zText(80),
  district: zText(80),
  address: z.string().trim().max(200).optional().nullable()
});

orgRouter.post('/shops', validate({ body: zShop }), async (req, res) => {
  const b = req.v.body;
  const { rows: cnt } = await query(
    `SELECT count(*)::int AS n, (SELECT max_shops FROM organizations WHERE id = $1) AS max
     FROM shops WHERE organization_id = $1 AND status = 'active'`,
    [req.auth.orgId]
  );
  if (cnt[0].n >= cnt[0].max) {
    throw new AppError(
      402,
      'SHOP_LIMIT_REACHED',
      `Votre abonnement permet ${cnt[0].max} magasin(s). Contactez gaRAN pour en ajouter.`
    );
  }
  const { rows } = await query(
    `INSERT INTO shops (organization_id, name, phone, email, rccm, country, city, district, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.auth.orgId, b.name, b.phone, b.email, b.rccm ?? null, b.country, b.city, b.district, b.address ?? null]
  );
  await audit(req, 'org.shop_created', { entity: 'shop', entityId: rows[0].id });
  res.status(201).json(rows[0]);
});

orgRouter.patch(
  '/shops/:id',
  validate({
    params: z.object({ id: zUuid }),
    body: zShop.partial().extend({ status: z.enum(['active', 'disabled']).optional() })
  }),
  async (req, res) => {
    const fields = Object.entries(req.v.body).filter(([, v]) => v !== undefined);
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    const sets = fields.map(([k], i) => `${k} = $${i + 3}`).join(', ');
    const { rows } = await query(
      `UPDATE shops SET ${sets} WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.v.params.id, req.auth.orgId, ...fields.map(([, v]) => v)]
    );
    if (!rows[0]) throw notFound('Magasin introuvable');
    await audit(req, 'org.shop_updated', { entity: 'shop', entityId: rows[0].id, meta: { fields: fields.map(([k]) => k) } });
    res.json(rows[0]);
  }
);

/* ------------------------------ Utilisateurs ------------------------------ */

const USER_COLS = `u.id, u.role, u.full_name, u.phone, u.shop_id, u.status, u.last_login_at, u.created_at,
                   s.name AS shop_name`;

orgRouter.get('/users', async (req, res) => {
  const { rows } = await query(
    `SELECT ${USER_COLS} FROM users u LEFT JOIN shops s ON s.id = u.shop_id
     WHERE u.organization_id = $1 ORDER BY u.role DESC, u.created_at`,
    [req.auth.orgId]
  );
  res.json({ items: rows });
});

async function assertOwnShop(shopId, orgId) {
  const { rowCount } = await query(`SELECT 1 FROM shops WHERE id = $1 AND organization_id = $2`, [shopId, orgId]);
  if (!rowCount) throw badRequest('INVALID_SHOP', 'Magasin inconnu');
}

orgRouter.post(
  '/users',
  validate({ body: z.object({ full_name: zText(120), phone: zPhone, pin: zPin, shop_id: zUuid }) }),
  async (req, res) => {
    const b = req.v.body;
    await assertOwnShop(b.shop_id, req.auth.orgId);
    const exists = await query(`SELECT 1 FROM users WHERE phone = $1`, [b.phone]);
    if (exists.rowCount) throw conflict('PHONE_TAKEN', 'Ce numéro est déjà utilisé comme identifiant');
    const { rows } = await query(
      `INSERT INTO users (organization_id, shop_id, role, full_name, phone, pin_hash)
       VALUES ($1, $2, 'agent', $3, $4, $5) RETURNING id`,
      [req.auth.orgId, b.shop_id, b.full_name, b.phone, await hashSecret(b.pin)]
    );
    await audit(req, 'org.user_created', { entity: 'user', entityId: rows[0].id });
    const { rows: out } = await query(
      `SELECT ${USER_COLS} FROM users u LEFT JOIN shops s ON s.id = u.shop_id WHERE u.id = $1`,
      [rows[0].id]
    );
    res.status(201).json(out[0]);
  }
);

orgRouter.patch(
  '/users/:id',
  validate({
    params: z.object({ id: zUuid }),
    body: z.object({
      full_name: zText(120).optional(),
      shop_id: zUuid.optional(),
      status: z.enum(['active', 'disabled']).optional(),
      pin: zPin.optional()
    })
  }),
  async (req, res) => {
    const { id } = req.v.params;
    const b = req.v.body;
    const { rows: target } = await query(`SELECT id, role FROM users WHERE id = $1 AND organization_id = $2`, [
      id,
      req.auth.orgId
    ]);
    if (!target[0]) throw notFound('Utilisateur introuvable');
    if (target[0].role === 'owner' && (b.status || b.shop_id)) {
      throw badRequest('OWNER_IMMUTABLE', 'Le compte principal ne peut pas être désactivé ni déplacé');
    }
    if (b.shop_id) await assertOwnShop(b.shop_id, req.auth.orgId);

    const fields = [];
    const values = [];
    if (b.full_name) { fields.push('full_name'); values.push(b.full_name); }
    if (b.shop_id) { fields.push('shop_id'); values.push(b.shop_id); }
    if (b.status) { fields.push('status'); values.push(b.status); }
    if (b.pin) { fields.push('pin_hash'); values.push(await hashSecret(b.pin)); }
    if (b.pin || b.status === 'active') { fields.push('failed_attempts'); values.push(0); fields.push('locked_until'); values.push(null); }
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');

    await query(`UPDATE users SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...values]);
    if (b.pin || b.status === 'disabled') await revokeAllRefreshTokens('user', id);
    await audit(req, 'org.user_updated', { entity: 'user', entityId: id, meta: { fields: Object.keys(b) } });
    const { rows } = await query(`SELECT ${USER_COLS} FROM users u LEFT JOIN shops s ON s.id = u.shop_id WHERE u.id = $1`, [id]);
    res.json(rows[0]);
  }
);

/* ------------------- Supervision super marchand (mobile) ------------------- */

/** Vérifie que le compte principal connecté est bien celui d'un super marchand. */
async function requireSuperMerchant(req, res, next) {
  const { rows } = await query(`SELECT type FROM organizations WHERE id = $1`, [req.auth.orgId]);
  if (!rows[0] || rows[0].type !== 'super_merchant') {
    throw new AppError(403, 'NOT_SUPER_MERCHANT', 'Réservé aux super marchands');
  }
  next();
}

/** Tableau de bord consolidé du super marchand : états de tous ses sous-marchands. */
orgRouter.get('/overview', requireSuperMerchant, async (req, res) => {
  const { from, to } = req.query;
  const period = ['stock_in', 'sale', 'purchase'];
  const [totals, children] = await Promise.all([
    query(
      `SELECT t.type, count(*)::int AS count, COALESCE(sum(t.price), 0) AS amount
       FROM transactions t
       WHERE t.organization_id IN (SELECT id FROM organizations WHERE parent_id = $1)
         AND ($2::timestamptz IS NULL OR t.occurred_at >= $2)
         AND ($3::timestamptz IS NULL OR t.occurred_at < $3)
       GROUP BY t.type`,
      [req.auth.orgId, from ? new Date(from) : null, to ? new Date(to) : null]
    ),
    query(
      `SELECT o.id, o.name, o.status, o.city, o.district, o.subscription_expires_at,
              COALESCE((SELECT count(*)::int FROM transactions t WHERE t.organization_id = o.id AND t.type = 'sale'
                 AND ($2::timestamptz IS NULL OR t.occurred_at >= $2) AND ($3::timestamptz IS NULL OR t.occurred_at < $3)), 0) AS sales_count,
              COALESCE((SELECT sum(price) FROM transactions t WHERE t.organization_id = o.id AND t.type = 'sale'
                 AND ($2::timestamptz IS NULL OR t.occurred_at >= $2) AND ($3::timestamptz IS NULL OR t.occurred_at < $3)), 0) AS sales_amount
       FROM organizations o WHERE o.parent_id = $1 ORDER BY o.created_at`,
      [req.auth.orgId, from ? new Date(from) : null, to ? new Date(to) : null]
    )
  ]);
  const by = Object.fromEntries(period.map((t) => [t, totals.rows.find((r) => r.type === t) ?? { count: 0, amount: 0 }]));
  res.json({
    sub_merchants: children.rows.length,
    sale: by.sale,
    purchase: by.purchase,
    stock_in: by.stock_in,
    children: children.rows
  });
});
