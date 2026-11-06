import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';
import { reportSimFingerprint } from '../../src/lib/sim-watch';

export default function ConsumerLayout() {
  const { ready, isConsumer, isMerchant } = useAuth();

  // Surveillance SIM : à l'ouverture et à chaque réveil de l'app (usager connecté uniquement).
  useEffect(() => {
    if (!(ready && isConsumer)) return undefined;
    reportSimFingerprint();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reportSimFingerprint();
    });
    return () => sub.remove();
  }, [ready, isConsumer]);

  if (ready && isMerchant) return <Redirect href="/(app)/home" />;
  if (ready && !isConsumer) return <Redirect href="/welcome" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: 'Retour'
      }}
    >
      <Stack.Screen name="home" options={{ title: 'gaRAN' }} />
      <Stack.Screen name="link" options={{ title: 'Linker mon téléphone' }} />
      <Stack.Screen name="device/[id]" options={{ title: 'Mon téléphone' }} />
      <Stack.Screen name="check" options={{ title: 'Vérifier un IMEI' }} />
      <Stack.Screen name="stolen" options={{ title: 'Téléphones volés' }} />
      <Stack.Screen name="subscribe" options={{ title: 'Abonnement' }} />
      <Stack.Screen name="why" options={{ title: 'Pourquoi gaRAN ?' }} />
      <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
    </Stack>
  );
}
