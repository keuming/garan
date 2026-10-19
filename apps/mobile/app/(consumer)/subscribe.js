import { Stack, router } from 'expo-router';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function Subscribe() {
  const { reloadConsumer } = useAuth();
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
