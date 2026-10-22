import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, router } from 'expo-router';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function Subscribe() {
  const { reloadConsumer } = useAuth();

  // Paiement lancé puis interrompu (appli fermée ou tuée pendant le paiement) : le suivi de l'écran
  // est perdu, donc on demande au serveur de relire les paiements en attente (à l'ouverture et au retour).
  useEffect(() => {
    let alive = true;
    async function sync() {
      try {
        const r = await api.post('/consumer/subscription/sync', {});
        if (alive && r?.applied) {
          await reloadConsumer?.();
          router.replace('/(consumer)/home');
        }
      } catch {
        /* silencieux : la relecture sera retentée au prochain retour dans l'appli */
      }
    }
    sync();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') sync();
    });
    return () => {
      alive = false;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: 'Abonnement' }} />
      <OrzayahPay
        title="Abonnement usager"
        sub="Protégez vos téléphones et débloquez tous les avantages gaRAN."
        amountLabel="100 FCFA / mois"
        onStart={({ operator, account_number }) => api.post('/consumer/subscription/orzayah', { operator, account_number, months: 1 })}
        onPoll={(id) => api.get(`/consumer/subscription/orzayah/${id}`)}
        onSuccess={async (r, isContinue) => { if (isContinue) router.replace('/(consumer)/home'); else await reloadConsumer?.(); }}
      />
    </>
  );
}
