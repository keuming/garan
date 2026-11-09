import { query } from '../db.js';
import { config } from '../config.js';

/**
 * Demandes de blocage opérateur (IMEI). gaRAN prépare et suit la demande ;
 * le blocage réseau effectif reste réalisé par les opérateurs / l'ARTCI.
 */

const OPEN = "('requested', 'transmitted')";

/* -------------------------- Routage opérateur (CI) -------------------------- */

// Préfixes mobiles de Côte d'Ivoire (numérotation à 10 chiffres).
export const CI_OPERATORS = {
  orange: { key: 'orange', label: 'Orange CI', prefixes: ['07', '08', '09'] },
  mtn: { key: 'mtn', label: 'MTN CI', prefixes: ['04', '05', '06'] },
  moov: { key: 'moov', label: 'Moov Africa CI', prefixes: ['01', '02', '03'] }
};

/** Normalise un numéro ivoirien en 10 chiffres locaux (ex. 0712345678). */
function ciLocal(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('225')) d = d.slice(3);
  if (d.length === 10 && d.startsWith('0')) return d;
  if (d.length === 8) return `0${d}`; // ancien format à 8 chiffres
  return d;
}

/** Déduit l'opérateur d'un numéro ivoirien d'après son préfixe, ou null. */
export function operatorFromPhone(phone) {
  const d = ciLocal(phone);
  if (d.length < 2) return null;
  const p2 = d.slice(0, 2);
  return Object.values(CI_OPERATORS).find((op) => op.prefixes.includes(p2)) ?? null;
}

/** Reconnaît un opérateur à partir d'un libellé libre (« orange », « MTN CI »…). */
export function operatorFromLabel(label) {
  const t = String(label ?? '').toLowerCase();
  if (t.includes('orange')) return CI_OPERATORS.orange;
  if (t.includes('mtn')) return CI_OPERATORS.mtn;
  if (t.includes('moov')) return CI_OPERATORS.moov;
  return null;
}

/**
 * Suggère l'opérateur à cibler pour un blocage : en priorité la SIM insérée APRÈS
 * le vol (sim_events), sinon le préfixe du numéro du propriétaire déclarant.
 * Renvoie { key, label, source } ou null.
 */
export async function suggestOperator(client, { deviceId = null, ownerPhone = null }) {
  const c = client ?? { query };
  if (deviceId) {
    const se = (
      await c.query(
        `SELECT operator, phone_number FROM sim_events
         WHERE device_id = $1 AND after_theft = true ORDER BY created_at DESC LIMIT 1`,
        [deviceId]
      )
    ).rows[0];
    if (se) {
      const byName = operatorFromLabel(se.operator);
      if (byName) return { ...byName, source: 'sim_after_theft' };
      const byPhone = operatorFromPhone(se.phone_number);
      if (byPhone) return { ...byPhone, source: 'sim_after_theft' };
    }
  }
  const byOwner = operatorFromPhone(ownerPhone);
  if (byOwner) return { ...byOwner, source: 'owner_phone' };
  return null;
}

/** E-mail de destination configuré pour un opérateur (clé), ou null. */
export function operatorEmail(key) {
  const map = { orange: config.OPERATOR_ORANGE_EMAIL, mtn: config.OPERATOR_MTN_EMAIL, moov: config.OPERATOR_MOOV_EMAIL };
  return (map[key] || '').trim() || null;
}

/**
 * Destinataires e-mail d'une transmission : l'opérateur ciblé (si configuré),
 * l'ARTCI, et l'adresse ops. Déduplique et ignore les vides.
 */
export function transmissionRecipients(operatorKey) {
  const list = [operatorEmail(operatorKey), (config.ARTCI_EMAIL || '').trim(), (config.OPS_EMAIL || '').trim()];
  return [...new Set(list.filter(Boolean))];
}

/**
 * Crée une demande de blocage pour un appareil volé, SAUF s'il en existe déjà une ouverte.
 * Idempotent par appareil (ou par IMEI quand l'appareil n'est pas encore enregistré).
 * Renvoie la demande créée, ou null si une demande ouverte existait déjà.
 */
export async function ensureBlockRequest(
  client,
  { deviceId = null, theftReportId = null, imei, imei2 = null, ownerName = null, ownerPhone = null, policeReportNumber = null, createdBy = null }
) {
  const c = client ?? { query };
  const existing = deviceId
    ? await c.query(`SELECT 1 FROM block_requests WHERE device_id = $1 AND status IN ${OPEN}`, [deviceId])
    : await c.query(`SELECT 1 FROM block_requests WHERE imei = $1 AND status IN ${OPEN}`, [imei]);
  if (existing.rowCount) return null;

  let brand = null;
  let model = null;
  let secondImei = imei2;
  if (deviceId) {
    const d = (
      await c.query(
        `SELECT COALESCE(b.name, d.brand_label) AS brand, COALESCE(m.name, d.model_label) AS model, d.imei2
         FROM devices d LEFT JOIN brands b ON b.id = d.brand_id LEFT JOIN models m ON m.id = d.model_id
         WHERE d.id = $1`,
        [deviceId]
      )
    ).rows[0];
    if (d) {
      brand = d.brand;
      model = d.model;
      secondImei = secondImei ?? d.imei2;
    }
  }

  const { rows } = await c.query(
    `INSERT INTO block_requests (device_id, theft_report_id, imei, imei2, brand_label, model_label,
                                 owner_name, owner_phone, police_report_number, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [deviceId, theftReportId, imei, secondImei, brand, model, ownerName, ownerPhone, policeReportNumber, createdBy]
  );
  return rows[0];
}

/** Texte de la demande, prêt à copier/imprimer/envoyer aux opérateurs et à l'ARTCI. */
export function blockRequestText(r) {
  const today = new Date().toISOString().slice(0, 10);
  const marqueModele = [r.brand_label, r.model_label].filter(Boolean).join(' ') || 'non précisé';
  return [
    "DEMANDE DE BLOCAGE D'UN TÉLÉPHONE VOLÉ (PAR IMEI)",
    '',
    'À : Opérateurs mobiles (Orange CI, MTN CI, Moov Africa) et ARTCI',
    'De : gaRAN — registre IMEI (ORZAYAH SERVICES)',
    `Date : ${today}`,
    `Référence gaRAN : ${r.id}`,
    '',
    'Appareil concerné :',
    `  - IMEI 1 : ${r.imei}`,
    `  - IMEI 2 : ${r.imei2 || '—'}`,
    `  - Marque / Modèle : ${marqueModele}`,
    '',
    'Propriétaire déclarant :',
    `  - Nom : ${r.owner_name || 'non précisé'}`,
    `  - Téléphone : ${r.owner_phone || 'non précisé'}`,
    `  - N° de plainte police : ${r.police_report_number || 'non fourni'}`,
    '',
    "Objet : l'appareil ci-dessus est déclaré volé/perdu et enregistré comme tel dans le registre gaRAN.",
    "Nous sollicitons son blocage réseau par IMEI (EIR) afin d'empêcher toute réutilisation sur les réseaux mobiles.",
    '',
    'gaRAN — ORZAYAH SERVICES'
  ].join('\n');
}
