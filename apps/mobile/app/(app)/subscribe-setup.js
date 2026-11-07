import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Banner, Card, Muted } from '../../src/components/ui';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

/** Paiement d'un versement de mise en service marchand (2 500 FCFA, ou le reste). */
export default function SubscribeSetup() {
  const { reloadUser } = useAuth();
  const { data: setup } = useQuery({ queryKey: ['org', 'setup'], queryFn: () => api.get('/org/setup/plan') });

  if (setup?.complete) {
    return (
      <>
        <Stack.Screen options={{ title: 'Mise en service' }} />
        <Banner tone="ok" title="Mise en service réglée">Les {nf(setup.setup_total_fcfa)} FCFA sont entièrement payés.</Banner>
      </>
    );
  }

  const amount = setup?.installment_fcfa ?? 2500;
  const info = (
    <Card>
      <Muted>Versement {(setup?.installments_paid ?? 0) + 1} / {setup?.installments_total ?? 4}</Muted>
      <Muted style={{ color: colors.ink3 }}>
        Déjà payé {nf(setup?.setup_paid_fcfa ?? 0)} / {nf(setup?.setup_total_fcfa ?? 10000)} FCFA · reste {nf(setup?.remaining_fcfa ?? 10000)} FCFA après ce versement : {nf(Math.max(0, (setup?.remaining_fcfa ?? 10000) - amount))} FCFA.
      </Muted>
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Mise en service' }} />
      <OrzayahPay
        title="Versement de mise en service"
        sub="Réglez votre mise en service marchand en plusieurs versements de 2 500 FCFA (30 jours maximum)."
        amountLabel={`${nf(amount)} FCFA`}
        headerExtra={info}
        onStart={() => api.post('/org/setup/orzayah', {})}
        onPoll={(id) => api.get(`/org/setup/orzayah/${id}`)}
        onSuccess={async (r, isContinue) => {
          await reloadUser?.();
          if (isContinue) router.replace('/subscribe');
        }}
      />
    </>
  );
}
