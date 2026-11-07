import { query } from '../db.js';

/**
 * Recherche gaRAN par IMEI (réservée aux comptes connectés) : renvoie l'acquéreur
 * complet si l'appareil est enregistré/certifié, ou indique clairement qu'il ne l'est pas.
 * But : vérifier qu'un téléphone appartient à quelqu'un et qui le détient réellement.
 */
export async function imeiGaranLookup(imei) {
  const reg = (await query(
    `SELECT r.acquired_at, r.purchase_place, r.purchase_price, r.merchant_name, r.receipt_number,
            r.account_email, r.subscription_expires_at, r.setup_paid_at,
            c.full_name, c.phone, c.email,
            d.imei1, d.imei2, d.status AS device_status,
            COALESCE(b.name, d.brand_label) AS brand, COALESCE(m.name, d.model_label) AS model
     FROM device_registrations r
     JOIN consumers c ON c.id = r.consumer_id
     JOIN devices d ON d.id = r.device_id
     LEFT JOIN brands b ON b.id = d.brand_id
     LEFT JOIN models m ON m.id = d.model_id
     WHERE (d.imei1 = $1 OR d.imei2 = $1) AND r.status = 'active'
     ORDER BY r.acquired_at DESC
     LIMIT 1`,
    [imei]
  )).rows[0];

  if (reg) {
    const certified = Boolean(reg.subscription_expires_at && new Date(reg.subscription_expires_at) > new Date());
    const reported = ['stolen', 'lost', 'blocked'].includes(reg.device_status);
    return {
      status: reported ? 'reported' : 'registered',
      registered: true,
      certified,
      reported,
      device_status: reg.device_status,
      device: { brand: reg.brand, model: reg.model, imei1: reg.imei1, imei2: reg.imei2 },
      acquirer: {
        full_name: reg.full_name,
        phone: reg.phone,
        email: reg.email,
        account_email: reg.account_email,
        acquired_at: reg.acquired_at,
        purchase_place: reg.purchase_place,
        purchase_price: reg.purchase_price,
        merchant_name: reg.merchant_name,
        receipt_number: reg.receipt_number,
        subscription_expires_at: reg.subscription_expires_at
      },
      message: reported
        ? 'Ce téléphone est signalé (vol, perte ou blocage). Ne l’achetez pas.'
        : certified
          ? 'Téléphone enregistré et certifié gaRAN. Vérifiez que le vendeur correspond bien à l’acquéreur ci-dessous.'
          : 'Téléphone enregistré sur gaRAN (abonnement expiré). Vérifiez l’acquéreur ci-dessous.'
    };
  }

  // Aucun acquéreur certifié : l'appareil existe-t-il tout de même dans gaRAN ?
  const dev = (await query(
    `SELECT d.status AS device_status, COALESCE(b.name, d.brand_label) AS brand, COALESCE(m.name, d.model_label) AS model
     FROM devices d
     LEFT JOIN brands b ON b.id = d.brand_id
     LEFT JOIN models m ON m.id = d.model_id
     WHERE d.imei1 = $1 OR d.imei2 = $1
     LIMIT 1`,
    [imei]
  )).rows[0];

  if (dev) {
    const reported = ['stolen', 'lost', 'blocked'].includes(dev.device_status);
    return {
      status: reported ? 'reported' : 'known',
      registered: false,
      certified: false,
      reported,
      device_status: dev.device_status,
      device: { brand: dev.brand, model: dev.model },
      acquirer: null,
      message: reported
        ? 'Ce téléphone est signalé (vol, perte ou blocage). Ne l’achetez pas.'
        : 'Téléphone connu de gaRAN mais sans acquéreur certifié (non rattaché à un compte usager).'
    };
  }

  return {
    status: 'unknown',
    registered: false,
    certified: false,
    reported: false,
    device: null,
    acquirer: null,
    message: 'Ce téléphone n’a jamais été enregistré ni certifié gaRAN.'
  };
}
