/**
 * Documents certifiés gaRAN générés par le titulaire depuis son app :
 *  - Certificat de sécurité : IMEI en QR code, nom, téléphone, e-mail du compte de l'appareil.
 *  - Reçu d'achat certifié : récapitulatif complet du linkage + QR code.
 * Les deux portent le grand badge de sécurité gaRAN et la mention « Certifié gaRAN ».
 * Rendu HTML -> PDF (expo-print).
 */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Grand badge de sécurité gaRAN (bouclier + coche, SVG inline — aucune image externe requise). */
export const BADGE = `<svg viewBox="0 0 150 172" width="150" height="172" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Badge de sécurité gaRAN">
  <defs>
    <linearGradient id="gshield" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#17E08A"/><stop offset="1" stop-color="#00B368"/>
    </linearGradient>
  </defs>
  <path d="M75 5 L137 28 V84 C137 128 110 157 75 168 C40 157 13 128 13 84 V28 Z" fill="#E7FBF1" stroke="url(#gshield)" stroke-width="6"/>
  <circle cx="75" cy="74" r="46" fill="url(#gshield)"/>
  <path d="M50 76 L68 95 L103 54" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="75" y="135" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" fill="#0A1F44">gaRAN</text>
  <text x="75" y="152" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8.5" font-weight="700" letter-spacing="1.6" fill="#00B368">SÉCURITÉ CERTIFIÉE</text>
</svg>`;

/** Mention de certification adaptée au type d'appareil vendu (accords corrects). */
const CERTIFIED_MENTION = {
  phone: 'Ce téléphone est certifié sécurisé gaRAN',
  tablet: 'Cette tablette est certifiée sécurisée gaRAN',
  computer: 'Cet ordinateur est certifié sécurisé gaRAN',
  other: 'Cet appareil est certifié sécurisé gaRAN'
};
export const certifiedMention = (deviceType) => CERTIFIED_MENTION[deviceType] ?? CERTIFIED_MENTION.other;

function shell(title, bodyRows, qrSvg, intro, qrCaption) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0A1F44;padding:28px;font-size:13px}
    .hero{text-align:center;margin-bottom:8px}
    .brand{font-size:30px;letter-spacing:-1px}.ga{font-weight:500}.ran{font-weight:800;color:#00D27A}
    .badge{margin-top:10px}
    h1{font-size:20px;margin:16px 0 2px;text-align:center}
    .muted{color:#4A5878}.intro{text-align:center;margin-bottom:6px}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    td{padding:8px 0;border-bottom:1px solid #E1E7F2}
    td:first-child{color:#4A5878;width:44%}td:last-child{font-weight:600;text-align:right}
    .qr{display:flex;gap:16px;align-items:center;margin-top:18px;border:1px solid #E1E7F2;border-radius:12px;padding:14px}
    .qr svg{width:130px;height:130px}
    .foot{margin-top:20px;color:#8A97AD;font-size:11px;border-top:1px solid #E1E7F2;padding-top:10px;text-align:center}
  </style></head><body>
    <div class="hero">
      <div class="brand"><span class="ga">ga</span><span class="ran">RAN</span></div>
      <div class="muted">Registre digital des téléphones · IMEI</div>
      <div class="badge">${BADGE}</div>
    </div>
    <h1>${esc(title)}</h1>
    <div class="muted intro">${esc(intro)}</div>
    <table>${bodyRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <div class="qr">${qrSvg}<div><strong>${esc(qrCaption[0])}</strong><br><span class="muted">${esc(qrCaption[1])}</span></div></div>
    <div class="foot">Document généré par le titulaire via l'application gaRAN · une solution ORZAYAH SERVICES.</div>
  </body></html>`;
}

/** Certificat de sécurité : identité du titulaire + appareil + QR de vérification. */
export function certificateHtml({ owner, device, qrSvg }) {
  const rows = [
    ['Titulaire', owner.full_name],
    ['Téléphone', owner.phone],
    ['E-mail du compte sur l\u2019appareil', device.account_email || '\u2014'],
    ['Marque / Modèle', `${device.brand ?? ''} ${device.model ?? ''}`.trim() || '\u2014'],
    ...((device.device_type ?? 'phone') === 'phone'
      ? [['IMEI 1', device.imei1 || '—'], ...(device.imei2 ? [['IMEI 2', device.imei2]] : [])]
      : [['N° de série', device.serial_number || '—']])
  ];
  return shell(
    'Certificat de sécurité gaRAN',
    rows,
    qrSvg,
    'Ce certificat atteste que l\u2019appareil ci-dessous est enregistré et protégé sur le réseau gaRAN.',
    ['Vérification', 'Scannez ce QR code pour vérifier le statut de l\u2019appareil sur gaRAN.']
  );
}

/** Reçu d'achat certifié : toutes les informations fournies au linkage. */
export function certifiedReceiptHtml({ owner, device, qrSvg }) {
  const rows = [
    ['Acquéreur', owner.full_name],
    ['Téléphone', owner.phone],
    ...(owner.email ? [['E-mail du compte gaRAN', owner.email]] : []),
    ['E-mail du compte sur l\u2019appareil', device.account_email || '\u2014'],
    ['Marque / Modèle', `${device.brand ?? ''} ${device.model ?? ''}`.trim() || '\u2014'],
    ...((device.device_type ?? 'phone') === 'phone'
      ? [['IMEI 1', device.imei1 || '—'], ...(device.imei2 ? [['IMEI 2', device.imei2]] : [])]
      : [['N° de série', device.serial_number || '—']]),
    ...(device.purchase_place ? [['Lieu d\u2019achat', device.purchase_place]] : []),
    ...(device.merchant_name ? [['Marchand', device.merchant_name]] : []),
    ...(device.receipt_number ? [['N\u00b0 de reçu d\u2019achat', device.receipt_number]] : []),
    ...(device.purchase_price != null && device.purchase_price !== '' ? [['Prix d’achat', `${new Intl.NumberFormat('fr-FR').format(device.purchase_price)} FCFA`]] : []),
    ['Date et heure d’achat', device.acquired_at_dt || device.acquired_at_fmt || '—']
  ];
  return shell(
    'Reçu d\u2019achat — certifié gaRAN',
    rows,
    qrSvg,
    'Récapitulatif complet des informations fournies lors de l\u2019enregistrement de l\u2019appareil.',
    ['Preuve de propriété', 'Scannez ce QR code pour vérifier l\u2019appareil sur gaRAN.']
  );
}
