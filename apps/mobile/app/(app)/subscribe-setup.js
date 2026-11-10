import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Banner, Card, Muted, Segmented } from '../../src/components/ui';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

/** Paiement de la mise en service marchand : solde complet (la norme) ou versement partiel. */
export default function SubscribeSetup() {
  const { reloadUser } = useAuth();
  const { data: setup } = useQuery({ queryKey: ['org', 'setup'], queryFn: () => api.get('/org/setup/plan') });
  const [mode, setMode] = useState('full'); // 'full' = la norme ; 'installment' = option

  if (setup?.complete) {
    return (
      <>
        <Stack.Screen options={{ title: 'Mise en service' }} />
        <Banner tone="ok" title="Mise en service réglée">Les {nf(setup.setup_total_fcfa)} FCFA sont entièrement payés.</Banner>
      </>
    );
  }

  const remaining = setup?.remaining_fcfa ?? 10000;
  const installment = setup?.installment_fcfa ?? 2500;
  const canSplit = remaining > installment; // s'il ne reste qu'un versement, pas d'option utile
  const payAmount = mode === 'full' || !canSplit ? remaining : installment;

  const info = (
    <Card>
      <Muted>Comment souhaitez-vous régler ?</Muted>
      {canSplit ? (
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'full', label: `Tout régler · ${nf(remaining)} F` },
            { value: 'installment', label: `En plusieurs fois · ${nf(installment)} F` }
          ]}
        />
      ) : null}
      <Muted style={{ color: colors.ink3, marginTop: 6 }}>
        {mode === 'full' || !canSplit
          ? `Paiement complet de la mise en service (${nf(remaining)} FCFA restants). Ensuite, l’abonnement est de ${nf(1000)} FCFA / mois.`
          : `Versement ${(setup?.installments_paid ?? 0) + 1} / ${setup?.installments_total ?? 4}. Déjà payé ${nf(setup?.setup_paid_fcfa ?? 0)} / ${nf(setup?.setup_total_fcfa ?? 10000)} FCFA · il restera ${nf(Math.max(0, remaining - installment))} FCFA.`}
      </Muted>
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Mise en service' }} />
      <OrzayahPay
        title="Mise en service marchand"
        sub="Réglez la mise en service de votre compte (10 000 FCFA). Payez tout de suite, ou en plusieurs versements si besoin (30 jours maximum)."
        amountLabel={`${nf(payAmount)} FCFA`}
        headerExtra={info}
        onStart={() => api.post('/org/setup/orzayah', { amount_fcfa: payAmount })}
        onPoll={(id) => api.get(`/org/setup/orzayah/${id}`)}
        onSuccess={async (r, isContinue) => {
          await reloadUser?.();
          if (isContinue) router.replace('/subscribe');
        }}
      />
    </>
  );
}
