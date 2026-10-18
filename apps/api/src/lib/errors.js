import { ZodError } from 'zod';
import { logger } from '../logger.js';

/** Erreur métier avec code stable (exploité par les apps) et message en français. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentification requise') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Accès refusé') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Ressource introuvable') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code, message, details) => new AppError(409, code, message, details);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route inconnue : ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Données invalides',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      }
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Corps JSON invalide' } });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Fichier trop volumineux' } });
  }
  if (err?.code === '23505') {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Cet enregistrement existe déjà' } });
  }
  if (err?.code === '23503') {
    return res.status(400).json({ error: { code: 'INVALID_REFERENCE', message: 'Référence inexistante' } });
  }
  (req.log ?? logger).error({ err }, 'Erreur non gérée');
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' } });
}
