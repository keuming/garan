/**
 * Tests d'intégration de bout en bout sur une vraie base PostgreSQL.
 * TEST_DATABASE_URL doit pointer vers une base JETABLE (elle est entièrement réinitialisée).
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
  STORAGE_DRIVER: process.env.TEST_STORAGE_DRIVER ?? 'local',
  STORAGE_LOCAL_DIR: await fs.mkdtemp(path.join(os.tmpdir(), 'garan-storage-')),
  BCRYPT_ROUNDS: '4',
  PUBLIC_WEB_URL: 'https://garan.test'
});

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const app = createApp();
const api = () => request(app);

/** Génère un IMEI valide (clé de Luhn) à partir de 14 chiffres. */
function imei(body14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let d = Number(body14[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body14 + ((10 - (sum % 10)) % 10);
}
const IMEI_A = imei('35693803564380');
const IMEI_B = imei('35693803564381');
const IMEI_C = imei('35693803564382');
const IMEI_D = imei('86012345678901');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const ctx = {};

before(async () => {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of (await fs.readdir(path.join(here, '..', 'migrations'))).sort()) {
    await c.query(await fs.readFile(path.join(here, '..', 'migrations', f), 'utf8'));
  }
  await c.end();
});

after(async () => {
  await pool.end();
});

async function register(shopName, loginPhone) {
  const res = await api()
    .post('/api/v1/auth/register')
    .send({
      country: "Côte d'Ivoire",
      city: 'Abidjan',
      district: 'Adjamé',
      shop_name: shopName,
      contact_phone: loginPhone,
      email: `${shopName.toLowerCase().replace(/\W/g, '')}@exemple.ci`,
      rccm: 'CI-ABJ-2026-B-12345',
      login_phone: loginPhone,
      pin: '1234'
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function uploadId(token) {
  const res = await api().post('/api/v1/uploads/id-document').set(bearer(token)).attach('file', JPEG, 'cni.jpg');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.key;
}

async function person(token, name, doc, phones) {
  return {
    full_name: name,
    phone1: phones[0],
    phone2: phones[1],
    email: '',
    id_doc_type: 'CNI',
    id_doc_number: doc,
    id_doc_front_key: await uploadId(token),
    id_doc_back_key: await uploadId(token)
  };
}

test('santé et référentiel', async () => {
  const h = await api().get('/health');
  assert.equal(h.body.db, 'ok');
  const brands = await api().get('/api/v1/catalog/brands');
  assert.ok(brands.body.items.length >= 10);
  ctx.samsung = brands.body.items.find((b) => b.name === 'Samsung');
  const models = await api().get(`/api/v1/catalog/models?brand_id=${ctx.samsung.id}`);
  ctx.a15 = models.body.items.find((m) => m.name === 'Galaxy A15');
  assert.ok(ctx.a15);
});

test('inscription de deux boutiques et profil', async () => {
  const a = await register('Boutique Alpha', '0707000001');
  const b = await register('Boutique Beta', '0505000002');
  ctx.a = a;
  ctx.b = b;
  assert.equal(a.user.role, 'owner');
  assert.equal(a.user.phone, '+2250707000001');
  assert.equal(a.user.shops.length, 1);
  assert.equal(a.user.organization.status, 'trial');

  const dup = await api()
    .post('/api/v1/auth/register')
    .send({ country: 'CI', city: 'Abidjan', district: 'X', shop_name: 'Dup', contact_phone: '0707000001', email: 'd@d.ci', rccm: 'R', login_phone: '0707000001', pin: '1234' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'PHONE_TAKEN');
});

test('IMEI invalide refusé (clé de Luhn)', async () => {
  const res = await api().get('/api/v1/devices/check/356938035643801').set(bearer(ctx.a.access_token));
  assert.equal(res.status, 400);
});

test('entrée en stock puis doublon refusé', async () => {
  const body = { device: { imei1: IMEI_A, brand_id: ctx.samsung.id, model_id: ctx.a15.id, storage_gb: 128 }, condition: 'new', price: 95000, supplier_name: 'Grossiste Plateau' };
  const r1 = await api().post('/api/v1/transactions/stock-in').set(bearer(ctx.a.access_token)).send(body);
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(r1.body.type, 'stock_in');
  assert.match(r1.body.receipt_number, /^GR\d{6}-\d{7}$/);
  const r2 = await api().post('/api/v1/transactions/stock-in').set(bearer(ctx.a.access_token)).send(body);
  assert.equal(r2.status, 409);
  assert.equal(r2.body.error.code, 'ALREADY_IN_STOCK');

  const check = await api().get(`/api/v1/devices/check/${IMEI_A}`).set(bearer(ctx.a.access_token));
  assert.equal(check.body.ownership, 'my_org'); // le compte principal voit le stock de toute l'organisation
  assert.equal(check.body.can_sell, true);
});

test('vente : pièce d’identité obligatoire, puis certificat public', async () => {
  const noPhotos = await api()
    .post('/api/v1/transactions/sales')
    .set(bearer(ctx.a.access_token))
    .send({
      device: { imei1: IMEI_A },
      person: { full_name: 'Konan Yao', phone1: '0101010101', phone2: '0202020202', id_doc_type: 'CNI', id_doc_number: 'CI001' },
      condition: 'new',
      price: 120000
    });
  assert.equal(noPhotos.status, 400);
  assert.equal(noPhotos.body.error.code, 'ID_PHOTOS_REQUIRED');

  ctx.p1 = await person(ctx.a.access_token, 'Konan Yao', 'CI0012345', ['0101010101', '0202020202']);
  const sale = await api()
    .post('/api/v1/transactions/sales')
    .set(bearer(ctx.a.access_token))
    .send({ device: { imei1: IMEI_A }, person: ctx.p1, condition: 'new', price: 120000 });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  assert.equal(sale.body.person.full_name, 'Konan Yao');
  assert.equal(sale.body.device.model, 'Galaxy A15');
  assert.ok(sale.body.certificate_url.startsWith('https://garan.test/v/'));
  ctx.saleA = sale.body;

  const cert = await api().get(`/api/v1/public/certificates/${sale.body.verification_code}`);
  assert.equal(cert.status, 200);
  assert.equal(cert.body.is_current_owner, true);
  assert.equal(cert.body.buyer.startsWith('K'), true);
  assert.ok(!cert.body.buyer.includes('Konan'));
  assert.ok(cert.body.device.imei.includes('•'));
});

test('rachat refusé si le vendeur n’est pas le propriétaire, alerte créée', async () => {
  const thief = await person(ctx.b.access_token, 'Inconnu Voleur', 'CI0099999', ['0303030303', '0404040404']);
  const res = await api()
    .post('/api/v1/transactions/purchases')
    .set(bearer(ctx.b.access_token))
    .send({ device: { imei1: IMEI_A }, person: thief, condition: 'used', price: 50000 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'OWNERSHIP_MISMATCH');
  await new Promise((r) => setTimeout(r, 100));
  const { rows } = await pool.query(`SELECT * FROM security_alerts WHERE type = 'ownership_mismatch'`);
  assert.equal(rows.length, 1);
});

test('rachat accepté auprès du vrai propriétaire (photos déjà au dossier)', async () => {
  const res = await api()
    .post('/api/v1/transactions/purchases')
    .set(bearer(ctx.b.access_token))
    .send({
      device: { imei1: IMEI_A },
      person: { full_name: 'Konan Yao', phone1: '0101010101', phone2: '0202020202', id_doc_type: 'CNI', id_doc_number: 'ci 0012345' },
      condition: 'like_new',
      price: 80000
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const cert = await api().get(`/api/v1/public/certificates/${ctx.saleA.verification_code}`);
  assert.equal(cert.body.is_current_owner, false);

  const resell = await api()
    .post('/api/v1/transactions/sales')
    .set(bearer(ctx.a.access_token))
    .send({ device: { imei1: IMEI_A }, person: ctx.p1, condition: 'used', price: 1 });
  assert.equal(resell.status, 409);
  assert.equal(resell.body.error.code, 'OWNED_BY_OTHER_SHOP');
});

test('déclaration de vol confirmée automatiquement puis rachat bloqué', async () => {
  const p3 = await person(ctx.a.access_token, 'Bamba Awa', 'CI0033333', ['0707070707', '0505050505']);
  const sale = await api()
    .post('/api/v1/transactions/sales')
    .set(bearer(ctx.a.access_token))
    .send({ device: { imei1: IMEI_B, imei2: IMEI_C, brand_id: ctx.samsung.id, model_id: ctx.a15.id }, person: p3, condition: 'new', price: 110000 });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));

  const report = await api()
    .post('/api/v1/public/theft-reports')
    .send({ imei: IMEI_C, reporter_name: 'Bamba Awa', reporter_phone: '0707070707', id_doc_type: 'CNI', id_doc_number: 'CI0033333', police_report_number: 'PV-123' });
  assert.equal(report.status, 201);
  assert.equal(report.body.status, 'confirmed');

  const pub = await api().get(`/api/v1/public/imei/${IMEI_B}`);
  assert.equal(pub.body.result, 'reported');

  const buy = await api()
    .post('/api/v1/transactions/purchases')
    .set(bearer(ctx.b.access_token))
    .send({ device: { imei1: IMEI_B }, person: p3, condition: 'used', price: 30000 });
  assert.equal(buy.status, 409);
  assert.equal(buy.body.error.code, 'DEVICE_REPORTED');
});

test('états de vente par marque et modèle', async () => {
  const res = await api().get('/api/v1/stats/summary?type=sale').set(bearer(ctx.a.access_token));
  assert.equal(res.status, 200);
  assert.equal(res.body.total_count, 2);
  assert.equal(res.body.total_amount, 230000);
  assert.equal(res.body.by_brand[0].brand, 'Samsung');
  assert.equal(res.body.by_model[0].model, 'Galaxy A15');

  const list = await api().get(`/api/v1/transactions?q=${IMEI_A}`).set(bearer(ctx.a.access_token));
  assert.equal(list.body.total, 2);
});

test('superviseur : agent de magasin, droits restreints', async () => {
  const shopId = ctx.a.user.shops[0].id;
  const created = await api()
    .post('/api/v1/org/users')
    .set(bearer(ctx.a.access_token))
    .send({ full_name: 'Agent Un', phone: '0758000001', pin: '4321', shop_id: shopId });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const login = await api().post('/api/v1/auth/login').send({ phone: '+225 07 58 00 00 01', pin: '4321' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'agent');
  const agent = login.body.access_token;

  const forbidden = await api().get('/api/v1/org/users').set(bearer(agent));
  assert.equal(forbidden.status, 403);

  const stock = await api()
    .post('/api/v1/transactions/stock-in')
    .set(bearer(agent))
    .send({ device: { imei1: IMEI_D, brand_id: ctx.samsung.id, model_label: 'Galaxy A06' }, condition: 'new', price: 70000 });
  assert.equal(stock.status, 201, JSON.stringify(stock.body));
  assert.equal(stock.body.device.model, 'Galaxy A06');

  const shopLimit = await api()
    .post('/api/v1/org/shops')
    .set(bearer(ctx.a.access_token))
    .send({ name: 'Alpha 2', phone: '0707000099', country: 'CI', city: 'Abidjan', district: 'Yopougon' });
  assert.equal(shopLimit.status, 402);
});

test('verrouillage après 5 PIN erronés', async () => {
  for (let i = 0; i < 5; i += 1) {
    const r = await api().post('/api/v1/auth/login').send({ phone: '0505000002', pin: '0000' });
    assert.equal(r.status, 401);
  }
  const locked = await api().post('/api/v1/auth/login').send({ phone: '0505000002', pin: '1234' });
  assert.equal(locked.status, 423);
});

test('rotation du jeton de rafraîchissement', async () => {
  const r1 = await api().post('/api/v1/auth/refresh').send({ refresh_token: ctx.a.refresh_token });
  assert.equal(r1.status, 200);
  const reuse = await api().post('/api/v1/auth/refresh').send({ refresh_token: ctx.a.refresh_token });
  assert.equal(reuse.status, 401);
  ctx.a.access_token = r1.body.access_token;
});

test('abonnement expiré : écritures bloquées, lectures permises', async () => {
  await pool.query(`UPDATE organizations SET subscription_expires_at = now() - interval '1 day' WHERE id = $1`, [ctx.a.user.organization.id]);
  const w = await api().get(`/api/v1/devices/check/${IMEI_A}`).set(bearer(ctx.a.access_token));
  assert.equal(w.status, 402);
  const r = await api().get('/api/v1/transactions').set(bearer(ctx.a.access_token));
  assert.equal(r.status, 200);
});

test('registre immuable au niveau base', async () => {
  await assert.rejects(pool.query(`UPDATE transactions SET price = 0`), /immuable/);
  await assert.rejects(pool.query(`DELETE FROM transactions`), /immuable/);
});

test('back-office : connexion, enquête IMEI, pièce, paiement', async () => {
  const bcrypt = (await import('bcryptjs')).default;
  await pool.query(`INSERT INTO admins (email, full_name, role, password_hash) VALUES ('admin@garan.ci', 'Admin', 'superadmin', $1)`, [
    await bcrypt.hash('MotDePasse!2026', 4)
  ]);
  const login = await api().post('/api/v1/auth/admin/login').send({ email: 'ADMIN@garan.ci', password: 'MotDePasse!2026' });
  assert.equal(login.status, 200);
  const t = login.body.access_token;

  const userToken = await api().get('/api/v1/admin/dashboard').set(bearer(ctx.b.access_token));
  assert.equal(userToken.status, 401);

  const dash = await api().get('/api/v1/admin/dashboard').set(bearer(t));
  assert.equal(dash.status, 200);
  assert.equal(dash.body.organizations, 2);
  assert.equal(dash.body.daily.length, 14);

  const dev = await api().get(`/api/v1/admin/devices/${IMEI_A}`).set(bearer(t));
  assert.equal(dev.body.history.length, 3);
  const key = dev.body.history.find((h) => h.type === 'sale').person.id_doc_front_key;
  const doc = await api().get(`/api/v1/admin/documents?key=${encodeURIComponent(key)}`).set(bearer(t));
  assert.equal(doc.status, 200);
  assert.equal(doc.headers['content-type'], 'image/jpeg');

  const pay = await api()
    .post(`/api/v1/admin/organizations/${ctx.a.user.organization.id}/payments`)
    .set(bearer(t))
    .send({ amount: 15000, months: 1, method: 'mobile_money', reference: 'MM-001' });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.organization.status, 'active');
  assert.ok(new Date(pay.body.organization.subscription_expires_at) > new Date());

  const again = await api().get(`/api/v1/devices/check/${IMEI_A}`).set(bearer(ctx.a.access_token));
  assert.equal(again.status, 200);

  const alerts = await api().get('/api/v1/admin/alerts?status=open').set(bearer(t));
  assert.equal(alerts.body.total, 2);

  const audit = await api().get('/api/v1/admin/audit-logs?action=admin.document').set(bearer(t));
  assert.equal(audit.body.items.length, 1);
});

/* ===================================================================
 * Disponibilité (vitrine), paiement ORZAYAH et décrément à la vente
 * =================================================================== */
const IMEI_E = imei('35693803564390');

test('profil marchand : identifiant ORZAYAH', async () => {
  const prof = await api().patch('/api/v1/org/profile').set(bearer(ctx.a.access_token)).send({ orzayah_number: '0700000000' });
  assert.equal(prof.status, 200);
  assert.equal(prof.body.orzayah_number, '0700000000');
  // Encaissement ORZAYAH : la vente par ORZAYAH exige une clé marchand chiffrée en base.
  await pool.query(`UPDATE organizations SET orzayah_api_key_enc = 'enc-test', orzayah_api_key_last4 = '1234' WHERE id = $1`, [ctx.a.user.organization.id]);
});

test('disponibilité : création, liste et vitrine publique', async () => {
  const shopId = ctx.a.user.shops[0].id;
  const create = await api()
    .post('/api/v1/org/listings')
    .set(bearer(ctx.a.access_token))
    .send({ brand_id: ctx.samsung.id, model_id: ctx.a15.id, description: 'Neuf sous blister', price: 85000, quantity: 3 });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.equal(create.body.quantity, 3);
  assert.equal(create.body.title, 'Samsung Galaxy A15');
  assert.equal(create.body.price, 85000);
  ctx.listing = create.body;

  const avail = await api().get('/api/v1/org/listings?available=1').set(bearer(ctx.a.access_token));
  assert.ok(avail.body.items.some((l) => l.id === ctx.listing.id));

  const vitrine = await api().get(`/api/v1/public/shops/${shopId}`);
  assert.equal(vitrine.status, 200);
  assert.equal(vitrine.body.shop.id, shopId);
  assert.ok(vitrine.body.items.some((l) => l.id === ctx.listing.id && l.quantity === 3));
});

test('vente liée à un article : décrément du stock + mode de paiement', async () => {
  const buyer = await person(ctx.a.access_token, 'Awa Traoré', 'CI0077777', ['0909090909', '0808080808']);
  const sale = await api()
    .post('/api/v1/transactions/sales')
    .set(bearer(ctx.a.access_token))
    .send({
      device: { imei1: IMEI_E, brand_id: ctx.samsung.id, model_id: ctx.a15.id },
      person: buyer,
      condition: 'new',
      price: 85000,
      payment_method: 'orzayah',
      listing_id: ctx.listing.id
    });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  assert.equal(sale.body.payment_method, 'orzayah');
  assert.equal(sale.body.organization.name, 'Boutique Alpha');

  const after = await api().get('/api/v1/org/listings').set(bearer(ctx.a.access_token));
  const l = after.body.items.find((x) => x.id === ctx.listing.id);
  assert.equal(l.quantity, 2); // décrémenté de 3 à 2
});

test('abonnement marchand : garde-fou sans clé ORZAYAH', async () => {
  // Sans ORZAYAH_API_URL/KEY configurés, l'initiation est refusée proprement (503).
  const r = await api()
    .post('/api/v1/org/subscription/orzayah')
    .set(bearer(ctx.a.access_token))
    .send({ operator: 'WAVE', account_number: '0700000000', months: 1 });
  assert.equal(r.status, 503, JSON.stringify(r.body));
  assert.equal(r.body.error.code, 'ORZAYAH_NOT_CONFIGURED');
});

/* ===================================================================
 * Déclaration de vol (marchand) + registre public des téléphones volés
 * =================================================================== */
const IMEI_F = imei('35693803564391');

test('marchand : déclaration de vol d\'un téléphone en stock + registre public', async () => {
  // Entrée en stock d'un téléphone chez ctx.a
  const stock = await api()
    .post('/api/v1/transactions/stock-in')
    .set(bearer(ctx.a.access_token))
    .send({ device: { imei1: IMEI_F, brand_id: ctx.samsung.id, model_id: ctx.a15.id }, condition: 'new', price: 60000 });
  assert.equal(stock.status, 201, JSON.stringify(stock.body));

  // Déclaration de vol : confirmée car l'appareil est dans le stock du marchand
  const rep = await api()
    .post('/api/v1/report-theft')
    .set(bearer(ctx.a.access_token))
    .send({ imei: IMEI_F, kind: 'stolen', description: 'Vol à l’étalage' });
  assert.equal(rep.status, 201, JSON.stringify(rep.body));
  assert.equal(rep.body.status, 'confirmed');

  // Registre public : le téléphone apparaît comme volé
  const list = await api().get('/api/v1/public/stolen-devices');
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((x) => x.imei1 === IMEI_F && x.kind === 'stolen'));

  // La recherche par IMEI le trouve aussi
  const search = await api().get(`/api/v1/public/stolen-devices?q=${IMEI_F}`);
  assert.ok(search.body.items.some((x) => x.imei1 === IMEI_F));

  // Et la vérification publique le signale désormais
  const check = await api().get(`/api/v1/public/imei/${IMEI_F}`);
  assert.equal(check.body.result, 'reported');
});

/* ===================================================================
 * Abonnement ORZAYAH — câblage (clé non configurée en test → 503 propre)
 * =================================================================== */
test('abonnement : tarif marchand et garde-fou sans clé ORZAYAH', async () => {
  const plan = await api().get('/api/v1/org/subscription/plan').set(bearer(ctx.a.access_token));
  assert.equal(plan.status, 200);
  assert.equal(plan.body.price_fcfa, 1000);

  // Sans clé ORZAYAH configurée, l'initiation renvoie une erreur métier claire (503), pas un crash.
  const sub = await api()
    .post('/api/v1/org/subscription/orzayah')
    .set(bearer(ctx.a.access_token))
    .send({ operator: 'WAVE', account_number: '0700000000', months: 1 });
  assert.equal(sub.status, 503);
  assert.equal(sub.body.error.code, 'ORZAYAH_NOT_CONFIGURED');

  // Le solde admin répond configured:false proprement
  const t = (await api().post('/api/v1/auth/admin/login').send({ email: 'ADMIN@garan.ci', password: 'MotDePasse!2026' })).body.access_token;
  const bal = await api().get('/api/v1/admin/orzayah/balance').set(bearer(t));
  assert.equal(bal.status, 200);
  assert.equal(bal.body.configured, false);
});

test('back-office : demande de blocage operateur generee et suivie', async () => {
  const t = (await api().post('/api/v1/auth/admin/login').send({ email: 'ADMIN@garan.ci', password: 'MotDePasse!2026' })).body.access_token;
  const list = await api().get('/api/v1/admin/block-requests').set(bearer(t));
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const br = list.body.items.find((x) => x.imei === IMEI_F);
  assert.ok(br, 'demande de blocage creee pour le telephone vole');
  assert.equal(br.status, 'requested');
  const detail = await api().get(`/api/v1/admin/block-requests/${br.id}`).set(bearer(t));
  assert.equal(detail.status, 200);
  assert.ok(detail.body.request_text.includes(IMEI_F));
  const trans = await api().patch(`/api/v1/admin/block-requests/${br.id}`).set(bearer(t)).send({ status: 'transmitted', operator: 'Orange CI' });
  assert.equal(trans.status, 200, JSON.stringify(trans.body));
  assert.equal(trans.body.status, 'transmitted');
  assert.ok(trans.body.transmitted_at);
  const blocked = await api().patch(`/api/v1/admin/block-requests/${br.id}`).set(bearer(t)).send({ status: 'blocked', operator_reference: 'OPS-2026-001' });
  assert.equal(blocked.body.status, 'blocked');
  assert.ok(blocked.body.blocked_at);
});
