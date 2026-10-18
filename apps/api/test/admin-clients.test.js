/**
 * Back-office : profil administrateur, CRUD des administrateurs,
 * super marchands, sous-marchands indépendants et liste des ventes.
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

test('création d’un super marchand (compte principal, sans boutique propre)', async () => {
  const r = await api()
    .post('/api/v1/admin/organizations')
    .set(auth(ctx.t))
    .send({
      type: 'super_merchant', name: 'Grossiste Plateau', rccm: 'CI-ABJ-2026-B-1', email: 'gros@ci.ci', phone: '0707111111', ...LOC,
      owner: { full_name: 'Kouassi Jean', phone: '0707111111', pin: '1234' }
    });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.organization.type, 'super_merchant');
  assert.equal(r.body.shop_id, null);
  ctx.superId = r.body.organization.id;

  const login = await api().post('/api/v1/auth/login').send({ phone: '0707111111', pin: '1234' });
  assert.equal(login.body.user.organization.type, 'super_merchant');
});

test('les sous-marchands sont des clients indépendants, avec leur propre abonnement', async () => {
  const mk = (n, phone) =>
    api()
      .post(`/api/v1/admin/organizations/${ctx.superId}/sub-merchants`)
      .set(auth(ctx.t))
      .send({ name: `Boutique ${n}`, rccm: `CI-ABJ-2026-S-${n}`, email: `${n}@ci.ci`, phone, ...LOC, owner: { full_name: `Gérant ${n}`, phone, pin: '4321' } });

  const a = await mk('A', '0505222201');
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.organization.type, 'merchant');
  assert.equal(a.body.organization.parent_id, ctx.superId);
  assert.ok(a.body.shop_id, 'un sous-marchand a sa propre boutique');
  assert.ok(a.body.organization.subscription_expires_at, 'un sous-marchand a son propre abonnement');
  ctx.subA = a.body.organization.id;
  ctx.subAOwner = a.body.owner.id;
  ctx.subAShop = a.body.shop_id;

  const b = await mk('B', '0505222202');
  assert.equal(b.status, 201);
  ctx.subB = b.body.organization.id;

  // le login du sous-marchand fonctionne (app Magasin)
  const login = await api().post('/api/v1/auth/login').send({ phone: '0505222201', pin: '4321' });
  assert.equal(login.body.user.role, 'owner');
  assert.equal(login.body.user.organization.type, 'merchant');

  // un numéro déjà pris est refusé
  const dup = await mk('C', '0505222201');
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'PHONE_TAKEN');

  // on ne peut pas rattacher un sous-marchand à un marchand simple
  const notSuper = await api()
    .post(`/api/v1/admin/organizations/${ctx.subA}/sub-merchants`)
    .set(auth(ctx.t))
    .send({ name: 'X', rccm: 'R', email: 'x@ci.ci', phone: '0505222209', ...LOC, owner: { full_name: 'X', phone: '0505222209', pin: '0000' } });
  assert.equal(notSuper.status, 400);
  assert.equal(notSuper.body.error.code, 'NOT_SUPER_MERCHANT');
});

test('listes séparées : super marchands d’un côté, marchands (dont sous-marchands) de l’autre', async () => {
  const supers = await api().get('/api/v1/admin/organizations?type=super_merchant').set(auth(ctx.t));
  assert.equal(supers.body.items.length, 1);
  assert.equal(supers.body.items[0].sub_merchants_count, 2);

  const merchants = await api().get('/api/v1/admin/organizations?type=merchant').set(auth(ctx.t));
  assert.equal(merchants.body.items.length, 2);
  assert.ok(merchants.body.items.every((m) => m.parent_name === 'Grossiste Plateau'));

  // enfants d’un super marchand
  const children = await api().get(`/api/v1/admin/organizations?parent_id=${ctx.superId}`).set(auth(ctx.t));
  assert.equal(children.body.items.length, 2);
});

test('fiche du super marchand : ses sous-marchands sont consultables', async () => {
  const detail = await api().get(`/api/v1/admin/organizations/${ctx.superId}`).set(auth(ctx.t));
  assert.equal(detail.status, 200);
  assert.equal(detail.body.children.length, 2);
  assert.ok(detail.body.children.some((c) => c.name === 'Boutique A'));

  const sub = await api().get(`/api/v1/admin/organizations/${ctx.subA}`).set(auth(ctx.t));
  assert.equal(sub.body.parent_name, 'Grossiste Plateau');
});

test('modification du login et du PIN d’un sous-marchand', async () => {
  const r = await api().patch(`/api/v1/admin/users/${ctx.subAOwner}`).set(auth(ctx.t)).send({ phone: '0101333333', pin: '9999' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.phone, '+2250101333333');
  assert.equal((await api().post('/api/v1/auth/login').send({ phone: '0505222201', pin: '4321' })).status, 401);
  assert.equal((await api().post('/api/v1/auth/login').send({ phone: '0101333333', pin: '9999' })).status, 200);
});

test('un super marchand avec sous-marchands ne peut pas redevenir marchand simple', async () => {
  const r = await api().patch(`/api/v1/admin/organizations/${ctx.superId}`).set(auth(ctx.t)).send({ type: 'merchant' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'HAS_CHILDREN');
});

test('liste des téléphones vendus : IMEI, acquéreur, CNI', async () => {
  // préparer une vente dans la boutique du sous-marchand A
  const imei = (() => {
    const base = '35912345678901';
    let s = 0;
    for (let i = 0; i < 14; i += 1) { let d = Number(base[i]); if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; }
    return base + ((10 - (s % 10)) % 10);
  })();
  const subLogin = await api().post('/api/v1/auth/login').send({ phone: '0101333333', pin: '9999' });
  const ut = subLogin.body.access_token;
  const brands = await api().get('/api/v1/catalog/brands');
  const samsung = brands.body.items.find((x) => x.name === 'Samsung');
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
  const up = async () => (await api().post('/api/v1/uploads/id-document').set(auth(ut)).attach('file', JPEG, 'cni.jpg')).body.key;
  const sale = await api()
    .post('/api/v1/transactions/sales')
    .set(auth(ut))
    .send({
      device: { imei1: imei, brand_id: samsung.id, model_label: 'Galaxy A06' },
      person: { full_name: 'Aya Koné', phone1: '0102030405', phone2: '0607080910', id_doc_type: 'CNI', id_doc_number: 'CI998877', id_doc_front_key: await up(), id_doc_back_key: await up() },
      condition: 'new', price: 90000
    });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));

  const list = await api().get('/api/v1/admin/sales').set(auth(ctx.t));
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  const row = list.body.items[0];
  assert.equal(row.imei1, imei);
  assert.equal(row.buyer_name, 'Aya Koné');
  assert.equal(row.buyer_phone1, '+2250102030405');
  assert.equal(row.buyer_id_doc_number, 'CI998877');

  // recherche par numéro de CNI
  const byCni = await api().get('/api/v1/admin/sales?q=CI998877').set(auth(ctx.t));
  assert.equal(byCni.body.total, 1);
  // recherche par IMEI
  const byImei = await api().get(`/api/v1/admin/sales?q=${imei.slice(0, 8)}`).set(auth(ctx.t));
  assert.equal(byImei.body.total, 1);
});

test('suppression : sous-marchand sans historique, puis le super marchand', async () => {
  // le super marchand ne peut pas être supprimé tant qu'il a des enfants
  assert.equal((await api().delete(`/api/v1/admin/organizations/${ctx.superId}`).set(auth(ctx.t))).body.error.code, 'HAS_CHILDREN');
  // le sous-marchand A a une vente : suppression refusée
  assert.equal((await api().delete(`/api/v1/admin/organizations/${ctx.subA}`).set(auth(ctx.t))).body.error.code, 'HAS_HISTORY');
  // le sous-marchand B est vierge : supprimable
  assert.equal((await api().delete(`/api/v1/admin/organizations/${ctx.subB}`).set(auth(ctx.t))).status, 204);
});

test('marchand simple autonome', async () => {
  const r = await api()
    .post('/api/v1/admin/organizations')
    .set(auth(ctx.t))
    .send({ type: 'merchant', name: 'Phone Center Yop', rccm: 'CI-ABJ-2026-B-2', email: 'pc@ci.ci', phone: '0708444444', ...LOC, owner: { full_name: 'Traoré Ali', phone: '0708444444', pin: '1111' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.shop_id);
  assert.equal(r.body.organization.parent_id, null);
  assert.equal(r.body.organization.max_shops, 1);
});

test('mon profil : nom, e-mail et mot de passe', async () => {
  const bad = await api().patch('/api/v1/admin/me').set(auth(ctx.t)).send({ full_name: 'Nouveau', current_password: 'faux' });
  assert.equal(bad.body.error.code, 'INVALID_PASSWORD');
  const ok = await api().patch('/api/v1/admin/me').set(auth(ctx.t)).send({ full_name: 'Toma K.', email: 'toma@garan.ci', current_password: 'MotDePasse!2026' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.admin.email, 'toma@garan.ci');
  const pw = await api().post('/api/v1/admin/me/password').set(auth(ctx.t)).send({ current_password: 'MotDePasse!2026', new_password: 'NouveauSecret#2026' });
  assert.equal(pw.status, 204);
  assert.equal((await api().post('/api/v1/auth/refresh').send({ refresh_token: ctx.refresh })).status, 401);
  const login = await api().post('/api/v1/auth/admin/login').send({ email: 'toma@garan.ci', password: 'NouveauSecret#2026' });
  ctx.t = login.body.access_token;
});

test('CRUD des administrateurs', async () => {
  const c = await api().post('/api/v1/admin/admins').set(auth(ctx.t)).send({ email: 'agent@garan.ci', full_name: 'Agent', role: 'support', password: 'Support!2026' });
  assert.equal(c.status, 201);
  const u = await api().patch(`/api/v1/admin/admins/${c.body.id}`).set(auth(ctx.t)).send({ email: 'support@garan.ci', role: 'admin' });
  assert.equal(u.body.email, 'support@garan.ci');
  const me = await api().get('/api/v1/admin/me').set(auth(ctx.t));
  assert.equal((await api().delete(`/api/v1/admin/admins/${me.body.admin.id}`).set(auth(ctx.t))).status, 403);
  assert.equal((await api().delete(`/api/v1/admin/admins/${c.body.id}`).set(auth(ctx.t))).status, 204);
  assert.equal((await api().get('/api/v1/admin/admins').set(auth(ctx.t))).body.items.length, 1);
});
