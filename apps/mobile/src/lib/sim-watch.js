import { Platform } from 'react-native';
import * as Cellular from 'expo-cellular';
import { api } from './api';

/**
 * Surveillance « best-effort » de la carte SIM côté usager.
 *
 * Android (10+) réserve l'accès à l'ICCID / numéro de série réel de la SIM aux
 * applications opérateur : une app tierce ne peut donc PAS obtenir un identifiant
 * de SIM unique. On se rabat sur l'identité de l'OPÉRATEUR (MCC + MNC), qui ne
 * requiert aucune permission sensible. Cela détecte un CHANGEMENT D'OPÉRATEUR
 * (cas de vol le plus fréquent : le voleur remet sa propre SIM), mais pas un
 * changement de SIM du même opérateur. Sur le web (PWA), aucun accès : no-op.
 *
 * Le serveur (POST /consumer/security/sim-change) mémorise l'empreinte au premier
 * envoi et ne déclenche l'alerte (e-mail propriétaire + SMS contact de secours)
 * que si elle change ensuite.
 */

let lastSent = null;

async function readSimFingerprint() {
  if (Platform.OS === 'web') return null;
  try {
    const mcc = (await Cellular.getMobileCountryCodeAsync?.()) ?? Cellular.mobileCountryCode ?? null;
    const mnc = (await Cellular.getMobileNetworkCodeAsync?.()) ?? Cellular.mobileNetworkCode ?? null;
    const carrier = (await Cellular.getCarrierNameAsync?.()) ?? Cellular.carrier ?? null;
    if (!mcc && !mnc && !carrier) return null; // pas de SIM lisible
    const simId = `cell:${mcc ?? 'x'}-${mnc ?? 'x'}`;
    if (simId === 'cell:x-x') return null;
    return { sim_id: simId, operator: carrier || null };
  } catch {
    return null;
  }
}

/**
 * Signale l'empreinte SIM courante au serveur. Fire-and-forget, ne lève jamais,
 * n'envoie pas deux fois la même empreinte dans la même session.
 */
export async function reportSimFingerprint() {
  try {
    const fp = await readSimFingerprint();
    if (!fp || fp.sim_id === lastSent) return;
    lastSent = fp.sim_id;
    await api.post('/consumer/security/sim-change', { sim_id: fp.sim_id, operator: fp.operator });
  } catch {
    /* jamais bloquant */
  }
}
