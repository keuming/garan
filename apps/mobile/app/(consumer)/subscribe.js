import { useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Card, Muted } from '../../src/components/ui';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

/** Sélecteur du nombre de mois à payer d'avance (1 à 12). */
function MonthStepper({ value, onChange }) {
  const dec = () => onChange(Math.max(1, value - 1));
  const inc = () => onChange(Math.min(12, value + 1));
  const Btn = ({ label, onPress, disabled }) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? colors.line : colors.navy },
        pressed && { opacity: 0.85 }
      ]}
    >
      <Text style={{ color: disabled ? colors.ink2 : '#fff', fontSize: 24, fontWeight: '900' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
      <Btn label="−" onPress={dec} disabled={value <= 1} />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink }}>{value}</Text>
        <Text style={{ fontSize: 12.5, color: colors.ink2 }}>mois payé(s) d'avance</Text>
      </View>
      <Btn label="+" onPress={inc} disabled={value >= 12} />
    </View>
  );
}

export default function Subscribe() {
  const { reg } = useLocalSearchParams();
  const { reloadConsumer } = useAuth();
  const qc = useQueryClient();
  const [months, setMonths] = useState(1);

  const { data: plan, isLoading } = useQuery({
    queryKey: ['consumer', 'device-plan', reg],
    queryFn: () => api.get(`/consumer/devices/${reg}/subscription/plan`),
    enabled: Boolean(reg)
  });

  // Rattrape un paiement validé alors que l'app avait été fermée (suivi perdu côté écran).
  useEffect(() => {
    let alive = true;
    async function sync() {
      try {
        const r = await api.post('/consumer/subscription/sync', {});
        if (alive && r?.applied) {
          await reloadConsumer?.();
          await qc.invalidateQueries({ queryKey: ['consumer', 'devices'] });
        }
      } catch {
        /* silencieux : réessayé au prochain retour dans l'appli */
      }
    }
    sync();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') sync(); });
    return () => { alive = false; sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!reg) {
    return (
      <>
        <Stack.Screen options={{ title: 'Abonnement' }} />
        <Banner tone="info" title="Choisissez un appareil">
          L'abonnement se fait par appareil. Ouvrez un téléphone depuis l'accueil puis touchez « Abonner cet appareil ».
        </Banner>
      </>
    );
  }

  const setup = plan?.is_first ? plan.setup_fcfa : 0;
  const month = plan?.month_fcfa ?? 125;
  const amountDue = setup + month * months;
  const amountLabel = plan ? `${nf(amountDue)} FCFA` : '…';
  const deviceName = plan?.device ? `${plan.device.brand ?? ''} ${plan.device.model ?? ''}`.trim() : 'cet appareil';
  const sub = plan
    ? (plan.is_first
        ? `Mise en service ${nf(setup)} FCFA (une seule fois) + ${months} mois × ${nf(month)} = ${nf(amountDue)} FCFA. Sécurisation, archivage et sauvegarde des données.`
        : `${months} mois × ${nf(month)} FCFA = ${nf(amountDue)} FCFA. Sécurisation, archivage et sauvegarde des données.`)
    : 'Chargement du montant…';

  const stepper = (
    <Card>
      <Muted>{deviceName}</Muted>
      {plan?.device?.imei1 ? <Muted style={{ color: colors.ink3 }}>IMEI {plan.device.imei1}</Muted> : null}
      <MonthStepper value={months} onChange={setMonths} />
      {plan ? (
        <Muted style={{ color: colors.ink3, marginTop: 8 }}>
          {plan.is_first
            ? `Mise en service ${nf(setup)} + abonnement ${months} × ${nf(month)} = ${nf(amountDue)} FCFA`
            : `Abonnement ${months} × ${nf(month)} = ${nf(amountDue)} FCFA`}
        </Muted>
      ) : null}
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Abonner l’appareil' }} />
      <OrzayahPay
        title="Abonnement de l’appareil"
        sub={sub}
        amountLabel={amountLabel}
        headerExtra={isLoading ? null : stepper}
        onStart={() => api.post(`/consumer/devices/${reg}/subscription/orzayah`, { months })}
        onPoll={(id) => api.get(`/consumer/devices/${reg}/subscription/orzayah/${id}`)}
        onSuccess={async () => {
          await reloadConsumer?.();
          await qc.invalidateQueries({ queryKey: ['consumer', 'devices'] });
          router.replace(`/device/${reg}`);
        }}
      />
    </>
  );
}
