import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

export default function AppLayout() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/login" />;
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
      <Stack.Screen name="operation" options={{ title: 'Opération' }} />
      <Stack.Screen name="check" options={{ title: 'Vérifier un IMEI' }} />
      <Stack.Screen name="receipt/[id]" options={{ title: 'Reçu' }} />
      <Stack.Screen name="history" options={{ title: 'Historique' }} />
      <Stack.Screen name="stats" options={{ title: 'États des ventes' }} />
      <Stack.Screen name="shops" options={{ title: 'Mes magasins' }} />
      <Stack.Screen name="users" options={{ title: 'Comptes vendeurs' }} />
      <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
    </Stack>
  );
}
