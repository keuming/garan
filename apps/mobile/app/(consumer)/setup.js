import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Card, Muted } from '../../src/components/ui';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

/** Paiement d'un versement de mise en service d'un appareil (250 FCFA, ou le reste). */
export default function DeviceSetup() {
  const { reg } = useLocalSearchParams();
  const { reloadConsumer } = useAuth();
  const qc = useQueryClient();

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
          Ouvrez un téléphone depuis l'accueil puis touchez « Payer la mise en service ».
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

  const amount = setup?.installment_fcfa ?? 250;
  const info = (
    <Card>
      <Muted>Versement {(setup?.installments_paid ?? 0) + 1} / {setup?.installments_total ?? 4}</Muted>
      <Muted style={{ color: colors.ink3 }}>
        Déjà payé {nf(setup?.setup_paid_fcfa ?? 0)} / {nf(setup?.setup_total_fcfa ?? 1000)} FCFA · reste après ce versement : {nf(Math.max(0, (setup?.remaining_fcfa ?? 1000) - amount))} FCFA.
      </Muted>
      {setup && !setup.setup_first_payment_at ? (
        <Muted style={{ color: colors.ink3, marginTop: 6 }}>
          Dès ce 1er versement, votre appareil est mis en service ; réglez le reste sous {setup.window_days} jours.
        </Muted>
      ) : null}
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Mise en service' }} />
      <OrzayahPay
        title="Versement de mise en service"
        sub={`Réglez la mise en service de votre appareil (1 000 FCFA) en ${setup?.installments_total ?? 4} versements de ${nf(amount)} FCFA (30 jours maximum).`}
        amountLabel={`${nf(amount)} FCFA`}
        headerExtra={isLoading ? null : info}
        onStart={() => api.post(`/consumer/devices/${reg}/setup/orzayah`, {})}
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
