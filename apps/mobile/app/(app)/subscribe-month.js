import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card, Muted } from '../../src/components/ui';
import { OrzayahPay } from '../../src/components/OrzayahPay';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

/** Sélecteur du nombre de mois à payer d'avance (1 à 12). */
function MonthStepper({ value, onChange }) {
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
      <Btn label="−" onPress={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink }}>{value}</Text>
        <Text style={{ fontSize: 12.5, color: colors.ink2 }}>mois payé(s) d'avance</Text>
      </View>
      <Btn label="+" onPress={() => onChange(Math.min(12, value + 1))} disabled={value >= 12} />
    </View>
  );
}

/** Paiement de l'abonnement mensuel marchand, plusieurs mois d'avance. */
export default function SubscribeMonth() {
  const { reloadUser } = useAuth();
  const [months, setMonths] = useState(1);
  const { data: plan } = useQuery({ queryKey: ['org', 'plan'], queryFn: () => api.get('/org/subscription/plan') });

  const month = plan?.month_fcfa ?? 1000;
  const amountDue = month * months;

  const stepper = (
    <Card>
      <Muted>Abonnement mensuel</Muted>
      <MonthStepper value={months} onChange={setMonths} />
      <Muted style={{ color: colors.ink3, marginTop: 8 }}>{months} × {nf(month)} = {nf(amountDue)} FCFA</Muted>
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Abonnement mensuel' }} />
      <OrzayahPay
        title="Abonnement mensuel"
        sub={`${months} mois × ${nf(month)} FCFA = ${nf(amountDue)} FCFA. Sécurisation, archivage et sauvegarde des données.`}
        amountLabel={`${nf(amountDue)} FCFA`}
        headerExtra={stepper}
        onStart={() => api.post('/org/subscription/orzayah', { months })}
        onPoll={(id) => api.get(`/org/subscription/orzayah/${id}`)}
        onSuccess={async (r, isContinue) => {
          await reloadUser?.();
          if (isContinue) router.replace('/home');
        }}
      />
    </>
  );
}
