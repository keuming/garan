const nf = new Intl.NumberFormat('fr-FR');

export const fcfa = (n) => `${nf.format(Number(n ?? 0)).replace(/ | /g, ' ')} FCFA`;
export const num = (n) => nf.format(Number(n ?? 0)).replace(/ | /g, ' ');

const pad = (n) => String(n).padStart(2, '0');
export const date = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
};
export const dateTime = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return `${date(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

export const LABELS = {
  txType: { stock_in: 'Entrée en stock', purchase: 'Rachat', sale: 'Vente' },
  condition: { new: 'Neuf', like_new: 'Quasi neuf', used: 'Seconde main' },
  docType: {
    CNI: 'CNI',
    PASSPORT: 'Passeport',
    PERMIS: 'Permis de conduire',
    ATTESTATION: 'Attestation d’identité',
    CARTE_CONSULAIRE: 'Carte consulaire',
    CARTE_SEJOUR: 'Carte de séjour'
  },
  orgStatus: { trial: 'Période d’essai', active: 'Actif', suspended: 'Suspendu', expired: 'Expiré' }
};

export const toOptions = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

/** Bornes de période pour les états. */
export function periodRange(key) {
  const now = new Date();
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (key) {
    case 'today':
      return { from: start(now), to: null };
    case '7d':
      return { from: new Date(start(now).getTime() - 6 * 86_400_000), to: null };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
    case 'last_month':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: null };
    default:
      return { from: null, to: null };
  }
}
export const PERIODS = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: '7d', label: '7 jours' },
  { value: 'month', label: 'Ce mois' },
  { value: 'last_month', label: 'Mois dernier' },
  { value: 'year', label: 'Cette année' }
];
