/** Retire espaces, tirets et barres obliques d'une saisie ou d'un scan d'IMEI. */
export function normalizeImei(raw) {
  return String(raw ?? '').replace(/[\s\-/.]/g, '');
}

/** Vérifie un IMEI : 15 chiffres + clé de Luhn valide. */
export function isValidImei(imei) {
  if (!/^\d{15}$/.test(imei)) return false;
  if (/^0{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    let d = Number(imei[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Masque un IMEI pour l'affichage public : 3567 •••••••• 123 */
export function maskImei(imei) {
  if (!imei) return null;
  return `${imei.slice(0, 4)}••••••••${imei.slice(-3)}`;
}
