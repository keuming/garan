import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { storage } from '../lib/storage.js';
import { audit } from '../lib/audit.js';
import { validate } from '../lib/validate.js';
import { requireUser, requireActiveSubscription, resolveShopId, readScope } from '../middleware/auth.js';

/**
 * Disponibilité / vitrine : articles réellement en boutique (modèle du catalogue,
 * photo, description, prix, quantité). La quantité est décrémentée à chaque vente liée.
 * Lecture : owner (toute l'organisation) + agent (son magasin).
 * Écriture : réservée au compte principal (owner).
 */
export const listingsRouter = Router();
listingsRouter.use(requireUser);

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.UPLOAD_MAX_MB * 1024 * 1024, files: 1 } });

function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export function photoUrl(key) {
  return key ? `${config.API_PUBLIC_URL.replace(/\/$/, '')}/api/v1/public/media?key=${encodeURIComponent(key)}` : null;
}

const SELECT = `
  l.id, l.shop_id, l.brand_id, l.model_id, l.model_label, l.title, l.description,
  l.photo_key, l.price, l.quantity, l.status, l.created_at,
  COALESCE(b.name, l.brand_label) AS brand, COALESCE(m.name, l.model_label) AS model, s.name AS shop_name`;

const shape = (r) => ({
  id: r.id,
  shop_id: r.shop_id,
  shop_name: r.shop_name,
  brand_id: r.brand_id,
  model_id: r.model_id,
  brand: r.brand,
  model: r.model,
  title: r.title,
  description: r.description,
  price: Number(r.price),
  quantity: r.quantity,
  status: r.status,
  photo_key: r.photo_key,
  photo_url: photoUrl(r.photo_key),
  created_at: r.created_at
});

function requireOwnerRole(req) {
  if (req.auth.role !== 'owner') throw forbidden('Réservé au compte principal');
}

/* ------------------------------- Lecture ------------------------------- */

listingsRouter.get(
  '/',
  validate({ query: z.object({ shop_id: z.string().uuid().optional(), available: z.enum(['0', '1']).optional() }) }),
  async (req, res) => {
    const scope = await readScope(req, req.v.query.shop_id);
    const params = [scope.orgId];
    const cond = ['l.organization_id = $1'];
    if (scope.shopId) {
      params.push(scope.shopId);
      cond.push(`l.shop_id = $${params.length}`);
    }
    if (req.v.query.available === '1') cond.push(`l.status = 'active' AND l.quantity > 0`);
    const { rows } = await query(
      `SELECT ${SELECT}
       FROM listings l
       LEFT JOIN brands b ON b.id = l.brand_id
       LEFT JOIN models m ON m.id = l.model_id
       JOIN shops s ON s.id = l.shop_id
       WHERE ${cond.join(' AND ')}
       ORDER BY l.created_at DESC`,
      params
    );
    res.json({ items: rows.map(shape) });
  }
);

/* ---------------------------- Photo (upload) --------------------------- */

listingsRouter.post('/photo', requireActiveSubscription, (req, res, next) => { requireOwnerRole(req); next(); }, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED', 'Fichier manquant (champ « file »)');
  const mime = sniff(req.file.buffer);
  if (!mime) throw badRequest('INVALID_FILE_TYPE', 'Image JPEG, PNG ou WebP attendue');
  const now = new Date();
  const key = `listings/${req.auth.orgId}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ALLOWED[mime]}`;
  await storage.put(key, req.file.buffer, mime);
  res.status(201).json({ key, photo_url: photoUrl(key) });
});

/* ------------------------------ Création ------------------------------ */

async function resolveModel(brandId, modelId, modelLabel, brandLabel) {
  let brandName;
  if (brandId) {
    const brand = (await query(`SELECT name FROM brands WHERE id = $1`, [brandId])).rows[0];
    if (!brand) throw badRequest('INVALID_BRAND', 'Marque inconnue');
    brandName = brand.name;
  } else if (brandLabel && brandLabel.trim()) {
    brandName = brandLabel.trim();
  } else {
    throw badRequest('INVALID_BRAND', 'Marque requise');
  }
  let modelName = modelLabel ?? null;
  if (brandId && modelId) {
    const m = (await query(`SELECT name FROM models WHERE id = $1 AND brand_id = $2`, [modelId, brandId])).rows[0];
    if (!m) throw badRequest('MODEL_BRAND_MISMATCH', 'Ce modèle n’appartient pas à la marque choisie');
    modelName = m.name;
  }
  if (!modelName) throw badRequest('MODEL_REQUIRED', 'Modèle requis');
  return { title: `${brandName} ${modelName}`.trim() };
}

const zCreate = z.object({
  shop_id: z.string().uuid().optional(),
  brand_id: z.coerce.number().int().positive().optional(),
  brand_label: z.string().trim().max(60).optional().nullable(),
  model_id: z.coerce.number().int().positive().optional().nullable(),
  model_label: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  photo_key: z.string().max(200).optional().nullable(),
  price: z.coerce.number().int().min(0),
  quantity: z.coerce.number().int().min(0).default(0)
});

listingsRouter.post('/', requireActiveSubscription, validate({ body: zCreate }), async (req, res) => {
  requireOwnerRole(req);
  const b = req.v.body;
  if (b.photo_key && !b.photo_key.startsWith(`listings/${req.auth.orgId}/`)) throw badRequest('INVALID_PHOTO', 'Photo invalide');
  const shopId = await resolveShopId(req, b.shop_id);
  const { title } = await resolveModel(b.brand_id, b.model_id, b.model_label, b.brand_label);
  const freeBrand = !b.brand_id;
  const brandLabel = b.brand_label && b.brand_label.trim() ? b.brand_label.trim() : null;
  const { rows } = await query(
    `INSERT INTO listings (organization_id, shop_id, brand_id, brand_label, model_id, model_label, title, description, photo_key, price, quantity, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [req.auth.orgId, shopId, freeBrand ? null : b.brand_id, freeBrand ? brandLabel : null, freeBrand ? null : (b.model_id ?? null), !freeBrand && b.model_id ? null : b.model_label, title, b.description ?? null, b.photo_key ?? null, b.price, b.quantity, req.auth.sub]
  );
  await audit(req, 'listing.created', { entity: 'listing', entityId: rows[0].id });
  const { rows: full } = await query(
    `SELECT ${SELECT} FROM listings l LEFT JOIN brands b ON b.id=l.brand_id LEFT JOIN models m ON m.id=l.model_id JOIN shops s ON s.id=l.shop_id WHERE l.id=$1`,
    [rows[0].id]
  );
  res.status(201).json(shape(full[0]));
});

/* ----------------------------- Mise à jour ---------------------------- */

const zPatch = z.object({
  description: z.string().trim().max(1000).optional().nullable(),
  photo_key: z.string().max(200).optional().nullable(),
  price: z.coerce.number().int().min(0).optional(),
  quantity: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'hidden']).optional()
});

listingsRouter.patch('/:id', requireActiveSubscription, validate({ params: z.object({ id: z.string().uuid() }), body: zPatch }), async (req, res) => {
  requireOwnerRole(req);
  const b = req.v.body;
  if (b.photo_key && !b.photo_key.startsWith(`listings/${req.auth.orgId}/`)) throw badRequest('INVALID_PHOTO', 'Photo invalide');
  const fields = Object.entries(b).filter(([, v]) => v !== undefined);
  if (!fields.length) throw badRequest('NOTHING_TO_UPDATE', 'Aucune modification');
  const set = fields.map(([k], i) => `${k} = $${i + 3}`).join(', ');
  const { rowCount } = await query(
    `UPDATE listings SET ${set} WHERE id = $1 AND organization_id = $2`,
    [req.v.params.id, req.auth.orgId, ...fields.map(([, v]) => v)]
  );
  if (!rowCount) throw notFound('Article introuvable');
  await audit(req, 'listing.updated', { entity: 'listing', entityId: req.v.params.id });
  const { rows } = await query(
    `SELECT ${SELECT} FROM listings l LEFT JOIN brands b ON b.id=l.brand_id LEFT JOIN models m ON m.id=l.model_id JOIN shops s ON s.id=l.shop_id WHERE l.id=$1`,
    [req.v.params.id]
  );
  res.json(shape(rows[0]));
});

/* ------------------------------ Suppression --------------------------- */

listingsRouter.delete('/:id', validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
  requireOwnerRole(req);
  const { rowCount } = await query(`DELETE FROM listings WHERE id = $1 AND organization_id = $2`, [req.v.params.id, req.auth.orgId]);
  if (!rowCount) throw notFound('Article introuvable');
  await audit(req, 'listing.deleted', { entity: 'listing', entityId: req.v.params.id });
  res.status(204).end();
});
