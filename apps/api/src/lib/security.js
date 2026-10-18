import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { unauthorized } from './errors.js';

export const hashSecret = (plain) => bcrypt.hash(plain, config.BCRYPT_ROUNDS);
export const verifySecret = (plain, hash) => bcrypt.compare(plain, hash);

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/**
 * Jeton d'accès court (JWT).
 * claims : { sub, typ: 'user'|'admin', role, org?, shop? }
 */
export function signAccessToken(claims) {
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
    issuer: 'garan-api',
    audience: claims.typ
  });
}

export function verifyAccessToken(token, typ) {
  try {
    return jwt.verify(token, config.JWT_ACCESS_SECRET, { issuer: 'garan-api', audience: typ });
  } catch {
    throw unauthorized('Session expirée ou invalide');
  }
}

/** Crée un jeton de rafraîchissement opaque (seul son hash est stocké). */
export async function issueRefreshToken(subjectType, subjectId, meta = {}, client = { query }) {
  const token = crypto.randomBytes(48).toString('base64url');
  await client.query(
    `INSERT INTO refresh_tokens (subject_type, subject_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, now() + make_interval(days => $4), $5, $6)`,
    [subjectType, subjectId, sha256(token), config.REFRESH_TOKEN_TTL_DAYS, meta.userAgent ?? null, meta.ip ?? null]
  );
  return token;
}

/**
 * Consomme un jeton de rafraîchissement (rotation) : il est révoqué et un nouveau est émis.
 * Retourne { subjectType, subjectId, refreshToken } ou lève 401.
 */
export async function rotateRefreshToken(token, meta = {}) {
  const { rows } = await query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING subject_type, subject_id`,
    [sha256(String(token))]
  );
  if (!rows[0]) throw unauthorized('Session expirée, reconnectez-vous');
  const { subject_type: subjectType, subject_id: subjectId } = rows[0];
  const refreshToken = await issueRefreshToken(subjectType, subjectId, meta);
  return { subjectType, subjectId, refreshToken };
}

export async function revokeRefreshToken(token) {
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    sha256(String(token))
  ]);
}

export async function revokeAllRefreshTokens(subjectType, subjectId) {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE subject_type = $1 AND subject_id = $2 AND revoked_at IS NULL`,
    [subjectType, subjectId]
  );
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I

/** Code de vérification public lisible (certificat de propriété). */
export function randomCode(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
