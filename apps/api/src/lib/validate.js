import { z } from 'zod';
import { isValidImei, normalizeImei } from './imei.js';
import { normalizePhone } from './phone.js';

/**
 * Middleware de validation zod. Les valeurs validées sont exposées dans req.v
 * (Express 5 rend req.query en lecture seule).
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.v = req.v ?? {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req.v[part] = schemas[part].parse(req[part] ?? {});
    }
    next();
  };
}

export const zImei = z
  .string({ required_error: 'IMEI requis' })
  .transform(normalizeImei)
  .refine(isValidImei, 'IMEI invalide (15 chiffres, clé de contrôle incorrecte)');

export const zPhone = z
  .string()
  .transform((v) => normalizePhone(v))
  .refine((v) => v !== null, 'Numéro de téléphone invalide');

export const zPin = z.string().regex(/^\d{4}$/, 'Le code PIN doit contenir 4 chiffres');

export const zUuid = z.string().uuid('Identifiant invalide');

export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse e-mail invalide');

export const zOptionalEmail = z
  .union([zEmail, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const zText = (max = 200) => z.string().trim().min(1, 'Champ requis').max(max);

export const zDocType = z.enum(['CNI', 'PASSPORT', 'PERMIS', 'ATTESTATION', 'CARTE_CONSULAIRE', 'CARTE_SEJOUR']);

export const zDocNumber = z
  .string()
  .trim()
  .min(4, 'Numéro de pièce trop court')
  .max(40)
  .transform((v) => v.toUpperCase().replace(/\s+/g, ''));

export const zPagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
};

export const zDateRange = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
};
