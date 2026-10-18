import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { notFound } from '../lib/errors.js';
import { maskImei } from '../lib/imei.js';
import { audit } from '../lib/audit.js';
import { validate, zDocNumber, zDocType, zImei, zPhone, zText } from '../lib/validate.js';
import { publicLimiter, reportLimiter } from '../middleware/rateLimit.js';

/**
 * Endpoints publics (sans compte) :
 * - vérification du statut d'un IMEI avant un achat entre particuliers ;
 * - vérification d'un certificat de propriété (QR code du reçu) ;
 * - déclaration de vol ou de perte par le propriétaire.
 */
export const publicRouter = Router();

const maskName = (name) =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}${'•'.repeat(Math.max(2, Math.min(w.length - 1, 6)))}`)
    .join(' ');

publicRouter.get('/imei/:imei', publicLimiter, validate({ params: z.object({ imei: zImei }) }), async (req, res) => {
  const { rows } = await query(
    `SELECT d.status, b.name AS brand, COALESCE(m.name, d.model_label) AS model
     FROM devices d LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
     WHERE d.imei1 = $1 OR d.imei2 = $1`,
    [req.v.params.imei]
  );
  const d = rows[0];
  const result = !d ? 'unknown' : d.status === 'active' ? 'clean' : 'reported';
  res.json({
    imei: maskImei(req.v.params.imei),
    result,
    brand: d?.brand ?? null,
    model: d?.model ?? null,
    message:
      result === 'reported'
        ? 'Ce téléphone est signalé volé ou perdu. Ne l’achetez pas.'
        : result === 'clean'
          ? 'Ce téléphone est enregistré et n’est pas signalé.'
          : 'Ce téléphone n’est pas encore enregistré dans gaRAN.'
  });
});

publicRouter.get(
  '/certificates/:code',
  publicLimiter,
  validate({ params: z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, 'Code invalide') }) }),
  async (req, res) => {
    const { rows } = await query(
      `SELECT t.receipt_number, t.type, t.condition, t.occurred_at, t.device_id, t.person_id,
              d.imei1, d.status AS device_status, d.owner_type, d.owner_person_id,
              b.name AS brand, COALESCE(m.name, d.model_label) AS model,
              s.name AS shop_name, s.city AS shop_city, s.district AS shop_district,
              p.full_name
       FROM transactions t
       JOIN devices d ON d.id = t.device_id
       LEFT JOIN brands b ON b.id = d.brand_id
       LEFT JOIN models m ON m.id = d.model_id
       JOIN shops s ON s.id = t.shop_id
       LEFT JOIN persons p ON p.id = t.person_id
       WHERE t.verification_code = $1 AND t.type = 'sale'`,
      [req.v.params.code]
    );
    const t = rows[0];
    if (!t) throw notFound('Certificat introuvable');
    res.json({
      valid: true,
      receipt_number: t.receipt_number,
      sold_at: t.occurred_at,
      condition: t.condition,
      device: { brand: t.brand, model: t.model, imei: maskImei(t.imei1), status: t.device_status },
      shop: { name: t.shop_name, city: t.shop_city, district: t.shop_district },
      buyer: maskName(t.full_name),
      is_current_owner: t.owner_type === 'person' && t.owner_person_id === t.person_id
    });
  }
);

publicRouter.post(
  '/theft-reports',
  reportLimiter,
  validate({
    body: z.object({
      imei: zImei,
      kind: z.enum(['stolen', 'lost']).default('stolen'),
      reporter_name: zText(120),
      reporter_phone: zPhone,
      id_doc_type: zDocType,
      id_doc_number: zDocNumber,
      police_report_number: z.string().trim().max(60).optional().nullable(),
      description: z.string().trim().max(1000).optional().nullable()
    })
  }),
  async (req, res) => {
    const b = req.v.body;
    const result = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `SELECT d.id, d.owner_type, p.id_doc_type, upper(p.id_doc_number) AS id_doc_number
         FROM devices d LEFT JOIN persons p ON p.id = d.owner_person_id
         WHERE d.imei1 = $1 OR d.imei2 = $1
         FOR UPDATE OF d`,
        [b.imei]
      );
      const d = rows[0];
      // Confirmation automatique si le déclarant présente la pièce du propriétaire enregistré.
      const autoConfirm =
        d?.owner_type === 'person' && d.id_doc_type === b.id_doc_type && d.id_doc_number === b.id_doc_number;
      const { rows: rep } = await c.query(
        `INSERT INTO theft_reports (device_id, imei, kind, reporter_name, reporter_phone, id_doc_type, id_doc_number,
                                    police_report_number, description, status, auto_confirmed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          d?.id ?? null,
          b.imei,
          b.kind,
          b.reporter_name,
          b.reporter_phone,
          b.id_doc_type,
          b.id_doc_number,
          b.police_report_number ?? null,
          b.description ?? null,
          autoConfirm ? 'confirmed' : 'pending',
          autoConfirm
        ]
      );
      if (autoConfirm) await c.query(`UPDATE devices SET status = $2 WHERE id = $1`, [d.id, b.kind]);
      return { id: rep[0].id, autoConfirm };
    });
    await audit(req, 'public.theft_report', { entity: 'theft_report', entityId: result.id, meta: { auto: result.autoConfirm } });
    res.status(201).json({
      reference: result.id,
      status: result.autoConfirm ? 'confirmed' : 'pending',
      message: result.autoConfirm
        ? 'Déclaration enregistrée : le téléphone est désormais signalé dans tout le réseau gaRAN.'
        : 'Déclaration reçue. Elle sera vérifiée par notre équipe avant signalement.'
    });
  }
);
