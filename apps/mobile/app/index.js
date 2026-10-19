import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Loading, Wordmark } from '../src/components/ui';
import { useAuth } from '../src/lib/auth';
import { colors } from '../src/lib/theme';

export default function Index() {
  const { ready, isConsumer, isMerchant } = useAuth();
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
  return <Redirect href="/welcome" />;
}
