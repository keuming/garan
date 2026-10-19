import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

export default function AuthLayout() {
  const { ready, isConsumer, isMerchant } = useAuth();
  if (ready && isConsumer) return <Redirect href="/(consumer)/home" />;
  if (ready && isMerchant) return <Redirect href="/home" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: 'Retour'
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'Connexion' }} />
      <Stack.Screen name="register" options={{ title: 'Créer un compte' }} />
      <Stack.Screen name="why" options={{ title: 'Pourquoi gaRAN ?' }} />
    </Stack>
  );
}
