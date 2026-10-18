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

/** Extrait un IMEI valide d'un code-barres scanné (boîte, étiquette, *#06#). */
export function extractImei(data) {
  const runs = String(data ?? '').match(/\d{15,17}/g) ?? [];
  for (const r of runs) {
    const candidate = r.slice(0, 15);
    if (isValidImei(candidate)) return candidate;
  }
  return null;
}
