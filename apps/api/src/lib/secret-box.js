import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Chiffrement des secrets stockés en base (clés API des marchands) : AES-256-GCM.
 * Clé de chiffrement : SECRETS_KEY (variable Render recommandée), à défaut dérivée de JWT_ACCESS_SECRET.
 * Si cette clé change, les secrets existants deviennent illisibles : les marchands doivent se relier à nouveau.
 */
const masterKey = () => crypto.createHash('sha256').update(process.env.SECRETS_KEY || config.JWT_ACCESS_SECRET).digest();

export function seal(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function unseal(sealed) {
  const [v, iv, tag, enc] = String(sealed ?? '').split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Secret illisible');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString('utf8');
}
