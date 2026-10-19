import { router } from 'expo-router';
import { WhyGaran } from '../../src/components/WhyGaran';
export default function Why() {
  return <WhyGaran role="consumer" onSubscribe={(r) => router.push({ pathname: '/login', params: { profile: r === 'merchant' ? 'merchant' : 'consumer' } })} />;
}
