import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

// BIGINT (montants, compteurs) -> Number : les montants FCFA restent très en dessous de 2^53
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// NUMERIC -> Number (agrégats)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: config.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'garan-api'
});

pool.on('error', (err) => logger.error({ err }, 'Erreur inattendue du pool PostgreSQL'));

/** Requête simple sur le pool. */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Exécute `fn(client)` dans une transaction SQL.
 * COMMIT si la fonction réussit, ROLLBACK sinon.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
