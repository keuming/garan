export const normalizeImei = (raw) => String(raw ?? '').replace(/\D/g, '').slice(0, 15);

/** 15 chiffres + clé de Luhn : même règle que l'API, pour un retour immédiat au vendeur. */
export function isValidImei(imei) {
  if (!/^\d{15}$/.test(imei) || /^0{15}$/.test(imei)) return false;
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

/**
 * Extrait un IMEI valide d'un code-barres scanné (boîte, étiquette, *#06#).
 * Tolérant : balaie chaque suite de chiffres par fenêtre de 15, puis l'ensemble
 * des chiffres concaténés, car les étiquettes mêlent souvent IMEI, n° de série et texte.
 */
export function extractImei(data) {
  const s = String(data ?? '');
  const groups = s.match(/\d{14,}/g) ?? [];
  for (const g of groups) {
    for (let i = 0; i + 15 <= g.length; i += 1) {
      const cand = g.slice(i, i + 15);
      if (isValidImei(cand)) return cand;
    }
  }
  const all = s.replace(/\D/g, '');
  for (let i = 0; i + 15 <= all.length; i += 1) {
    const cand = all.slice(i, i + 15);
    if (isValidImei(cand)) return cand;
  }
  return null;
}
