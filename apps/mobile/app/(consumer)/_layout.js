import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

export default function ConsumerLayout() {
  const { ready, isConsumer, isMerchant } = useAuth();
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
      <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
    </Stack>
  );
}
