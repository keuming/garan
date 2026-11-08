import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { randomCode, hashSecret } from '../lib/security.js';
import { audit } from '../lib/audit.js';
import { logger } from '../logger.js';
import { salePaymentView } from './sale-payment.service.js';
import { SETUP_FCFA, PLAN_FCFA } from './subscription.service.js';

/* =====================================================================
 * Cœur métier du registre : entrée en stock, rachat, vente.
 * Chaque opération s'exécute dans une transaction SQL avec verrou sur
 * l'appareil (FOR UPDATE) pour empêcher deux ventes concurrentes.
 * ===================================================================== */

export const DEVICE_COLUMNS = `
  d.id, d.imei1, d.imei2, d.device_type, d.serial_number, d.brand_id, d.model_id, d.model_label, d.color, d.storage_gb,
  d.status, d.owner_type, d.owner_shop_id, d.owner_person_id, d.created_at,
  COALESCE(b.name, d.brand_label) AS brand_name, COALESCE(m.name, d.model_label) AS model_name,
  os.organization_id AS owner_org_id`;

// Noms d'appareil selon le type (pour des messages justes téléphone/ordinateur/…).
const TYPE_NOUN = { phone: 'téléphone', computer: 'ordinateur', tablet: 'tablette', other: 'appareil' };
const nounFor = (t) => TYPE_NOUN[t] ?? 'appareil';

/** Recherche un appareil par son identifiant : IMEI (1 ou 2) ou numéro de série. */
export async function findDeviceByImei(client, identifier, { lock = false } = {}) {
  const { rows } = await client.query(
    `SELECT ${DEVICE_COLUMNS}
     FROM devices d
     LEFT JOIN brands b ON b.id = d.brand_id
     LEFT JOIN models m ON m.id = d.model_id
     LEFT JOIN shops os ON os.id = d.owner_shop_id
     WHERE d.imei1 = $1 OR d.imei2 = $1 OR upper(d.serial_number) = upper($1)
     ${lock ? 'FOR UPDATE OF d' : ''}`,
    [identifier]
  );
  return rows[0] ?? null;
}

/** Position de l'appareil vue par l'utilisateur connecté (sans divulguer d'identité). */
export function ownershipFor(device, auth) {
  if (!device || device.owner_type === 'none') return 'none';
  if (device.owner_type === 'person') return 'person';
  if (device.owner_shop_id === auth.shopId) return 'this_shop';
  if (device.owner_org_id === auth.orgId) return 'my_org';
  return 'other_shop';
}

const REPORTED = new Set(['stolen', 'lost', 'blocked']);

/** Résultat de la vérification préalable d'un IMEI (écran « Vérifier »). */
export async function checkDevice(identifier, auth) {
  const device = await findDeviceByImei({ query }, identifier);
  const ownership = ownershipFor(device, auth);
  const reported = device ? REPORTED.has(device.status) : false;
  const noun = device ? nounFor(device.device_type) : 'appareil';
  let message;
  if (!device) message = 'Identifiant inconnu du registre : aucun propriétaire enregistré.';
  else if (reported) message = `ALERTE : ce ${noun} est signalé volé, perdu ou bloqué. Ne pas acheter.`;
  else if (ownership === 'person') message = `${noun[0].toUpperCase()}${noun.slice(1)} enregistré au nom d’un particulier : le vendeur doit être ce propriétaire.`;
  else if (ownership === 'this_shop' || ownership === 'my_org') message = `${noun[0].toUpperCase()}${noun.slice(1)} en stock dans votre organisation.`;
  else if (ownership === 'other_shop') message = `${noun[0].toUpperCase()}${noun.slice(1)} en stock dans une autre boutique.`;
  else message = `${noun[0].toUpperCase()}${noun.slice(1)} connu, sans propriétaire actuel.`;
  return {
    imei: identifier,
    identifier,
    device_type: device?.device_type ?? null,
    serial_number: device?.serial_number ?? null,
    known: Boolean(device),
    status: device?.status ?? 'unknown',
    reported,
    ownership,
    brand: device?.brand_name ?? null,
    model: device?.model_name ?? null,
    can_buy: !reported && ['none', 'person'].includes(ownership),
    can_sell: !reported && ['none', 'this_shop', 'my_org'].includes(ownership),
    message
  };
}

/** Alerte persistée hors transaction : elle survit au rollback de l'opération refusée. */
async function raiseAlert(type, { device, imei, shopId, userId, details }) {
  try {
    await query(
      `INSERT INTO security_alerts (type, device_id, imei, shop_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, device?.id ?? null, imei, shopId, userId, details ?? {}]
    );
  } catch (err) {
    logger.error({ err, type, imei }, "Échec d'enregistrement d'une alerte de sécurité");
  }
}

function assertNotReported(device, ctx) {
  if (device && REPORTED.has(device.status)) {
    // fire-and-forget volontaire : l'alerte est indépendante de la transaction
    raiseAlert('reported_device_attempt', { device, imei: ctx.imei, shopId: ctx.shopId, userId: ctx.userId, details: ctx.details });
    throw conflict(
      'DEVICE_REPORTED',
      'Ce téléphone est signalé volé ou perdu. Opération refusée et signalée.',
      { status: device.status }
    );
  }
}

async function assertImei2Free(client, imei2, deviceId) {
  if (!imei2) return;
  const other = await findDeviceByImei(client, imei2);
  if (other && other.id !== deviceId) {
    throw conflict('IMEI2_CONFLICT', 'Le second IMEI appartient déjà à un autre appareil');
  }
}

async function createDevice(client, dev, owner) {
  const brandLabel = dev.brand_label && dev.brand_label.trim() ? dev.brand_label.trim() : null;
  if (!dev.brand_id && !brandLabel) {
    throw badRequest('DEVICE_DETAILS_REQUIRED', 'Nouvel appareil : la marque est requise');
  }
  if (!dev.model_id && !dev.model_label) {
    throw badRequest('DEVICE_DETAILS_REQUIRED', 'Nouvel appareil : le modèle est requis');
  }
  if (dev.brand_id) {
    if (dev.model_id) {
      const m = await client.query(`SELECT 1 FROM models WHERE id = $1 AND brand_id = $2`, [dev.model_id, dev.brand_id]);
      if (!m.rowCount) throw badRequest('MODEL_BRAND_MISMATCH', 'Ce modèle n’appartient pas à la marque choisie');
    } else {
      const b = await client.query(`SELECT 1 FROM brands WHERE id = $1`, [dev.brand_id]);
      if (!b.rowCount) throw badRequest('INVALID_BRAND', 'Marque inconnue');
    }
  }
  const deviceType = dev.device_type ?? 'phone';
  const serial = dev.serial_number && dev.serial_number.trim() ? dev.serial_number.trim() : null;
  // Identifiant selon le type : IMEI pour un téléphone, numéro de série sinon.
  if (deviceType === 'phone') {
    if (!dev.imei1) throw badRequest('IMEI_REQUIRED', 'L’IMEI est requis pour un téléphone');
  } else if (!serial) {
    throw badRequest('SERIAL_REQUIRED', 'Le numéro de série est requis pour cet appareil');
  }
  const imei1 = deviceType === 'phone' ? dev.imei1 : null;
  const imei2 = deviceType === 'phone' ? (dev.imei2 ?? null) : null;
  const useFreeBrand = !dev.brand_id;
  await assertImei2Free(client, imei2, null);
  const { rows } = await client.query(
    `INSERT INTO devices (imei1, imei2, device_type, serial_number, brand_id, brand_label, model_id, model_label, color, storage_gb,
                          owner_type, owner_shop_id, owner_person_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      imei1,
      imei2,
      deviceType,
      serial,
      useFreeBrand ? null : dev.brand_id,
      useFreeBrand ? brandLabel : null,
      useFreeBrand ? null : (dev.model_id ?? null),
      !useFreeBrand && dev.model_id ? null : dev.model_label,
      dev.color ?? null,
      dev.storage_gb ?? null,
      owner.type,
      owner.type === 'shop' ? owner.id : null,
      owner.type === 'person' ? owner.id : null
    ]
  );
  return rows[0].id;
}

async function setOwner(client, deviceId, owner) {
  await client.query(
    `UPDATE devices SET owner_type = $2, owner_shop_id = $3, owner_person_id = $4 WHERE id = $1`,
    [deviceId, owner.type, owner.type === 'shop' ? owner.id : null, owner.type === 'person' ? owner.id : null]
  );
}

/**
 * Crée ou met à jour une personne identifiée par (type de pièce, numéro).
 * Les photos recto/verso sont obligatoires (fournies maintenant ou déjà au dossier).
 */
async function upsertPerson(client, p, { orgId, shopId }) {
  const prefix = `id-docs/${orgId}/`;
  for (const key of [p.id_doc_front_key, p.id_doc_back_key]) {
    if (key && !key.startsWith(prefix)) throw badRequest('INVALID_DOCUMENT', 'Photo de pièce invalide');
  }
  const existing = await client.query(
    `SELECT id, id_doc_front_key, id_doc_back_key FROM persons
     WHERE id_doc_type = $1 AND upper(id_doc_number) = $2
     FOR UPDATE`,
    [p.id_doc_type, p.id_doc_number]
  );
  const front = p.id_doc_front_key ?? existing.rows[0]?.id_doc_front_key;
  const back = p.id_doc_back_key ?? existing.rows[0]?.id_doc_back_key;
  if (!front || !back) {
    throw badRequest('ID_PHOTOS_REQUIRED', 'Photos recto et verso de la pièce d’identité obligatoires');
  }
  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE persons SET phone1 = $2, phone2 = $3, email = COALESCE($4, email),
              id_doc_front_key = $5, id_doc_back_key = $6
       WHERE id = $1`,
      [id, p.phone1, p.phone2, p.email, front, back]
    );
    return id;
  }
  const { rows } = await client.query(
    `INSERT INTO persons (full_name, phone1, phone2, email, id_doc_type, id_doc_number,
                          id_doc_front_key, id_doc_back_key, created_by_shop_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [p.full_name, p.phone1, p.phone2, p.email, p.id_doc_type, p.id_doc_number, front, back, shopId]
  );
  return rows[0].id;
}

async function insertTransaction(client, t) {
  const { rows } = await client.query(
    `INSERT INTO transactions (receipt_number, verification_code, type, device_id, organization_id,
                               shop_id, user_id, person_id, condition, price, supplier_name, notes, payment_method)
     VALUES ('GR' || to_char(now() AT TIME ZONE 'UTC', 'YYMMDD') || '-' || lpad(nextval('receipt_seq')::text, 7, '0'),
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      randomCode(10),
      t.type,
      t.deviceId,
      t.orgId,
      t.shopId,
      t.userId,
      t.personId ?? null,
      t.condition,
      t.price,
      t.supplierName ?? null,
      t.notes ?? null,
      t.paymentMethod ?? null
    ]
  );
  return rows[0].id;
}

/* --------------------------------------------------------------------- */

/** Entrée en stock d'un téléphone (neuf ou fournisseur professionnel). */
export async function stockIn(req, shopId, body) {
  const identifier = body.device.imei1 || body.device.serial_number;
  const ctx = { imei: identifier, shopId, userId: req.auth.sub, details: { op: 'stock_in' } };
  const txId = await withTransaction(async (c) => {
    const device = await findDeviceByImei(c, identifier, { lock: true });
    assertNotReported(device, ctx);
    let deviceId;
    if (device) {
      const own = ownershipFor(device, req.auth);
      if (own === 'person') throw conflict('DEVICE_OWNED_BY_PERSON', 'Téléphone enregistré à un particulier : utilisez le rachat');
      if (own === 'this_shop' || own === 'my_org') throw conflict('ALREADY_IN_STOCK', 'Ce téléphone est déjà dans votre stock');
      if (own === 'other_shop') throw conflict('OWNED_BY_OTHER_SHOP', 'Ce téléphone est en stock dans une autre boutique');
      await assertImei2Free(c, body.device.imei2, device.id);
      deviceId = device.id;
      await setOwner(c, deviceId, { type: 'shop', id: shopId });
    } else {
      deviceId = await createDevice(c, body.device, { type: 'shop', id: shopId });
    }
    return insertTransaction(c, {
      type: 'stock_in',
      deviceId,
      orgId: req.auth.orgId,
      shopId,
      userId: req.auth.sub,
      condition: body.condition,
      price: body.price,
      supplierName: body.supplier_name,
      notes: body.notes
    });
  });
  await audit(req, 'transaction.stock_in', { entity: 'transaction', entityId: txId });
  return txId;
}

/** Rachat d'un téléphone à un particulier : le vendeur doit être le propriétaire enregistré. */
export async function purchase(req, shopId, body) {
  const identifier = body.device.imei1 || body.device.serial_number;
  const ctx = {
    imei: identifier,
    shopId,
    userId: req.auth.sub,
    details: {
      op: 'purchase',
      seller: { full_name: body.person.full_name, phone1: body.person.phone1, id_doc_type: body.person.id_doc_type, id_doc_number: body.person.id_doc_number }
    }
  };
  const txId = await withTransaction(async (c) => {
    const device = await findDeviceByImei(c, identifier, { lock: true });
    assertNotReported(device, ctx);
    const own = ownershipFor(device, req.auth);
    if (own === 'this_shop' || own === 'my_org') throw conflict('ALREADY_IN_STOCK', 'Ce téléphone est déjà dans votre stock');
    if (own === 'other_shop') throw conflict('OWNED_BY_OTHER_SHOP', 'Ce téléphone est enregistré dans le stock d’une autre boutique');

    const sellerId = await upsertPerson(c, body.person, { orgId: req.auth.orgId, shopId });
    if (own === 'person' && device.owner_person_id !== sellerId) {
      raiseAlert('ownership_mismatch', { device, ...ctx });
      throw conflict(
        'OWNERSHIP_MISMATCH',
        'Le vendeur n’est pas le propriétaire enregistré de ce téléphone. Rachat refusé.'
      );
    }
    let deviceId;
    if (device) {
      await assertImei2Free(c, body.device.imei2, device.id);
      deviceId = device.id;
      await setOwner(c, deviceId, { type: 'shop', id: shopId });
    } else {
      deviceId = await createDevice(c, body.device, { type: 'shop', id: shopId });
    }
    return insertTransaction(c, {
      type: 'purchase',
      deviceId,
      orgId: req.auth.orgId,
      shopId,
      userId: req.auth.sub,
      personId: sellerId,
      condition: body.condition,
      price: body.price,
      notes: body.notes
    });
  });
  await audit(req, 'transaction.purchase', { entity: 'transaction', entityId: txId });
  return txId;
}

/**
 * Option B : à la vente, crée (ou retrouve) le compte usager de l'acheteur, enregistre
 * l'appareil sous son compte et active sa 1re période gaRAN (mise en service + 1 mois).
 * Le marchand encaisse les frais (1 125 FCFA) ; l'activation est tracée dans orzayah_payments.
 */
async function activateGaranForBuyer(c, { person, deviceId, txId, orgId, shopId, pin, price }) {
  let consumer = (await c.query(`SELECT id FROM consumers WHERE phone = $1`, [person.phone1])).rows[0];
  const created = !consumer;
  if (!consumer) {
    if (!pin || !/^\d{4}$/.test(pin)) {
      throw badRequest('GARAN_PIN_REQUIRED', "Saisissez le code PIN gaRAN (4 chiffres) choisi par l'acheteur : il n'a pas encore de compte gaRAN.");
    }
    consumer = (await c.query(
      `INSERT INTO consumers (full_name, phone, email, pin_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [person.full_name, person.phone1, person.email ?? null, await hashSecret(pin)]
    )).rows[0];
  }
  const org = (await c.query(`SELECT name FROM organizations WHERE id = $1`, [orgId])).rows[0];
  const shop = (await c.query(`SELECT name, city FROM shops WHERE id = $1`, [shopId])).rows[0];
  const tx = (await c.query(`SELECT receipt_number FROM transactions WHERE id = $1`, [txId])).rows[0];
  const purchasePlace = [shop?.name, shop?.city].filter(Boolean).join(' · ') || null;

  // Un seul enregistrement actif par appareil.
  const existing = (await c.query(`SELECT id, consumer_id FROM device_registrations WHERE device_id = $1 AND status = 'active'`, [deviceId])).rows[0];
  let registrationId;
  if (existing) {
    if (existing.consumer_id !== consumer.id) {
      throw conflict('DEVICE_ALREADY_LINKED', 'Cet appareil est déjà lié au compte gaRAN d’un autre usager.');
    }
    await c.query(
      `UPDATE device_registrations
       SET subscription_expires_at = GREATEST(now(), COALESCE(subscription_expires_at, now())) + interval '1 month',
           setup_paid_at = COALESCE(setup_paid_at, now()),
           setup_paid_fcfa = GREATEST(setup_paid_fcfa, $2::int),
           setup_first_payment_at = COALESCE(setup_first_payment_at, now())
       WHERE id = $1`,
      [existing.id, SETUP_FCFA.consumer]
    );
    registrationId = existing.id;
  } else {
    const reg = (await c.query(
      `INSERT INTO device_registrations (device_id, consumer_id, purchase_place, purchase_price, merchant_name, receipt_number, account_email, setup_paid_at, setup_paid_fcfa, setup_first_payment_at, subscription_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, now(), now() + interval '1 month') RETURNING id`,
      [deviceId, consumer.id, purchasePlace, price ?? null, org?.name ?? null, tx?.receipt_number ?? null, person.email ?? null, SETUP_FCFA.consumer]
    )).rows[0];
    registrationId = reg.id;
  }

  // Trace de l'encaissement des frais gaRAN par le marchand (mise en service + 1er mois).
  await c.query(
    `INSERT INTO orzayah_payments (idempotency_key, purpose, subject_type, subject_id, device_registration_id, amount, months, operator, status, applied, transaction_id)
     VALUES ($1, 'subscription_consumer', 'consumer', $2, $3, $4, 1, 'SALE', 'SUCCESS', true, $5)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [`garan-sale-${txId}`, consumer.id, registrationId, (SETUP_FCFA.consumer + PLAN_FCFA.consumer) * 100, txId]
  );

  return { consumer_id: consumer.id, registration_id: registrationId, account_created: created, phone: person.phone1 };
}

/** Vente à un particulier : le téléphone passe au nom de l'acheteur. */
export async function sale(req, shopId, body) {
  const identifier = body.device.imei1 || body.device.serial_number;
  const ctx = { imei: identifier, shopId, userId: req.auth.sub, details: { op: 'sale' } };
  const result = await withTransaction(async (c) => {
    const device = await findDeviceByImei(c, identifier, { lock: true });
    assertNotReported(device, ctx);
    const own = ownershipFor(device, req.auth);
    if (own === 'person') {
      throw conflict('DEVICE_OWNED_BY_PERSON', 'Téléphone enregistré à un particulier : enregistrez d’abord le rachat');
    }
    if (own === 'other_shop') throw conflict('OWNED_BY_OTHER_SHOP', 'Ce téléphone appartient au stock d’une autre boutique');

    const buyerId = await upsertPerson(c, body.person, { orgId: req.auth.orgId, shopId });
    let deviceId;
    if (device) {
      await assertImei2Free(c, body.device.imei2, device.id);
      deviceId = device.id;
      await setOwner(c, deviceId, { type: 'person', id: buyerId });
    } else {
      // Vente directe d'un téléphone neuf jamais saisi en stock
      deviceId = await createDevice(c, body.device, { type: 'person', id: buyerId });
    }
    const id = await insertTransaction(c, {
      type: 'sale',
      deviceId,
      orgId: req.auth.orgId,
      shopId,
      userId: req.auth.sub,
      personId: buyerId,
      condition: body.condition,
      price: body.price,
      paymentMethod: body.payment_method,
      notes: body.notes
    });
    // Décrément du stock de l'article « Disponibilité » lié (le cas échéant).
    if (body.listing_id) {
      await c.query(
        `UPDATE listings SET quantity = GREATEST(quantity - 1, 0)
         WHERE id = $1 AND shop_id = $2 AND organization_id = $3`,
        [body.listing_id, shopId, req.auth.orgId]
      );
    }
    let garan = null;
    if (body.garan?.enabled) {
      garan = await activateGaranForBuyer(c, { person: body.person, deviceId, txId: id, orgId: req.auth.orgId, shopId, pin: body.garan.pin, price: body.price });
    }
    return { id, garan };
  });
  await audit(req, 'transaction.sale', { entity: 'transaction', entityId: result.id });
  if (result.garan) await audit(req, 'transaction.garan_activated', { entity: 'device_registration', entityId: result.garan.registration_id, meta: { account_created: result.garan.account_created } });
  return result;
}

/* --------------------------------------------------------------------- */

const TX_SELECT = `
  SELECT t.id, t.receipt_number, t.verification_code, t.type, t.condition, t.price, t.currency,
         t.supplier_name, t.notes, t.occurred_at, t.shop_id, t.organization_id, t.payment_method,
         json_build_object('id', d.id, 'imei1', d.imei1, 'imei2', d.imei2, 'device_type', d.device_type,
                           'serial_number', d.serial_number, 'brand', b.name,
                           'model', COALESCE(m.name, d.model_label), 'color', d.color,
                           'storage_gb', d.storage_gb, 'status', d.status) AS device,
         json_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'city', s.city,
                           'district', s.district, 'rccm', s.rccm) AS shop,
         json_build_object('name', o.name, 'rccm', o.rccm, 'phone', o.phone) AS organization,
         CASE WHEN p.id IS NULL THEN NULL ELSE
           json_build_object('id', p.id, 'full_name', p.full_name, 'phone1', p.phone1, 'phone2', p.phone2,
                             'email', p.email, 'id_doc_type', p.id_doc_type, 'id_doc_number', p.id_doc_number)
         END AS person,
         u.full_name AS recorded_by
  FROM transactions t
  JOIN devices d ON d.id = t.device_id
  LEFT JOIN brands b ON b.id = d.brand_id
  LEFT JOIN models m ON m.id = d.model_id
  JOIN shops s ON s.id = t.shop_id
  JOIN organizations o ON o.id = t.organization_id
  LEFT JOIN persons p ON p.id = t.person_id
  JOIN users u ON u.id = t.user_id`;

const withCertificate = (t) => ({
  ...t,
  certificate_url: `${config.PUBLIC_WEB_URL.replace(/\/$/, '')}/v/${t.verification_code}`
});

export async function getTransaction(id, scope) {
  const params = [id, scope.orgId];
  let where = 't.id = $1 AND t.organization_id = $2';
  if (scope.shopId) {
    params.push(scope.shopId);
    where += ' AND t.shop_id = $3';
  }
  const { rows } = await query(`${TX_SELECT} WHERE ${where}`, params);
  if (!rows[0]) throw notFound('Opération introuvable');
  const tx = withCertificate(rows[0]);
  return { ...tx, payment: await salePaymentView(tx) };
}

export async function listTransactions(scope, f) {
  const params = [scope.orgId];
  const cond = ['t.organization_id = $1'];
  const add = (sql, v) => {
    params.push(v);
    cond.push(sql.replace('?', `$${params.length}`));
  };
  if (scope.shopId) add('t.shop_id = ?', scope.shopId);
  if (f.type) add('t.type = ?', f.type);
  if (f.from) add('t.occurred_at >= ?', f.from);
  if (f.to) add('t.occurred_at < ?', f.to);
  if (f.q) {
    const q = f.q.trim().replace(/[%_\\]/g, '\\$&');
    params.push(q);
    const i = params.length;
    cond.push(
      /^\d{4,15}$/.test(q)
        ? `(d.imei1 LIKE $${i} || '%' OR d.imei2 LIKE $${i} || '%')`
        : `(t.receipt_number ILIKE $${i} OR p.full_name ILIKE '%' || $${i} || '%')`
    );
  }
  const where = cond.join(' AND ');
  const offset = (f.page - 1) * f.limit;
  const [items, total] = await Promise.all([
    query(`${TX_SELECT} WHERE ${where} ORDER BY t.occurred_at DESC LIMIT ${f.limit} OFFSET ${offset}`, params),
    query(
      `SELECT count(*)::int AS n FROM transactions t
       JOIN devices d ON d.id = t.device_id LEFT JOIN persons p ON p.id = t.person_id
       WHERE ${where}`,
      params
    )
  ]);
  return { items: items.rows.map(withCertificate), total: total.rows[0].n, page: f.page, limit: f.limit };
}

/** États par période : totaux, puis détail par marque et par modèle. */
export async function salesSummary(scope, { from, to, type }) {
  const params = [scope.orgId, type];
  const cond = ['t.organization_id = $1', 't.type = $2'];
  if (scope.shopId) {
    params.push(scope.shopId);
    cond.push(`t.shop_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    cond.push(`t.occurred_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    cond.push(`t.occurred_at < $${params.length}`);
  }
  const base = `FROM transactions t JOIN devices d ON d.id = t.device_id
                LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
                WHERE ${cond.join(' AND ')}`;
  const [totals, byBrand, byModel, byShop] = await Promise.all([
    query(`SELECT count(*)::int AS count, COALESCE(sum(t.price), 0) AS amount ${base}`, params),
    query(
      `SELECT COALESCE(b.name, d.brand_label, 'Autre') AS brand, count(*)::int AS count, COALESCE(sum(t.price), 0) AS amount
       ${base} GROUP BY 1 ORDER BY amount DESC, count DESC`,
      params
    ),
    query(
      `SELECT COALESCE(b.name, d.brand_label, 'Autre') AS brand, COALESCE(m.name, d.model_label, 'Autre') AS model,
              count(*)::int AS count, COALESCE(sum(t.price), 0) AS amount
       ${base} GROUP BY 1, 2 ORDER BY amount DESC, count DESC`,
      params
    ),
    query(
      `SELECT s.id AS shop_id, s.name AS shop, count(*)::int AS count, COALESCE(sum(t.price), 0) AS amount
       ${base.replace('WHERE', 'JOIN shops s ON s.id = t.shop_id WHERE')}
       GROUP BY 1, 2 ORDER BY amount DESC`,
      params
    )
  ]);
  return {
    type,
    from: from ?? null,
    to: to ?? null,
    total_count: totals.rows[0].count,
    total_amount: totals.rows[0].amount,
    by_brand: byBrand.rows,
    by_model: byModel.rows,
    by_shop: byShop.rows
  };
}

/** Soldes et ventes par état sur une période : digital (ORZAYAH), espèces, total. */
export async function balanceSummary(scope, { from, to }) {
  const params = [scope.orgId];
  const cond = ['t.organization_id = $1', "t.type IN ('sale', 'purchase')"];
  if (scope.shopId) {
    params.push(scope.shopId);
    cond.push(`t.shop_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    cond.push(`t.occurred_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    cond.push(`t.occurred_at < $${params.length}`);
  }
  const { rows } = await query(
    `SELECT t.type, t.condition, COALESCE(t.payment_method, 'cash') AS payment_method,
            (t.payment_method IS DISTINCT FROM 'orzayah' OR EXISTS (
               SELECT 1 FROM orzayah_payments p
               WHERE p.transaction_id = t.id AND p.purpose = 'sale' AND p.applied)) AS paid,
            count(*)::int AS count, COALESCE(sum(t.price), 0) AS amount
     FROM transactions t WHERE ${cond.join(' AND ')} GROUP BY 1, 2, 3, 4`,
    params
  );
  const byCondition = { new: { count: 0, amount: 0 }, like_new: { count: 0, amount: 0 }, used: { count: 0, amount: 0 } };
  const sales = { count: 0, amount: 0 };
  const purchases = { count: 0, amount: 0 };
  const pending = { count: 0, amount: 0 };
  let digital = 0;
  let cash = 0;
  for (const r of rows) {
    const amount = Number(r.amount);
    const sign = r.type === 'sale' ? 1 : -1;
    if (!r.paid) {
      // Vente ORZAYAH pas encore encaissée : comptée à part, hors des soldes.
      pending.count += r.count;
      pending.amount += amount;
    } else if (r.payment_method === 'orzayah') digital += sign * amount;
    else cash += sign * amount;
    if (r.type === 'sale') {
      sales.count += r.count;
      sales.amount += amount;
      const c = (byCondition[r.condition] ??= { count: 0, amount: 0 });
      c.count += r.count;
      c.amount += amount;
    } else {
      purchases.count += r.count;
      purchases.amount += amount;
    }
  }
  return {
    from: from ?? null,
    to: to ?? null,
    sales: { ...sales, by_condition: byCondition },
    purchases,
    pending,
    balances: { digital, cash, total: digital + cash }
  };
}
