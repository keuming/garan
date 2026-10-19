import { router } from 'expo-router';
import { WhyGaran } from '../../src/components/WhyGaran';
export default function Why() {
  return <WhyGaran role="merchant" lockRole onSubscribe={() => router.push('/subscribe')} />;
}
