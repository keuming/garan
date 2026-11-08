import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Loading, Wordmark } from '../src/components/ui';
import { useAuth } from '../src/lib/auth';
import { colors } from '../src/lib/theme';

export default function Index() {
  const { ready, isConsumer, isMerchant } = useAuth();
  const { code } = useLocalSearchParams();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 16 }}>
        <Wordmark size={40} />
        <Loading />
      </View>
    );
  }
  if (isConsumer) return <Redirect href="/(consumer)/home" />;
  if (isMerchant) return <Redirect href="/home" />;
  const promo = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return <Redirect href={promo ? `/welcome?code=${promo}` : '/welcome'} />;
}
