import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

export default function Subscribe() {
  const { reloadUser } = useAuth();
  const { data: plan } = useQuery({ queryKey: ['org', 'plan'], queryFn: () => api.get('/org/subscription/plan') });
  const amountLabel = plan ? (plan.is_first ? `${nf(plan.amount_due_fcfa)} FCFA` : `${nf(plan.month_fcfa)} FCFA / mois`) : '…';
  const amountSub = plan
    ? (plan.is_first
        ? `Première activation : mise en service ${nf(plan.setup_fcfa)} FCFA + 1 mois ${nf(plan.month_fcfa)} FCFA. Ensuite ${nf(plan.month_fcfa)} FCFA / mois.`
        : `Renouvellement : ${nf(plan.month_fcfa)} FCFA / mois.`)
    : 'Activez votre abonnement gaRAN pour enregistrer vos opérations sans interruption.';
  return (
    <>
      <Stack.Screen options={{ title: 'Abonnement' }} />
      <OrzayahPay
        title="Abonnement marchand"
        sub={amountSub}
        amountLabel={amountLabel}
        onStart={({ operator, account_number }) => api.post('/org/subscription/orzayah', { operator, account_number, months: 1 })}
        onPoll={(id) => api.get(`/org/subscription/orzayah/${id}`)}
        onSuccess={async (r, isContinue) => { if (isContinue) router.replace('/home'); else await reloadUser?.(); }}
      />
    </>
  );
}
