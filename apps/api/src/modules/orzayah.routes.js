import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import { buildCheckoutUrl, fetchBalance } from '../lib/orzayah.js';

/**
 * Paiement digital ORZAYAH : solde du marchand + construction de l'URL de checkout.
 * Accessible owner et agent (l'agent encaisse pour la boutique).
 */
export const orzayahRouter = Router();
orzayahRouter.use(requireUser);

async function orgOrzayahNumber(orgId) {
  const { rows } = await query(`SELECT orzayah_number FROM organizations WHERE id = $1`, [orgId]);
  return rows[0]?.orzayah_number ?? null;
}

/** Solde du compte ORZAYAH du marchand (null tant que l'API n'est pas câblée). */
orzayahRouter.get('/balance', async (req, res) => {
  const number = await orgOrzayahNumber(req.auth.orgId);
  const r = await fetchBalance(number);
  res.json({ ...r, orzayah_number: number });
});

/** URL de la page de paiement ORZAYAH pour encaisser un montant. */
orzayahRouter.get(
  '/checkout',
  validate({ query: z.object({ amount: z.coerce.number().int().min(0), reference: z.string().trim().max(80).optional(), label: z.string().trim().max(120).optional() }) }),
  async (req, res) => {
    const number = await orgOrzayahNumber(req.auth.orgId);
    if (!number) throw badRequest('ORZAYAH_NOT_CONFIGURED', 'Renseignez d’abord votre numéro ORZAYAH dans votre profil.');
    res.json({
      url: buildCheckoutUrl({ orzayahNumber: number, amount: req.v.query.amount, reference: req.v.query.reference, label: req.v.query.label }),
      orzayah_number: number
    });
  }
);
