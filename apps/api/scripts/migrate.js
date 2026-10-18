/**
 * Applique les migrations SQL de ./migrations dans l'ordre, une seule fois chacune.
 * Usage : npm run migrate
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const ssl = (process.env.DATABASE_SSL ?? 'true') === 'true' ? { rejectUnauthorized: false } : false;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant');
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  // Verrou consultatif : deux instances qui démarrent ensemble ne migrent pas en parallèle
  await client.query('SELECT pg_advisory_lock(727001)');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    process.stdout.write(`→ ${file} … `);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('ok');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('échec');
      throw err;
    }
  }
  await client.query('SELECT pg_advisory_unlock(727001)');
  console.log('Migrations à jour.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
