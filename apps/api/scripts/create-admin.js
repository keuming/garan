/**
 * Crée (ou réinitialise) un administrateur du back-office.
 * Usage : npm run create-admin -- email@domaine.com "Nom complet" MotDePasseFort superadmin
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [email, fullName, password, role = 'superadmin'] = process.argv.slice(2);
if (!email || !fullName || !password) {
  console.error('Usage : npm run create-admin -- <email> "<nom complet>" <mot_de_passe> [superadmin|admin|support|police]');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Le mot de passe doit contenir au moins 10 caractères.');
  process.exit(1);
}

const ssl = (process.env.DATABASE_SSL ?? 'true') === 'true' ? { rejectUnauthorized: false } : false;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });
await client.connect();
const hash = await bcrypt.hash(password, 12);
const { rows } = await client.query(
  `INSERT INTO admins (email, full_name, role, password_hash) VALUES (lower($1), $2, $3, $4)
   ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role,
     password_hash = EXCLUDED.password_hash, status = 'active'
   RETURNING id, email, role`,
  [email, fullName, role, hash]
);
console.log('Administrateur prêt :', rows[0]);
await client.end();
