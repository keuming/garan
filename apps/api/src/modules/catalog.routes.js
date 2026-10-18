import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { validate } from '../lib/validate.js';

/** Référentiel public et cacheable : marques et modèles actifs. */
export const catalogRouter = Router();

catalogRouter.get('/brands', async (_req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.name,
            (SELECT count(*)::int FROM models m WHERE m.brand_id = b.id AND m.active) AS models_count
     FROM brands b WHERE b.active ORDER BY b.sort_order, b.name`
  );
  res.set('Cache-Control', 'public, max-age=900').json({ items: rows });
});

catalogRouter.get(
  '/models',
  validate({
    query: z.object({
      brand_id: z.coerce.number().int().positive().optional(),
      q: z.string().trim().max(60).optional()
    })
  }),
  async (req, res) => {
    const { brand_id: brandId, q } = req.v.query;
    const params = [];
    const cond = ['m.active', 'b.active'];
    if (brandId) {
      params.push(brandId);
      cond.push(`m.brand_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
      cond.push(`(m.name ILIKE $${params.length} OR b.name ILIKE $${params.length})`);
    }
    const { rows } = await query(
      `SELECT m.id, m.name, m.brand_id, b.name AS brand_name
       FROM models m JOIN brands b ON b.id = m.brand_id
       WHERE ${cond.join(' AND ')}
       ORDER BY b.sort_order, b.name, m.name
       LIMIT 500`,
      params
    );
    res.set('Cache-Control', 'public, max-age=900').json({ items: rows });
  }
);
