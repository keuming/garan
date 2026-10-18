import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

// Note scalabilité : en multi-instance, brancher un store partagé (rate-limit-redis).
const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.NODE_ENV === 'test',
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message } })
  });

export const globalLimiter = make(60_000, 300, 'Trop de requêtes, réessayez dans une minute');
export const authLimiter = make(15 * 60_000, 30, 'Trop de tentatives de connexion, réessayez plus tard');
export const publicLimiter = make(60_000, 30, 'Trop de vérifications, réessayez dans une minute');
export const reportLimiter = make(60 * 60_000, 5, 'Trop de déclarations, réessayez plus tard');
