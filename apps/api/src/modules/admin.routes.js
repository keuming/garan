import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { hashSecret, revokeAllRefreshTokens, verifySecret } from '../lib/security.js';
import { storage } from '../lib/storage.js';
import { audit } from '../lib/audit.js';
import { validate, zEmail, zImei, zPagination, zText, zUuid } from '../lib/validate.js';
import { requireAdmin } from '../middleware/auth.js';

/**
 * Back-office du promoteur gaRAN.
 * Rôles : superadmin (tout), admin (exploitation), support (lecture clients),
 *         police (enquêtes : historique IMEI, pièces d'identité, alertes).
 */
export const adminRouter = Router();

const ALL = ['superadmin', 'admin', 'support', 'police'];
const STAFF = ['superadmin', 'admin'];
const READERS = ['superadmin', 'admin', 'support'];
const INVESTIGATORS = ['superadmin', 'admin', 'police'];

const paginate = (page, limit) => `LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

adminRouter.get('/me', requireAdmin(...ALL), (req, res) => res.json({ admin: req.admin }));

/* ------------------------------ Mon profil ------------------------------ */

/** Modifie son propre nom et/ou son e-mail de connexion (le mot de passe actuel est exigé). */
adminRouter.patch(
  '/me',
  requireAdmin(...ALL),
  validate({
    body: z.object({
      full_name: zText(120).optional(),
      email: zEmail.optional(),
      current_password: z.string().min(1, 'Mot de passe actuel requis').max(200)
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const { rows } = await query(`SELECT password_hash FROM admins WHERE id = $1`, [req.auth.sub]);
    if (!(await verifySecret(b.current_password, rows[0].password_hash))) {
      throw new AppError(400, 'INVALID_PASSWORD', 'Mot de passe actuel incorrect');
    }
    if (b.email) {
      const taken = await query(`SELECT 1 FROM admins WHERE email = $1 AND id <> $2`, [b.email, req.auth.sub]);
      if (taken.rowCount) throw conflict('EMAIL_TAKEN', 'Cet e-mail est déjà utilisé');
    }
    const fields = Object.entries({ full_name: b.full_name, email: b.email }).filter(([, v]) => v);
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    const { rows: out } = await query(
      `UPDATE admins SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1
       RETURNING id, email, full_name, role, status`,
      [req.auth.sub, ...fields.map(([, v]) => v)]
    );
    await audit(req, 'admin.profile_updated', { entity: 'admin', entityId: req.auth.sub, meta: { fields: fields.map(([k]) => k) } });
    res.json({ admin: out[0] });
  }
);

/** Change son propre mot de passe ; toutes les autres sessions sont fermées. */
adminRouter.post(
  '/me/password',
  requireAdmin(...ALL),
  validate({
    body: z
      .object({
        current_password: z.string().min(1).max(200),
        new_password: z.string().min(10, 'Nouveau mot de passe : 10 caractères minimum').max(200)
      })
      .refine((v) => v.current_password !== v.new_password, { message: 'Le nouveau mot de passe doit être différent', path: ['new_password'] })
  }),
  async (req, res) => {
    const { rows } = await query(`SELECT password_hash FROM admins WHERE id = $1`, [req.auth.sub]);
    if (!(await verifySecret(req.v.body.current_password, rows[0].password_hash))) {
      throw new AppError(400, 'INVALID_PASSWORD', 'Mot de passe actuel incorrect');
    }
    await query(`UPDATE admins SET password_hash = $2 WHERE id = $1`, [req.auth.sub, await hashSecret(req.v.body.new_password)]);
    await revokeAllRefreshTokens('admin', req.auth.sub);
    await audit(req, 'admin.password_changed', { entity: 'admin', entityId: req.auth.sub });
    res.status(204).end();
  }
);

/* ------------------------------ Tableau de bord ------------------------------ */

adminRouter.get('/dashboard', requireAdmin(...ALL), async (_req, res) => {
  const { rows } = await query(`
    SELECT
      (SELECT count(*)::int FROM organizations) AS organizations,
      (SELECT count(*)::int FROM organizations WHERE status = 'active') AS organizations_active,
      (SELECT count(*)::int FROM organizations WHERE status = 'trial') AS organizations_trial,
      (SELECT count(*)::int FROM organizations
         WHERE status IN ('trial','active') AND subscription_expires_at < now() + interval '7 days') AS expiring_soon,
      (SELECT count(*)::int FROM shops WHERE status = 'active') AS shops,
      (SELECT count(*)::int FROM devices) AS devices,
      (SELECT count(*)::int FROM devices WHERE status <> 'active') AS devices_reported,
      (SELECT count(*)::int FROM transactions WHERE occurred_at >= date_trunc('day', now())) AS transactions_today,
      (SELECT count(*)::int FROM transactions WHERE occurred_at >= now() - interval '30 days') AS transactions_30d,
      (SELECT COALESCE(sum(price), 0) FROM transactions WHERE type = 'sale' AND occurred_at >= now() - interval '30 days') AS sales_amount_30d,
      (SELECT count(*)::int FROM theft_reports WHERE status = 'pending') AS theft_reports_pending,
      (SELECT count(*)::int FROM security_alerts WHERE status = 'open') AS alerts_open,
      (SELECT COALESCE(sum(amount), 0) FROM subscription_payments WHERE paid_at >= date_trunc('month', now())) AS revenue_month
  `);
  const daily = await query(`
    SELECT to_char(day, 'YYYY-MM-DD') AS day,
           count(t.id) FILTER (WHERE t.type = 'sale')::int AS sales,
           count(t.id) FILTER (WHERE t.type = 'purchase')::int AS purchases
    FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS day
    LEFT JOIN transactions t ON t.occurred_at >= day AND t.occurred_at < day + interval '1 day'
    GROUP BY day ORDER BY day`);
  res.json({ ...rows[0], daily: daily.rows });
});

/* ------------------------------- Organisations ------------------------------- */

adminRouter.get(
  '/organizations',
  requireAdmin(...READERS),
  validate({
    query: z.object({
      q: z.string().trim().max(80).optional(),
      status: z.enum(['trial', 'active', 'suspended', 'expired']).optional(),
      type: z.enum(['merchant', 'super_merchant']).optional(),
      parent_id: zUuid.optional(),
      ...zPagination
    })
  }),
  async (req, res) => {
    const { q, status, type, parent_id: parentId, page, limit } = req.v.query;
    const params = [];
    const cond = ['true'];
    if (q) {
      params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
      cond.push(`(o.name ILIKE $${params.length} OR o.phone ILIKE $${params.length} OR o.rccm ILIKE $${params.length} OR o.city ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      cond.push(`o.status = $${params.length}`);
    }
    if (type) {
      params.push(type);
      cond.push(`o.type = $${params.length}`);
    }
    if (parentId) {
      params.push(parentId);
      cond.push(`o.parent_id = $${params.length}`);
    }
    const where = cond.join(' AND ');
    const [items, total] = await Promise.all([
      query(
        `SELECT o.*,
                p.name AS parent_name,
                (SELECT count(*)::int FROM shops s WHERE s.organization_id = o.id) AS shops_count,
                (SELECT count(*)::int FROM organizations c WHERE c.parent_id = o.id) AS sub_merchants_count,
                (SELECT count(*)::int FROM transactions t WHERE t.organization_id = o.id
                   AND t.occurred_at >= now() - interval '30 days') AS transactions_30d
         FROM organizations o LEFT JOIN organizations p ON p.id = o.parent_id
         WHERE ${where} ORDER BY o.created_at DESC ${paginate(page, limit)}`,
        params
      ),
      query(`SELECT count(*)::int AS n FROM organizations o WHERE ${where}`, params)
    ]);
    res.json({ items: items.rows, total: total.rows[0].n, page, limit });
  }
);

adminRouter.get(
  '/organizations/:id',
  requireAdmin(...READERS),
  validate({ params: z.object({ id: zUuid }) }),
  async (req, res) => {
    const { id } = req.v.params;
    const org = await query(
      `SELECT o.*, p.name AS parent_name, p.type AS parent_type FROM organizations o
       LEFT JOIN organizations p ON p.id = o.parent_id WHERE o.id = $1`,
      [id]
    );
    if (!org.rows[0]) throw notFound('Organisation introuvable');
    // Sous-marchands (pour un super marchand) + leurs états consolidés sur 30 jours
    const [children, childStats] = await Promise.all([
      query(
        `SELECT o.id, o.name, o.type, o.status, o.phone, o.city, o.district, o.subscription_expires_at, o.created_at,
                (SELECT count(*)::int FROM transactions t WHERE t.organization_id = o.id
                   AND t.occurred_at >= now() - interval '30 days') AS transactions_30d
         FROM organizations o WHERE o.parent_id = $1 ORDER BY o.created_at`,
        [id]
      ),
      query(
        `SELECT type, count(*)::int AS count, COALESCE(sum(price), 0) AS amount
         FROM transactions WHERE organization_id IN (SELECT id FROM organizations WHERE parent_id = $1)
           AND occurred_at >= now() - interval '30 days'
         GROUP BY type`,
        [id]
      )
    ]);
    const [shops, users, payments, stats] = await Promise.all([
      query(
        `SELECT s.*,
                (SELECT count(*)::int FROM users u WHERE u.shop_id = s.id AND u.role = 'agent') AS accounts_count,
                (SELECT count(*)::int FROM transactions t WHERE t.shop_id = s.id) AS transactions_count
         FROM shops s WHERE s.organization_id = $1 ORDER BY s.created_at`,
        [id]
      ),
      query(
        `SELECT u.id, u.role, u.full_name, u.phone, u.status, u.last_login_at, u.shop_id, u.locked_until,
                s.name AS shop_name,
                (SELECT count(*)::int FROM transactions t WHERE t.user_id = u.id) AS transactions_count
         FROM users u LEFT JOIN shops s ON s.id = u.shop_id WHERE u.organization_id = $1 ORDER BY u.role DESC, u.created_at`,
        [id]
      ),
      query(
        `SELECT sp.*, a.full_name AS recorded_by_name FROM subscription_payments sp
         LEFT JOIN admins a ON a.id = sp.recorded_by WHERE sp.organization_id = $1 ORDER BY sp.paid_at DESC`,
        [id]
      ),
      query(
        `SELECT type, count(*)::int AS count, COALESCE(sum(price), 0) AS amount
         FROM transactions WHERE organization_id = $1 AND occurred_at >= now() - interval '30 days'
         GROUP BY type`,
        [id]
      )
    ]);
    res.json({
      ...org.rows[0],
      shops: shops.rows,
      users: users.rows,
      payments: payments.rows,
      stats_30d: stats.rows,
      children: children.rows,
      children_stats_30d: childStats.rows
    });
  }
);

adminRouter.post(
  '/organizations/:id/payments',
  requireAdmin(...STAFF),
  validate({
    params: z.object({ id: zUuid }),
    body: z.object({
      amount: z.coerce.number().int().min(0),
      months: z.coerce.number().int().min(1).max(36),
      method: z.enum(['cash', 'mobile_money', 'bank', 'other']),
      reference: z.string().trim().max(80).optional().nullable()
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const out = await withTransaction(async (c) => {
      const org = await c.query(`SELECT id, subscription_expires_at FROM organizations WHERE id = $1 FOR UPDATE`, [
        req.v.params.id
      ]);
      if (!org.rows[0]) throw notFound('Organisation introuvable');
      const pay = await c.query(
        `INSERT INTO subscription_payments (organization_id, amount, months, method, reference, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.v.params.id, b.amount, b.months, b.method, b.reference ?? null, req.auth.sub]
      );
      // Prolongation à partir de la date la plus tardive entre aujourd'hui et l'échéance actuelle
      const updated = await c.query(
        `UPDATE organizations
         SET status = 'active',
             subscription_expires_at = GREATEST(COALESCE(subscription_expires_at, now()), now()) + make_interval(months => $2)
         WHERE id = $1 RETURNING *`,
        [req.v.params.id, b.months]
      );
      return { payment: pay.rows[0], organization: updated.rows[0] };
    });
    await audit(req, 'admin.payment_recorded', { entity: 'organization', entityId: req.v.params.id, meta: b });
    res.status(201).json(out);
  }
);

/* ---------------------- Téléphones vendus (registre) ---------------------- */

// Liste des ventes : IMEI, acquéreur (nom, contacts, n° de CNI), boutique, date.
adminRouter.get(
  '/sales',
  requireAdmin(...INVESTIGATORS),
  validate({
    query: z.object({
      q: z.string().trim().max(60).optional(),
      organization_id: zUuid.optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      ...zPagination
    })
  }),
  async (req, res) => {
    const { q, organization_id: orgId, from, to, page, limit } = req.v.query;
    const params = [];
    const cond = ["t.type = 'sale'"];
    const add = (sql, v) => {
      params.push(v);
      return sql.replace('?', `$${params.length}`);
    };
    if (orgId) cond.push(add('t.organization_id = ?', orgId));
    if (from) cond.push(add('t.occurred_at >= ?', from));
    if (to) cond.push(add('t.occurred_at < ?', to));
    if (q) {
      const term = q.trim().replace(/[%_\\]/g, '\\$&');
      params.push(term);
      const i = params.length;
      cond.push(
        /^\d{4,15}$/.test(term)
          ? `(d.imei1 LIKE $${i} || '%' OR d.imei2 LIKE $${i} || '%' OR p.phone1 LIKE '%' || $${i} || '%')`
          : `(p.full_name ILIKE '%' || $${i} || '%' OR p.id_doc_number ILIKE $${i} || '%' OR t.receipt_number ILIKE $${i} || '%')`
      );
    }
    const where = cond.join(' AND ');
    const base = `FROM transactions t
      JOIN devices d ON d.id = t.device_id
      LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
      JOIN persons p ON p.id = t.person_id
      JOIN shops s ON s.id = t.shop_id
      JOIN organizations o ON o.id = t.organization_id
      WHERE ${where}`;
    const [items, total] = await Promise.all([
      query(
        `SELECT t.id, t.receipt_number, t.occurred_at, t.price, t.condition,
                d.imei1, d.imei2, d.status AS device_status,
                b.name AS brand, COALESCE(m.name, d.model_label) AS model,
                p.full_name AS buyer_name, p.phone1 AS buyer_phone1, p.phone2 AS buyer_phone2,
                p.id_doc_type AS buyer_id_doc_type, p.id_doc_number AS buyer_id_doc_number,
                (d.owner_type = 'person' AND d.owner_person_id = p.id) AS is_current_owner,
                s.name AS shop_name, o.name AS organization_name
         ${base} ORDER BY t.occurred_at DESC ${paginate(page, limit)}`,
        params
      ),
      query(`SELECT count(*)::int AS n ${base}`, params)
    ]);
    await audit(req, 'admin.sales_list', { meta: { q: q ?? null, count: items.rows.length } });
    res.json({ items: items.rows, total: total.rows[0].n, page, limit });
  }
);

/* ---------------------- Enquête : historique d'un IMEI ---------------------- */

adminRouter.get(
  '/devices/:imei',
  requireAdmin(...INVESTIGATORS),
  validate({ params: z.object({ imei: zImei }) }),
  async (req, res) => {
    const { rows } = await query(
      `SELECT d.*, b.name AS brand_name, COALESCE(m.name, d.model_label) AS model_name,
              os.name AS owner_shop_name,
              CASE WHEN op.id IS NULL THEN NULL ELSE json_build_object(
                'id', op.id, 'full_name', op.full_name, 'phone1', op.phone1, 'phone2', op.phone2, 'email', op.email,
                'id_doc_type', op.id_doc_type, 'id_doc_number', op.id_doc_number,
                'id_doc_front_key', op.id_doc_front_key, 'id_doc_back_key', op.id_doc_back_key) END AS owner_person
       FROM devices d
       LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
       LEFT JOIN shops os ON os.id = d.owner_shop_id
       LEFT JOIN persons op ON op.id = d.owner_person_id
       WHERE d.imei1 = $1 OR d.imei2 = $1`,
      [req.v.params.imei]
    );
    const device = rows[0] ?? null;
    const [history, reports, alerts] = await Promise.all([
      device
        ? query(
            `SELECT t.id, t.receipt_number, t.type, t.condition, t.price, t.occurred_at, t.supplier_name,
                    s.name AS shop_name, s.phone AS shop_phone, s.city AS shop_city, s.district AS shop_district,
                    o.name AS organization_name, u.full_name AS recorded_by,
                    CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object(
                      'id', p.id, 'full_name', p.full_name, 'phone1', p.phone1, 'phone2', p.phone2, 'email', p.email,
                      'id_doc_type', p.id_doc_type, 'id_doc_number', p.id_doc_number,
                      'id_doc_front_key', p.id_doc_front_key, 'id_doc_back_key', p.id_doc_back_key) END AS person
             FROM transactions t
             JOIN shops s ON s.id = t.shop_id JOIN organizations o ON o.id = t.organization_id
             JOIN users u ON u.id = t.user_id LEFT JOIN persons p ON p.id = t.person_id
             WHERE t.device_id = $1 ORDER BY t.occurred_at DESC`,
            [device.id]
          )
        : { rows: [] },
      query(`SELECT * FROM theft_reports WHERE imei = $1 ORDER BY created_at DESC`, [req.v.params.imei]),
      query(
        `SELECT a.*, s.name AS shop_name FROM security_alerts a LEFT JOIN shops s ON s.id = a.shop_id
         WHERE a.imei = $1 ORDER BY a.created_at DESC`,
        [req.v.params.imei]
      )
    ]);
    await audit(req, 'admin.device_lookup', { entity: 'device', entityId: req.v.params.imei });
    res.json({ imei: req.v.params.imei, device, history: history.rows, theft_reports: reports.rows, alerts: alerts.rows });
  }
);

/** Consultation d'une pièce d'identité : flux streamé, chaque accès est tracé. */
adminRouter.get(
  '/documents',
  requireAdmin(...INVESTIGATORS),
  validate({ query: z.object({ key: z.string().regex(/^id-docs\/[0-9a-f-]{36}\/\d{6}\/[0-9a-f-]{36}\.(jpg|png|webp)$/) }) }),
  async (req, res) => {
    const { key } = req.v.query;
    const stream = await storage.getStream(key);
    await audit(req, 'admin.document_viewed', { entity: 'document', entityId: key });
    const ext = path.extname(key).slice(1);
    res.set({
      'Content-Type': ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline'
    });
    stream.pipe(res);
  }
);

/* --------------------------- Déclarations de vol --------------------------- */

adminRouter.get(
  '/theft-reports',
  requireAdmin(...ALL),
  validate({
    query: z.object({ status: z.enum(['pending', 'confirmed', 'rejected', 'resolved']).optional(), ...zPagination })
  }),
  async (req, res) => {
    const { status, page, limit } = req.v.query;
    const params = status ? [status] : [];
    const where = status ? 'WHERE r.status = $1' : '';
    const [items, total] = await Promise.all([
      query(
        `SELECT r.*, b.name AS brand_name, COALESCE(m.name, d.model_label) AS model_name, a.full_name AS reviewed_by_name
         FROM theft_reports r LEFT JOIN devices d ON d.id = r.device_id
         LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
         LEFT JOIN admins a ON a.id = r.reviewed_by
         ${where} ORDER BY r.created_at DESC ${paginate(page, limit)}`,
        params
      ),
      query(`SELECT count(*)::int AS n FROM theft_reports r ${where}`, params)
    ]);
    res.json({ items: items.rows, total: total.rows[0].n, page, limit });
  }
);

adminRouter.patch(
  '/theft-reports/:id',
  requireAdmin(...STAFF, 'police'),
  validate({
    params: z.object({ id: zUuid }),
    body: z.object({
      status: z.enum(['confirmed', 'rejected', 'resolved']),
      review_note: z.string().trim().max(500).optional().nullable()
    })
  }),
  async (req, res) => {
    const { status, review_note: note } = req.v.body;
    const report = await withTransaction(async (c) => {
      const { rows } = await c.query(`SELECT * FROM theft_reports WHERE id = $1 FOR UPDATE`, [req.v.params.id]);
      const r = rows[0];
      if (!r) throw notFound('Déclaration introuvable');
      let deviceId = r.device_id;
      if (status === 'confirmed') {
        if (!deviceId) {
          // IMEI jamais enregistré : on le crée directement signalé pour bloquer toute future transaction
          const dev = await c.query(
            `INSERT INTO devices (imei1, status) VALUES ($1, $2)
             ON CONFLICT (imei1) DO UPDATE SET status = EXCLUDED.status RETURNING id`,
            [r.imei, r.kind]
          );
          deviceId = dev.rows[0].id;
        } else {
          await c.query(`UPDATE devices SET status = $2 WHERE id = $1`, [deviceId, r.kind]);
        }
      } else if (status === 'resolved' && deviceId) {
        await c.query(`UPDATE devices SET status = 'active' WHERE id = $1`, [deviceId]);
      }
      const upd = await c.query(
        `UPDATE theft_reports SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(), device_id = $5
         WHERE id = $1 RETURNING *`,
        [r.id, status, note ?? null, req.auth.sub, deviceId]
      );
      return upd.rows[0];
    });
    await audit(req, `admin.theft_report_${status}`, { entity: 'theft_report', entityId: report.id });
    res.json(report);
  }
);

/* ---------------------------- Alertes de sécurité ---------------------------- */

adminRouter.get(
  '/alerts',
  requireAdmin(...INVESTIGATORS),
  validate({ query: z.object({ status: z.enum(['open', 'handled']).optional(), ...zPagination }) }),
  async (req, res) => {
    const { status, page, limit } = req.v.query;
    const params = status ? [status] : [];
    const where = status ? 'WHERE a.status = $1' : '';
    const [items, total] = await Promise.all([
      query(
        `SELECT a.*, s.name AS shop_name, s.phone AS shop_phone, s.city AS shop_city, u.full_name AS user_name
         FROM security_alerts a LEFT JOIN shops s ON s.id = a.shop_id LEFT JOIN users u ON u.id = a.user_id
         ${where} ORDER BY a.created_at DESC ${paginate(page, limit)}`,
        params
      ),
      query(`SELECT count(*)::int AS n FROM security_alerts a ${where}`, params)
    ]);
    res.json({ items: items.rows, total: total.rows[0].n, page, limit });
  }
);

adminRouter.patch(
  '/alerts/:id',
  requireAdmin(...INVESTIGATORS),
  validate({ params: z.object({ id: zUuid }) }),
  async (req, res) => {
    const { rows } = await query(
      `UPDATE security_alerts SET status = 'handled', handled_by = $2, handled_at = now()
       WHERE id = $1 RETURNING *`,
      [req.v.params.id, req.auth.sub]
    );
    if (!rows[0]) throw notFound('Alerte introuvable');
    await audit(req, 'admin.alert_handled', { entity: 'security_alert', entityId: rows[0].id });
    res.json(rows[0]);
  }
);

/* ------------------------------ Référentiel ------------------------------ */

adminRouter.get('/catalog/brands', requireAdmin(...ALL), async (_req, res) => {
  const { rows } = await query(
    `SELECT b.*, (SELECT count(*)::int FROM models m WHERE m.brand_id = b.id) AS models_count
     FROM brands b ORDER BY b.sort_order, b.name`
  );
  res.json({ items: rows });
});

adminRouter.post(
  '/catalog/brands',
  requireAdmin(...STAFF),
  validate({ body: z.object({ name: zText(60), sort_order: z.coerce.number().int().min(0).default(100) }) }),
  async (req, res) => {
    const { rows } = await query(`INSERT INTO brands (name, sort_order) VALUES ($1, $2) RETURNING *`, [
      req.v.body.name,
      req.v.body.sort_order
    ]);
    await audit(req, 'admin.brand_created', { entity: 'brand', entityId: rows[0].id });
    res.status(201).json(rows[0]);
  }
);

adminRouter.patch(
  '/catalog/brands/:id',
  requireAdmin(...STAFF),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({
      name: zText(60).optional(),
      active: z.boolean().optional(),
      sort_order: z.coerce.number().int().min(0).optional()
    })
  }),
  async (req, res) => {
    const fields = Object.entries(req.v.body).filter(([, v]) => v !== undefined);
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    const { rows } = await query(
      `UPDATE brands SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [req.v.params.id, ...fields.map(([, v]) => v)]
    );
    if (!rows[0]) throw notFound('Marque introuvable');
    res.json(rows[0]);
  }
);

adminRouter.get(
  '/catalog/models',
  requireAdmin(...ALL),
  validate({ query: z.object({ brand_id: z.coerce.number().int().positive() }) }),
  async (req, res) => {
    const { rows } = await query(
      `SELECT m.*, (SELECT count(*)::int FROM devices d WHERE d.model_id = m.id) AS devices_count
       FROM models m WHERE m.brand_id = $1 ORDER BY m.name`,
      [req.v.query.brand_id]
    );
    res.json({ items: rows });
  }
);

adminRouter.post(
  '/catalog/models',
  requireAdmin(...STAFF),
  validate({
    body: z.object({
      brand_id: z.coerce.number().int().positive(),
      name: zText(80),
      release_year: z.coerce.number().int().min(1990).max(2100).optional().nullable()
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const { rows } = await query(
      `INSERT INTO models (brand_id, name, release_year) VALUES ($1, $2, $3) RETURNING *`,
      [b.brand_id, b.name, b.release_year ?? null]
    );
    await audit(req, 'admin.model_created', { entity: 'model', entityId: rows[0].id });
    res.status(201).json(rows[0]);
  }
);

adminRouter.patch(
  '/catalog/models/:id',
  requireAdmin(...STAFF),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({
      name: zText(80).optional(),
      active: z.boolean().optional(),
      release_year: z.coerce.number().int().min(1990).max(2100).nullable().optional()
    })
  }),
  async (req, res) => {
    const fields = Object.entries(req.v.body).filter(([, v]) => v !== undefined);
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    const { rows } = await query(
      `UPDATE models SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [req.v.params.id, ...fields.map(([, v]) => v)]
    );
    if (!rows[0]) throw notFound('Modèle introuvable');
    res.json(rows[0]);
  }
);

/* ------------------------------ Journal d'audit ------------------------------ */

adminRouter.get(
  '/audit-logs',
  requireAdmin('superadmin'),
  validate({ query: z.object({ action: z.string().trim().max(60).optional(), ...zPagination }) }),
  async (req, res) => {
    const { action, page, limit } = req.v.query;
    const params = action ? [`${action.replace(/[%_\\]/g, '\\$&')}%`] : [];
    const where = action ? 'WHERE l.action LIKE $1' : '';
    const { rows } = await query(
      `SELECT l.*, COALESCE(a.full_name, u.full_name) AS actor_name
       FROM audit_logs l
       LEFT JOIN admins a ON l.actor_type = 'admin' AND a.id = l.actor_id
       LEFT JOIN users u ON l.actor_type = 'user' AND u.id = l.actor_id
       ${where} ORDER BY l.created_at DESC ${paginate(page, limit)}`,
      params
    );
    res.json({ items: rows, page, limit });
  }
);

/* ---------------------------- Administrateurs ---------------------------- */

const ADMIN_COLS = 'id, email, full_name, role, status, last_login_at, created_at';

adminRouter.get('/admins', requireAdmin('superadmin'), async (_req, res) => {
  const { rows } = await query(`SELECT ${ADMIN_COLS} FROM admins ORDER BY created_at`);
  res.json({ items: rows });
});

adminRouter.post(
  '/admins',
  requireAdmin('superadmin'),
  validate({
    body: z.object({
      email: zEmail,
      full_name: zText(120),
      role: z.enum(['superadmin', 'admin', 'support', 'police']),
      password: z.string().min(10, 'Mot de passe : 10 caractères minimum').max(200)
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const exists = await query(`SELECT 1 FROM admins WHERE email = $1`, [b.email]);
    if (exists.rowCount) throw conflict('EMAIL_TAKEN', 'Cet e-mail est déjà utilisé');
    const { rows } = await query(
      `INSERT INTO admins (email, full_name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING ${ADMIN_COLS}`,
      [b.email, b.full_name, b.role, await hashSecret(b.password)]
    );
    await audit(req, 'admin.admin_created', { entity: 'admin', entityId: rows[0].id, meta: { role: b.role } });
    res.status(201).json(rows[0]);
  }
);

adminRouter.patch(
  '/admins/:id',
  requireAdmin('superadmin'),
  validate({
    params: z.object({ id: zUuid }),
    body: z.object({
      full_name: zText(120).optional(),
      email: zEmail.optional(),
      role: z.enum(['superadmin', 'admin', 'support', 'police']).optional(),
      status: z.enum(['active', 'disabled']).optional(),
      password: z.string().min(10, 'Mot de passe : 10 caractères minimum').max(200).optional()
    })
  }),
  async (req, res) => {
    const { id } = req.v.params;
    const b = req.v.body;
    if (id === req.auth.sub && (b.status === 'disabled' || (b.role && b.role !== 'superadmin'))) {
      throw forbidden('Vous ne pouvez pas vous désactiver ni vous rétrograder');
    }
    if (b.email) {
      const taken = await query(`SELECT 1 FROM admins WHERE email = $1 AND id <> $2`, [b.email, id]);
      if (taken.rowCount) throw conflict('EMAIL_TAKEN', 'Cet e-mail est déjà utilisé');
    }
    const fields = [];
    const values = [];
    for (const k of ['full_name', 'email', 'role', 'status']) if (b[k]) { fields.push(k); values.push(b[k]); }
    if (b.password) { fields.push('password_hash'); values.push(await hashSecret(b.password)); }
    if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
    const { rows } = await query(
      `UPDATE admins SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING ${ADMIN_COLS}`,
      [id, ...values]
    );
    if (!rows[0]) throw notFound('Administrateur introuvable');
    if (b.password || b.status === 'disabled') await revokeAllRefreshTokens('admin', id);
    await audit(req, 'admin.admin_updated', { entity: 'admin', entityId: id, meta: { fields: Object.keys(b) } });
    res.json(rows[0]);
  }
);

adminRouter.delete(
  '/admins/:id',
  requireAdmin('superadmin'),
  validate({ params: z.object({ id: zUuid }) }),
  async (req, res) => {
    const { id } = req.v.params;
    if (id === req.auth.sub) throw forbidden('Vous ne pouvez pas supprimer votre propre compte');
    const { rows } = await query(
      `SELECT
         EXISTS (SELECT 1 FROM admins WHERE id = $1) AS exists,
         (SELECT count(*)::int FROM subscription_payments WHERE recorded_by = $1)
       + (SELECT count(*)::int FROM theft_reports WHERE reviewed_by = $1)
       + (SELECT count(*)::int FROM security_alerts WHERE handled_by = $1) AS refs`,
      [id]
    );
    if (!rows[0].exists) throw notFound('Administrateur introuvable');
    if (rows[0].refs) {
      throw conflict('HAS_HISTORY', 'Cet administrateur a traité des paiements, déclarations ou alertes : désactivez-le plutôt que de le supprimer.');
    }
    await query(`DELETE FROM refresh_tokens WHERE subject_type = 'admin' AND subject_id = $1`, [id]);
    await query(`DELETE FROM admins WHERE id = $1`, [id]);
    await audit(req, 'admin.admin_deleted', { entity: 'admin', entityId: id });
    res.status(204).end();
  }
);
