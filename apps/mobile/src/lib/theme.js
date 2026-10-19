/**
 * Palette gaRAN — harmonie « émeraude » : un vert de marque riche (pas criard),
 * une encre vert-forêt chaude (au lieu d'un bleu-marine froid) et un fond blanc-menthe.
 * L'émeraude est la seule couleur vive ; tout le reste reste calme. Le rouge sang
 * est réservé aux alertes VOL.
 */
export const colors = {
  // Famille émeraude (marque + actions)
  green: '#00C271',   // émeraude de marque (logo « RAN », points forts, surfaces « protégé »)
  emerald: '#00C271',
  emeraldDeep: '#009E5C',
  emeraldSoft: '#E3F7EC',
  blue: '#009E5C',    // action principale (boutons/tuiles, texte blanc lisible)
  blueDark: '#06824D',
  blueSoft: '#E3F7EC',
  cyan: '#0E9C8C',    // teal secondaire (entrée en stock)
  forest: '#0C2F23',  // vert-forêt profond (en-têtes, tuiles sombres)
  navy: '#0C2F23',    // alias conservé (harmonisé en vert-forêt)

  // Encre & surfaces
  ink: '#0C2A20',
  ink2: '#51665C',
  ink3: '#8AA096',
  line: '#E2EDE7',
  bg: '#F3F8F5',      // blanc-menthe chaud
  card: '#FFFFFF',

  // États
  ok: '#0F8A5F',
  okBg: '#E3F6EE',
  warn: '#A35C00',
  warnBg: '#FFF4E2',
  danger: '#C4282D',
  dangerBg: '#FDE8E8',
  blood: '#8B0000',   // rouge sang — alertes VOL
  bloodBg: '#FBE2E2'
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 };
export const space = (n) => n * 4;

/** Ombres translucides émeraude — signature visuelle (profondeur douce, pas de gris plat). */
export const shadow = {
  card: { shadowColor: '#0B7a52', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  tile: { shadowColor: '#059c66', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  hero: { shadowColor: '#00C271', shadowOpacity: 0.32, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 9 }
};
