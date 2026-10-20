/**
 * Usagers (propriétaires finaux) : inscription, linkage/délinkage d'un téléphone,
 * inscription marchand/super marchand depuis le mobile, et chaîne de propriété au back-office.
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
if (!DB_URL) { console.error('TEST_DATABASE_URL requis'); process.exit(1); }

Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: DB_URL, DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'false',
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123',
  STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: await fs.mkdtemp(path.join(os.tmpdir(), 'garan-storage-')), BCRYPT_ROUNDS: '4'
});

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const bcrypt = (await import('bcryptjs')).default;
const app = createApp();
const api = () => request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ctx = {};

function imei(base14) {
  let s = 0;
  for (let i = 0; i < 14; i += 1) { let d = Number(base14[i]); if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; }
  return base14 + ((10 - (s % 10)) % 10);
}
const IMEI = imei('35988800011122');

before(async () => {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of (await fs.readdir(path.join(here, '..', 'migrations'))).sort()) {
    await c.query(await fs.readFile(path.join(here, '..', 'migrations', f), 'utf8'));
  }
  await c.query(`INSERT INTO admins (email, full_name, role, password_hash) VALUES ('boss@garan.ci', 'Boss', 'superadmin', $1)`, [await bcrypt.hash('MotDePasse!2026', 4)]);
  await c.end();
  ctx.admin = (await api().post('/api/v1/auth/admin/login').send({ email: 'boss@garan.ci', password: 'MotDePasse!2026' })).body.access_token;
});
after(() => pool.end());

test('inscription super marchand depuis le mobile → visible au back-office', async () => {
  const r = await api().post('/api/v1/auth/register').send({
    type: 'super_merchant', country: 'CI', city: 'Abidjan', district: 'Plateau',
    shop_name: 'Grossiste Mobile', contact_phone: '0700000010', email: 'gm@ci.ci', rccm: 'CI-M-1',
    login_phone: '0700000010', pin: '1234'
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.organization.type, 'super_merchant');
  const list = await api().get('/api/v1/admin/organizations?type=super_merchant').set(auth(ctx.admin));
  assert.ok(list.body.items.some((o) => o.name === 'Grossiste Mobile'));
});

test('inscription marchand simple depuis le mobile a bien une boutique', async () => {
  const r = await api().post('/api/v1/auth/register').send({
    country: 'CI', city: 'Abidjan', district: 'Cocody', shop_name: 'Boutique Mobile',
    contact_phone: '0700000011', email: 'bm@ci.ci', rccm: 'CI-M-2', login_phone: '0700000011', pin: '1234'
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.organization.type, 'merchant');
  assert.equal(r.body.user.shops.length, 1);
});

test('usager : inscription et connexion', async () => {
  const r = await api().post('/api/v1/consumer/auth/register').send({ full_name: 'Aya Koné', phone: '0102030405', email: 'aya@mail.ci', pin: '2468' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ctx.aya = r.body.access_token;
  assert.equal(r.body.consumer.full_name, 'Aya Koné');
  const dup = await api().post('/api/v1/consumer/auth/register').send({ full_name: 'X', phone: '0102030405', pin: '0000' });
  assert.equal(dup.status, 409);
  const login = await api().post('/api/v1/consumer/auth/login').send({ phone: '0102030405', pin: '2468' });
  assert.equal(login.status, 200);
});

test('usager : linkage d’un téléphone acquis (avec reçu et photo du carton)', async () => {
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
  const up = async () => (await api().post('/api/v1/consumer/uploads').set(auth(ctx.aya)).attach('file', JPEG, 'r.jpg')).body.key;
  const brands = await api().get('/api/v1/catalog/brands');
  const samsung = brands.body.items.find((x) => x.name === 'Samsung');

  const check = await api().get(`/api/v1/consumer/devices/check/${IMEI}`).set(auth(ctx.aya));
  assert.equal(check.body.can_register, true);

  const reg = await api().post('/api/v1/consumer/devices/register').set(auth(ctx.aya)).send({
    imei1: IMEI, brand_id: samsung.id, model_label: 'Galaxy A15',
    purchase_place: 'Marché d’Adjamé', merchant_name: 'Boutique Mobile', receipt_number: 'R-123',
    receipt_key: await up(), box_photo_key: await up()
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));

  const mine = await api().get('/api/v1/consumer/devices').set(auth(ctx.aya));
  assert.equal(mine.body.items.length, 1);
  assert.equal(mine.body.items[0].status, 'active');
  assert.equal(mine.body.items[0].merchant_name, 'Boutique Mobile');

  // re-linkage du même → déjà à moi
  const again = await api().get(`/api/v1/consumer/devices/check/${IMEI}`).set(auth(ctx.aya));
  assert.equal(again.body.mine_already, true);
});

test('un autre usager ne peut pas enregistrer un téléphone déjà lié', async () => {
  const bob = (await api().post('/api/v1/consumer/auth/register').send({ full_name: 'Bob Yao', phone: '0708090102', pin: '1357' })).body.access_token;
  ctx.bob = bob;
  const check = await api().get(`/api/v1/consumer/devices/check/${IMEI}`).set(auth(bob));
  assert.equal(check.body.held_by_other, true);
  assert.equal(check.body.can_register, false);
  const reg = await api().post('/api/v1/consumer/devices/register').set(auth(bob)).send({ imei1: IMEI });
  assert.equal(reg.status, 409);
  assert.equal(reg.body.error.code, 'HELD_BY_OTHER');
});

test('délinkage puis reprise par le nouvel usager', async () => {
  const mine = await api().get('/api/v1/consumer/devices').set(auth(ctx.aya));
  const regId = mine.body.items[0].registration_id;
  assert.equal((await api().post(`/api/v1/consumer/devices/${regId}/release`).set(auth(ctx.aya))).status, 204);
  // Bob peut maintenant l'enregistrer
  const reg = await api().post('/api/v1/consumer/devices/register').set(auth(ctx.bob)).send({ imei1: IMEI });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
});

test('back-office : chaîne de propriété (tous les détenteurs, du plus ancien au plus récent)', async () => {
  const r = await api().get(`/api/v1/admin/devices/${IMEI}`).set(auth(ctx.admin));
  assert.equal(r.status, 200);
  assert.equal(r.body.owners.length, 2);
  assert.equal(r.body.owners[0].name, 'Aya Koné');
  assert.equal(r.body.owners[0].current, false);
  assert.equal(r.body.owners[1].name, 'Bob Yao');
  assert.equal(r.body.owners[1].current, true);
  assert.equal(r.body.owners[1].phone, '+2250708090102');
});

test('back-office : liste et fiche des usagers', async () => {
  const list = await api().get('/api/v1/admin/consumers').set(auth(ctx.admin));
  assert.equal(list.body.total, 2);
  const aya = list.body.items.find((c) => c.full_name === 'Aya Koné');
  assert.equal(aya.active_devices, 0);
  assert.equal(aya.total_devices, 1);
  const detail = await api().get(`/api/v1/admin/consumers/${aya.id}`).set(auth(ctx.admin));
  assert.equal(detail.body.devices.length, 1);
  assert.equal(detail.body.devices[0].status, 'released');
});

test('téléphone signalé volé : enregistrement usager refusé', async () => {
  const stolenImei = imei('35988800099988');
  // créer et signaler l'appareil
  await pool.query(`INSERT INTO devices (imei1, status) VALUES ($1, 'stolen')`, [stolenImei]);
  const reg = await api().post('/api/v1/consumer/devices/register').set(auth(ctx.aya)).send({ imei1: stolenImei, brand_id: 1, model_label: 'X' });
  assert.equal(reg.status, 409);
  assert.equal(reg.body.error.code, 'DEVICE_REPORTED');
});

test('usager : marque en saisie libre (hors catalogue)', async () => {
  const r = await api().post('/api/v1/consumer/auth/register').send({ full_name: 'Zola Libre', phone: '0109090909', email: 'zola@mail.ci', pin: '1357' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const token = r.body.access_token;
  const freeImei = imei('35988800123450');
  const reg = await api().post('/api/v1/consumer/devices/register').set(auth(token)).send({
    imei1: freeImei, brand_label: 'Blackview', model_label: 'BL9000'
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const mine = await api().get('/api/v1/consumer/devices').set(auth(token));
  const dev = mine.body.items.find((d) => d.imei1 === freeImei);
  assert.ok(dev, 'appareil présent dans la liste');
  assert.equal(dev.brand, 'Blackview');
  assert.equal(dev.model, 'BL9000');

  const bad = await api().post('/api/v1/consumer/auth/register').send({ full_name: 'No Brand', phone: '0108080808', pin: '2222' });
  const bt = bad.body.access_token;
  const miss = await api().post('/api/v1/consumer/devices/register').set(auth(bt)).send({ imei1: imei('35988800123468') });
  assert.equal(miss.status, 400);
  assert.equal(miss.body.error.code, 'DEVICE_DETAILS_REQUIRED');
});

test('usager : changement e-mail met a jour le compte', async () => {
  const r = await api().post('/api/v1/consumer/auth/register').send({ full_name: 'Mail Test', phone: '0107070707', email: 'old@mail.ci', pin: '3333' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const token = r.body.access_token;
  const upd = await api().patch('/api/v1/consumer/me').set(auth(token)).send({ email: 'new@mail.ci' });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.consumer.email, 'new@mail.ci');
});
