/**
 * Back-office : profil administrateur, CRUD des administrateurs,
 * super marchands et sous-comptes CLIENT.
 *   TEST_DATABASE_URL=postgres://user@localhost:5432/garan_test npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import request from 'supertest';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_URL = process.env.TEST_DATABASE_URL;
if (!DB_URL) {
  console.error('TEST_DATABASE_URL requis pour les tests');
  process.exit(1);
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: DB_URL,
  DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'false',
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: await fs.mkdtemp(path.join(os.tmpdir(), 'garan-storage-')),
  BCRYPT_ROUNDS: '4'
});

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const bcrypt = (await import('bcryptjs')).default;
const app = createApp();
const api = () => request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ctx = {};

const LOC = { country: "Côte d'Ivoire", city: 'Abidjan', district: 'Adjamé' };

before(async () => {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of (await fs.readdir(path.join(here, '..', 'migrations'))).sort()) {
    await c.query(await fs.readFile(path.join(here, '..', 'migrations', f), 'utf8'));
  }
  await c.query(`INSERT INTO admins (email, full_name, role, password_hash) VALUES ('boss@garan.ci', 'Boss', 'superadmin', $1)`, [
    await bcrypt.hash('MotDePasse!2026', 4)
  ]);
  await c.end();
  const r = await api().post('/api/v1/auth/admin/login').send({ email: 'boss@garan.ci', password: 'MotDePasse!2026' });
  ctx.t = r.body.access_token;
  ctx.refresh = r.body.refresh_token;
});

after(() => pool.end());

test('création d’un super marchand avec son compte principal', async () => {
  const r = await api()
    .post('/api/v1/admin/organizations')
    .set(auth(ctx.t))
    .send({
      type: 'super_merchant', name: 'Grossiste Plateau', rccm: 'CI-ABJ-2026-B-1', email: 'gros@ci.ci', phone: '0707111111', ...LOC,
      max_shops: 3, owner: { full_name: 'Kouassi Jean', phone: '0707111111', pin: '1234' }
    });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.organization.type, 'super_merchant');
  assert.equal(r.body.organization.max_shops, 3);
  assert.equal(r.body.shop_id, null);
  ctx.org = r.body.organization.id;

  const login = await api().post('/api/v1/auth/login').send({ phone: '0707111111', pin: '1234' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'owner');
  assert.equal(login.body.user.organization.type, 'super_merchant');
});

test('ajout de sous-comptes CLIENT et connexion du vendeur', async () => {
  const mk = (n, phone) =>
    api()
      .post(`/api/v1/admin/organizations/${ctx.org}/clients`)
      .set(auth(ctx.t))
      .send({ shop: { name: `Boutique ${n}`, phone, ...LOC }, account: { full_name: `Vendeur ${n}`, phone, pin: '4321' } });
  const a = await mk('A', '0505222201');
  assert.equal(a.status, 201, JSON.stringify(a.body));
  ctx.shopA = a.body.shop.id;
  ctx.userA = a.body.user.id;
  const b = await mk('B', '0505222202');
  assert.equal(b.status, 201);
  ctx.shopB = b.body.shop.id;

  const dup = await mk('Dup', '0505222201');
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'PHONE_TAKEN');

  const c = await mk('C', '0505222203');
  assert.equal(c.status, 201);
  ctx.shopC = c.body.shop.id;
  const limit = await mk('D', '0505222204');
  assert.equal(limit.status, 402);

  const login = await api().post('/api/v1/auth/login').send({ phone: '0505222201', pin: '4321' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'agent');
  assert.equal(login.body.user.shops.length, 1);
  assert.equal(login.body.user.shops[0].name, 'Boutique A');

  const detail = await api().get(`/api/v1/admin/organizations/${ctx.org}`).set(auth(ctx.t));
  assert.equal(detail.body.shops.length, 3);
  assert.equal(detail.body.users.length, 4);
});

test('modification du login (téléphone) et du PIN d’un sous-compte', async () => {
  const r = await api().patch(`/api/v1/admin/users/${ctx.userA}`).set(auth(ctx.t)).send({ phone: '0101333333', pin: '9999' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.phone, '+2250101333333');
  const old = await api().post('/api/v1/auth/login').send({ phone: '0505222201', pin: '4321' });
  assert.equal(old.status, 401);
  const neu = await api().post('/api/v1/auth/login').send({ phone: '0101333333', pin: '9999' });
  assert.equal(neu.status, 200);
});

test('désactivation d’une boutique : ses comptes ne peuvent plus se connecter', async () => {
  const r = await api().patch(`/api/v1/admin/shops/${ctx.shopA}`).set(auth(ctx.t)).send({ status: 'disabled' });
  assert.equal(r.status, 200);
  const login = await api().post('/api/v1/auth/login').send({ phone: '0101333333', pin: '9999' });
  assert.equal(login.status, 401);
});

test('passage en marchand simple refusé tant qu’il reste plusieurs boutiques actives', async () => {
  const r = await api().patch(`/api/v1/admin/organizations/${ctx.org}`).set(auth(ctx.t)).send({ type: 'merchant' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'TOO_MANY_SHOPS');
});

test('suppression d’un compte, d’une boutique puis du client entier (sans historique)', async () => {
  const detail = await api().get(`/api/v1/admin/organizations/${ctx.org}`).set(auth(ctx.t));
  const owner = detail.body.users.find((u) => u.role === 'owner');
  const ownerDel = await api().delete(`/api/v1/admin/users/${owner.id}`).set(auth(ctx.t));
  assert.equal(ownerDel.status, 400);

  const agentB = detail.body.users.find((u) => u.shop_id === ctx.shopB);
  assert.equal((await api().delete(`/api/v1/admin/users/${agentB.id}`).set(auth(ctx.t))).status, 204);
  assert.equal((await api().delete(`/api/v1/admin/shops/${ctx.shopC}`).set(auth(ctx.t))).status, 204);
  assert.equal((await api().delete(`/api/v1/admin/organizations/${ctx.org}`).set(auth(ctx.t))).status, 204);
  const gone = await api().get(`/api/v1/admin/organizations/${ctx.org}`).set(auth(ctx.t));
  assert.equal(gone.status, 404);
});

test('marchand simple : une boutique créée avec son compte, et pas de sous-compte supplémentaire', async () => {
  const r = await api()
    .post('/api/v1/admin/organizations')
    .set(auth(ctx.t))
    .send({
      type: 'merchant', name: 'Phone Center Yop', rccm: 'CI-ABJ-2026-B-2', email: 'pc@ci.ci', phone: '0708444444', ...LOC,
      owner: { full_name: 'Traoré Ali', phone: '0708444444', pin: '1111' }
    });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.shop_id);
  assert.equal(r.body.organization.max_shops, 1);
  const extra = await api()
    .post(`/api/v1/admin/organizations/${r.body.organization.id}/clients`)
    .set(auth(ctx.t))
    .send({ shop: { name: 'Deuxième', phone: '0708444445', ...LOC }, account: { full_name: 'X', phone: '0708444445', pin: '2222' } });
  assert.equal(extra.status, 402);

  const up = await api().patch(`/api/v1/admin/organizations/${r.body.organization.id}`).set(auth(ctx.t)).send({ type: 'super_merchant', max_shops: 4 });
  assert.equal(up.status, 200);
  assert.equal(up.body.max_shops, 4);
});

test('mon profil : nom, e-mail et mot de passe', async () => {
  const bad = await api().patch('/api/v1/admin/me').set(auth(ctx.t)).send({ full_name: 'Nouveau', current_password: 'faux' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_PASSWORD');

  const ok = await api().patch('/api/v1/admin/me').set(auth(ctx.t)).send({ full_name: 'Toma K.', email: 'toma@garan.ci', current_password: 'MotDePasse!2026' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.admin.email, 'toma@garan.ci');

  const pw = await api().post('/api/v1/admin/me/password').set(auth(ctx.t)).send({ current_password: 'MotDePasse!2026', new_password: 'NouveauSecret#2026' });
  assert.equal(pw.status, 204);
  const reuse = await api().post('/api/v1/auth/refresh').send({ refresh_token: ctx.refresh });
  assert.equal(reuse.status, 401);
  const login = await api().post('/api/v1/auth/admin/login').send({ email: 'toma@garan.ci', password: 'NouveauSecret#2026' });
  assert.equal(login.status, 200);
  ctx.t = login.body.access_token;
});

test('CRUD des administrateurs', async () => {
  const c = await api().post('/api/v1/admin/admins').set(auth(ctx.t)).send({ email: 'agent@garan.ci', full_name: 'Agent', role: 'support', password: 'Support!2026' });
  assert.equal(c.status, 201);
  const u = await api().patch(`/api/v1/admin/admins/${c.body.id}`).set(auth(ctx.t)).send({ email: 'support@garan.ci', role: 'admin' });
  assert.equal(u.status, 200);
  assert.equal(u.body.email, 'support@garan.ci');
  assert.equal(u.body.role, 'admin');

  const me = await api().get('/api/v1/admin/me').set(auth(ctx.t));
  const selfDel = await api().delete(`/api/v1/admin/admins/${me.body.admin.id}`).set(auth(ctx.t));
  assert.equal(selfDel.status, 403);

  const del = await api().delete(`/api/v1/admin/admins/${c.body.id}`).set(auth(ctx.t));
  assert.equal(del.status, 204);
  const list = await api().get('/api/v1/admin/admins').set(auth(ctx.t));
  assert.equal(list.body.items.length, 1);
});
