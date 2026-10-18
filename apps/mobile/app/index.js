import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Loading, Wordmark } from '../src/components/ui';
import { useAuth } from '../src/lib/auth';
import { colors } from '../src/lib/theme';

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 16 }}>
        <Wordmark size={40} />
        <Loading />
      </View>
    );
  }
  return <Redirect href={user ? '/home' : '/login'} />;
}
