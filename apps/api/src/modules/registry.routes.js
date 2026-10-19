import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { storage } from '../lib/storage.js';
import {
  validate,
  zDateRange,
  zDocNumber,
  zDocType,
  zImei,
  zOptionalEmail,
  zPagination,
  zPhone,
  zText,
  zUuid
} from '../lib/validate.js';
import { readScope, requireActiveSubscription, requireUser, resolveShopId } from '../middleware/auth.js';
import {
  checkDevice,
  getTransaction,
  listTransactions,
  purchase,
  sale,
  salesSummary,
  stockIn
} from './registry.service.js';

export const registryRouter = Router();
registryRouter.use(requireUser);

/* --------------------------- Schémas communs --------------------------- */

const zDevice = z
  .object({
    imei1: zImei,
    imei2: zImei.optional().nullable(),
    brand_id: z.coerce.number().int().positive().optional(),
    model_id: z.coerce.number().int().positive().optional().nullable(),
    model_label: z.string().trim().max(80).optional().nullable(),
    color: z.string().trim().max(40).optional().nullable(),
    storage_gb: z.coerce.number().int().positive().max(4096).optional().nullable()
  })
  .refine((d) => !d.imei2 || d.imei2 !== d.imei1, { message: 'Les deux IMEI doivent être différents', path: ['imei2'] });

const zPerson = z
  .object({
    full_name: zText(120),
    phone1: zPhone,
    phone2: zPhone,
    email: zOptionalEmail,
    id_doc_type: zDocType,
    id_doc_number: zDocNumber,
    id_doc_front_key: z.string().max(200).optional().nullable(),
    id_doc_back_key: z.string().max(200).optional().nullable()
  })
  .refine((p) => p.phone1 !== p.phone2, { message: 'Les deux contacts doivent être différents', path: ['phone2'] });

const zMoney = z.coerce.number().int('Montant entier en FCFA').min(0).max(100_000_000);
const zCondition = z.enum(['new', 'like_new', 'used']);
const zNotes = z.string().trim().max(500).optional().nullable();

/* ------------------------------ Appareils ------------------------------ */

registryRouter.get(
  '/devices/check/:imei',
  requireActiveSubscription,
  validate({ params: z.object({ imei: zImei }) }),
  async (req, res) => {
    res.json(await checkDevice(req.v.params.imei, req.auth));
  }
);

/* ------------------------------ Personnes ------------------------------ */
// Préremplissage : ne renvoie que le nom (les contacts sont ressaisis à chaque opération).
registryRouter.get(
  '/persons/lookup',
  validate({ query: z.object({ id_doc_type: zDocType, id_doc_number: zDocNumber }) }),
  async (req, res) => {
    const { rows } = await query(
      `SELECT full_name, (id_doc_front_key IS NOT NULL AND id_doc_back_key IS NOT NULL) AS has_id_photos
       FROM persons WHERE id_doc_type = $1 AND upper(id_doc_number) = $2`,
      [req.v.query.id_doc_type, req.v.query.id_doc_number]
    );
    res.json({ found: Boolean(rows[0]), person: rows[0] ?? null });
  }
);

/* -------------------- Téléversement des pièces d'identité -------------------- */

const ALLOWED_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_MB * 1024 * 1024, files: 1 }
});

function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

registryRouter.post('/uploads/id-document', requireActiveSubscription, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED', 'Fichier manquant (champ « file »)');
  const mime = sniffImage(req.file.buffer);
  if (!mime || !ALLOWED_MIME[mime]) throw badRequest('INVALID_FILE_TYPE', 'Image JPEG, PNG ou WebP attendue');
  const now = new Date();
  const key = `id-docs/${req.auth.orgId}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ALLOWED_MIME[mime]}`;
  await storage.put(key, req.file.buffer, mime);
  res.status(201).json({ key });
});

/* ---------------------------- Transactions ---------------------------- */

registryRouter.post(
  '/transactions/stock-in',
  requireActiveSubscription,
  validate({
    body: z.object({
      shop_id: zUuid.optional(),
      device: zDevice,
      condition: zCondition.default('new'),
      price: zMoney,
      supplier_name: z.string().trim().max(120).optional().nullable(),
      notes: zNotes
    })
  }),
  async (req, res) => {
    const shopId = await resolveShopId(req, req.v.body.shop_id);
    const id = await stockIn(req, shopId, req.v.body);
    res.status(201).json(await getTransaction(id, { orgId: req.auth.orgId }));
  }
);

registryRouter.post(
  '/transactions/purchases',
  requireActiveSubscription,
  validate({
    body: z.object({
      shop_id: zUuid.optional(),
      device: zDevice,
      person: zPerson,
      condition: zCondition,
      price: zMoney,
      notes: zNotes
    })
  }),
  async (req, res) => {
    const shopId = await resolveShopId(req, req.v.body.shop_id);
    const id = await purchase(req, shopId, req.v.body);
    res.status(201).json(await getTransaction(id, { orgId: req.auth.orgId }));
  }
);

registryRouter.post(
  '/transactions/sales',
  requireActiveSubscription,
  validate({
    body: z.object({
      shop_id: zUuid.optional(),
      device: zDevice,
      person: zPerson,
      condition: zCondition,
      price: zMoney,
      payment_method: z.enum(['cash', 'orzayah']).default('cash'),
      listing_id: zUuid.optional().nullable(),
      notes: zNotes
    })
  }),
  async (req, res) => {
    const shopId = await resolveShopId(req, req.v.body.shop_id);
    const id = await sale(req, shopId, req.v.body);
    res.status(201).json(await getTransaction(id, { orgId: req.auth.orgId }));
  }
);

registryRouter.get(
  '/transactions',
  validate({
    query: z.object({
      type: z.enum(['stock_in', 'purchase', 'sale']).optional(),
      shop_id: zUuid.optional(),
      q: z.string().trim().max(60).optional(),
      ...zDateRange,
      ...zPagination
    })
  }),
  async (req, res) => {
    const scope = await readScope(req, req.v.query.shop_id);
    res.json(await listTransactions(scope, req.v.query));
  }
);

registryRouter.get('/transactions/:id', validate({ params: z.object({ id: zUuid }) }), async (req, res) => {
  const scope = await readScope(req);
  res.json(await getTransaction(req.v.params.id, scope));
});

/* -------------------------------- États -------------------------------- */

registryRouter.get(
  '/stats/summary',
  validate({
    query: z.object({
      type: z.enum(['stock_in', 'purchase', 'sale']).default('sale'),
      shop_id: zUuid.optional(),
      ...zDateRange
    })
  }),
  async (req, res) => {
    const scope = await readScope(req, req.v.query.shop_id);
    res.json(await salesSummary(scope, req.v.query));
  }
);
