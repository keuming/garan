import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

export default function AppLayout() {
  const { ready, isMerchant, isConsumer } = useAuth();
  if (ready && isConsumer) return <Redirect href="/(consumer)/home" />;
  if (ready && !isMerchant) return <Redirect href="/welcome" />;
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
      <Stack.Screen name="sale" options={{ title: 'Vente' }} />
      <Stack.Screen name="operation" options={{ title: 'Opération' }} />
      <Stack.Screen name="availability" options={{ title: 'Disponibilité' }} />
      <Stack.Screen name="listing-form" options={{ title: 'Article' }} />
      <Stack.Screen name="check" options={{ title: 'Vérifier un IMEI' }} />
      <Stack.Screen name="report-theft" options={{ title: 'Déclarer un vol' }} />
      <Stack.Screen name="stolen" options={{ title: 'Téléphones volés' }} />
      <Stack.Screen name="subscribe" options={{ title: 'Abonnement' }} />
      <Stack.Screen name="why" options={{ title: 'Pourquoi gaRAN ?' }} />
      <Stack.Screen name="receipt/[id]" options={{ title: 'Reçu' }} />
      <Stack.Screen name="history" options={{ title: 'Historique' }} />
      <Stack.Screen name="stats" options={{ title: 'États des ventes' }} />
      <Stack.Screen name="shops" options={{ title: 'Mes magasins' }} />
      <Stack.Screen name="users" options={{ title: 'Comptes vendeurs' }} />
      <Stack.Screen name="supervision" options={{ title: 'Mes sous-marchands' }} />
      <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
    </Stack>
  );
}
