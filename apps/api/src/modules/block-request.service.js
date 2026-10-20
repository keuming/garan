import { query } from '../db.js';

/**
 * Demandes de blocage opérateur (IMEI). gaRAN prépare et suit la demande ;
 * le blocage réseau effectif reste réalisé par les opérateurs / l'ARTCI.
 */

const OPEN = "('requested', 'transmitted')";

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
