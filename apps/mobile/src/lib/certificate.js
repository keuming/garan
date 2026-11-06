/**
 * Documents certifiés gaRAN générés par le titulaire depuis son app :
 *  - Certificat de sécurité : IMEI en QR code, nom, téléphone, e-mail du compte de l'appareil.
 *  - Reçu d'achat certifié : récapitulatif complet du linkage + QR code.
 * Les deux portent la mention « Certifié gaRAN » et le sceau. Rendu HTML -> PDF (expo-print).
 */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Sceau « Certifié gaRAN » (SVG inline, aucune image externe requise). */
const SEAL = `<svg viewBox="0 0 120 128" width="92" height="98" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Certifié gaRAN">
  <circle cx="60" cy="56" r="50" fill="#E7FBF1" stroke="#00D27A" stroke-width="4"/>
  <path d="M60 18l9 6 11-2 4 11 9 6-4 11 4 11-9 6-4 11-11-2-9 6-9-6-11 2-4-11-9-6 4-11-4-11 9-6 4-11 11 2z" fill="#00D27A" opacity="0.12"/>
  <path d="M40 57l13 13 26-28" fill="none" stroke="#00B368" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="60" y="122" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="800" fill="#0A1F44">Certifié gaRAN</text>
</svg>`;

function shell(title, bodyRows, qrSvg, intro, qrCaption) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0A1F44;padding:28px;font-size:13px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .brand{font-size:30px;letter-spacing:-1px}.ga{font-weight:500}.ran{font-weight:800;color:#00D27A}
    h1{font-size:19px;margin:14px 0 2px}.muted{color:#4A5878}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    td{padding:8px 0;border-bottom:1px solid #E1E7F2}
    td:first-child{color:#4A5878;width:44%}td:last-child{font-weight:600;text-align:right}
    .qr{display:flex;gap:16px;align-items:center;margin-top:18px;border:1px solid #E1E7F2;border-radius:12px;padding:14px}
    .qr svg{width:130px;height:130px}
    .foot{margin-top:20px;color:#8A97AD;font-size:11px;border-top:1px solid #E1E7F2;padding-top:10px}
  </style></head><body>
    <div class="top">
      <div>
        <div class="brand"><span class="ga">ga</span><span class="ran">RAN</span></div>
        <div class="muted">Registre digital des téléphones · IMEI</div>
      </div>
      ${SEAL}
    </div>
    <h1>${esc(title)}</h1>
    <div class="muted">${esc(intro)}</div>
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
    ['IMEI 1', device.imei1],
    ...(device.imei2 ? [['IMEI 2', device.imei2]] : [])
  ];
  return shell(
    'Certificat de sécurité gaRAN',
    rows,
    qrSvg,
    'Ce certificat atteste que l\u2019appareil ci-dessous est enregistré et protégé sur le réseau gaRAN.',
    ['Vérification', 'Scannez ce QR code pour vérifier l\u2019IMEI et le statut de l\u2019appareil sur gaRAN.']
  );
}

/** Reçu d'achat certifié : toutes les informations fournies au linkage. */
export function certifiedReceiptHtml({ owner, device, qrSvg }) {
  const rows = [
    ['Titulaire', owner.full_name],
    ['Téléphone', owner.phone],
    ...(owner.email ? [['E-mail du compte gaRAN', owner.email]] : []),
    ['E-mail du compte sur l\u2019appareil', device.account_email || '\u2014'],
    ['Marque / Modèle', `${device.brand ?? ''} ${device.model ?? ''}`.trim() || '\u2014'],
    ['IMEI 1', device.imei1],
    ...(device.imei2 ? [['IMEI 2', device.imei2]] : []),
    ...(device.purchase_place ? [['Lieu d\u2019achat', device.purchase_place]] : []),
    ...(device.merchant_name ? [['Marchand', device.merchant_name]] : []),
    ...(device.receipt_number ? [['N\u00b0 de reçu d\u2019achat', device.receipt_number]] : []),
    ['Enregistré le', device.acquired_at_fmt || '\u2014']
  ];
  return shell(
    'Reçu d\u2019achat — certifié gaRAN',
    rows,
    qrSvg,
    'Récapitulatif complet des informations fournies lors de l\u2019enregistrement de l\u2019appareil.',
    ['Preuve de propriété', 'Scannez ce QR code pour vérifier l\u2019appareil sur gaRAN.']
  );
}
