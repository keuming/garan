import { Stack, router } from 'expo-router';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function Subscribe() {
  const { reloadUser } = useAuth();
  return (
    <>
      <Stack.Screen options={{ title: 'Abonnement' }} />
      <OrzayahPay
        title="Abonnement marchand"
        sub="Activez votre abonnement gaRAN pour enregistrer vos opérations sans interruption."
        amountLabel="1 000 FCFA / mois"
        onStart={({ operator, account_number }) => api.post('/org/subscription/orzayah', { operator, account_number, months: 1 })}
        onPoll={(id) => api.get(`/org/subscription/orzayah/${id}`)}
        onSuccess={async (r, isContinue) => { if (isContinue) router.replace('/home'); else await reloadUser?.(); }}
      />
    </>
  );
}
