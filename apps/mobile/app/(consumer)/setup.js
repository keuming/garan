import { useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Card, Muted, Segmented } from '../../src/components/ui';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

/** Paiement de la mise en service d'un appareil : solde complet (la norme) ou versement partiel. */
export default function DeviceSetup() {
  const { reg } = useLocalSearchParams();
  const { reloadConsumer } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState('full'); // 'full' = la norme ; 'installment' = option

  const { data: setup, isLoading } = useQuery({
    queryKey: ['consumer', 'device-setup', reg],
    queryFn: () => api.get(`/consumer/devices/${reg}/setup/plan`),
    enabled: Boolean(reg)
  });

  if (!reg) {
    return (
      <>
        <Stack.Screen options={{ title: 'Mise en service' }} />
        <Banner tone="info" title="Choisissez un appareil">
          Ouvrez un appareil depuis l'accueil puis touchez « Payer la mise en service ».
        </Banner>
      </>
    );
  }

  if (setup?.complete) {
    return (
      <>
        <Stack.Screen options={{ title: 'Mise en service' }} />
        <Banner tone="ok" title="Mise en service réglée">
          Les {nf(setup.setup_total_fcfa)} FCFA sont entièrement payés pour cet appareil.
        </Banner>
      </>
    );
  }

  const remaining = setup?.remaining_fcfa ?? 1000;
  const installment = setup?.installment_fcfa ?? 250;
  const canSplit = remaining > installment;
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
          ? `Paiement complet de la mise en service (${nf(remaining)} FCFA restants). Ensuite, l’abonnement est de ${nf(125)} FCFA / mois.`
          : `Versement ${(setup?.installments_paid ?? 0) + 1} / ${setup?.installments_total ?? 4}. Déjà payé ${nf(setup?.setup_paid_fcfa ?? 0)} / ${nf(setup?.setup_total_fcfa ?? 1000)} FCFA · il restera ${nf(Math.max(0, remaining - installment))} FCFA.`}
      </Muted>
      {setup && !setup.setup_first_payment_at ? (
        <Muted style={{ color: colors.ink3, marginTop: 6 }}>
          Dès ce 1er paiement, votre appareil est mis en service{mode === 'full' || !canSplit ? '.' : ` ; réglez le reste sous ${setup.window_days} jours.`}
        </Muted>
      ) : null}
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Mise en service' }} />
      <OrzayahPay
        title="Mise en service de l’appareil"
        sub="Réglez la mise en service (1 000 FCFA). Payez tout de suite, ou en plusieurs versements si besoin (30 jours maximum)."
        amountLabel={`${nf(payAmount)} FCFA`}
        headerExtra={isLoading ? null : info}
        onStart={() => api.post(`/consumer/devices/${reg}/setup/orzayah`, { amount_fcfa: payAmount })}
        onPoll={(id) => api.get(`/consumer/devices/${reg}/setup/orzayah/${id}`)}
        onSuccess={async (r, isContinue) => {
          await reloadConsumer?.();
          await qc.invalidateQueries({ queryKey: ['consumer', 'devices'] });
          await qc.invalidateQueries({ queryKey: ['consumer', 'setup-pending'] });
          if (!isContinue) router.replace(`/device/${reg}`);
        }}
      />
    </>
  );
}
