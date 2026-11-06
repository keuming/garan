import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

export default function Subscribe() {
  const { reloadConsumer } = useAuth();
  const { data: plan } = useQuery({ queryKey: ['consumer', 'plan'], queryFn: () => api.get('/consumer/subscription/plan') });
  const amountLabel = plan ? (plan.is_first ? `${nf(plan.amount_due_fcfa)} FCFA` : `${nf(plan.month_fcfa)} FCFA / mois`) : '…';
  const amountSub = plan
    ? (plan.is_first
        ? `Première activation : mise en service ${nf(plan.setup_fcfa)} FCFA + 1 mois ${nf(plan.month_fcfa)} FCFA. Ensuite ${nf(plan.month_fcfa)} FCFA / mois.`
        : `Renouvellement : ${nf(plan.month_fcfa)} FCFA / mois.`)
    : 'Protégez vos téléphones et débloquez tous les avantages gaRAN.';

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
        sub={amountSub}
        amountLabel={amountLabel}
        onStart={({ operator, account_number }) => api.post('/consumer/subscription/orzayah', { operator, account_number, months: 1 })}
        onPoll={(id) => api.get(`/consumer/subscription/orzayah/${id}`)}
        onSuccess={async (r, isContinue) => { if (isContinue) router.replace('/(consumer)/home'); else await reloadConsumer?.(); }}
      />
    </>
  );
}
