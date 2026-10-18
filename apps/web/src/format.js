const nf = new Intl.NumberFormat('fr-FR');
const df = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const dtf = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export const fcfa = (n) => `${nf.format(Number(n ?? 0))} FCFA`;
export const num = (n) => nf.format(Number(n ?? 0));
export const date = (d) => (d ? df.format(new Date(d)) : '—');
export const dateTime = (d) => (d ? dtf.format(new Date(d)) : '—');

export const LABELS = {
  orgStatus: { trial: 'Essai', active: 'Actif', suspended: 'Suspendu', expired: 'Expiré' },
  txType: { stock_in: 'Entrée en stock', purchase: 'Rachat', sale: 'Vente' },
  condition: { new: 'Neuf', like_new: 'Quasi neuf', used: 'Seconde main' },
  deviceStatus: { active: 'Normal', stolen: 'Volé', lost: 'Perdu', blocked: 'Bloqué' },
  reportStatus: { pending: 'À vérifier', confirmed: 'Confirmée', rejected: 'Rejetée', resolved: 'Résolue' },
  alertType: { reported_device_attempt: 'Téléphone signalé présenté', ownership_mismatch: 'Vendeur ≠ propriétaire' },
  role: { superadmin: 'Super-admin', admin: 'Administrateur', support: 'Support', police: 'Forces de l’ordre' },
  method: { cash: 'Espèces', mobile_money: 'Mobile Money', bank: 'Virement', other: 'Autre' },
  docType: { CNI: 'CNI', PASSPORT: 'Passeport', PERMIS: 'Permis', ATTESTATION: 'Attestation', CARTE_CONSULAIRE: 'Carte consulaire', CARTE_SEJOUR: 'Carte de séjour' }
};

export const tone = {
  orgStatus: { trial: 'info', active: 'ok', suspended: 'danger', expired: 'warn' },
  deviceStatus: { active: 'ok', stolen: 'danger', lost: 'warn', blocked: 'danger' },
  reportStatus: { pending: 'warn', confirmed: 'danger', rejected: 'muted', resolved: 'ok' }
};
