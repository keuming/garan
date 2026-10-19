import { useState } from 'react';
import { View } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Screen, Wordmark } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

const LABEL = { consumer: 'Usager', merchant: 'Marchand', super_merchant: 'Super marchand' };

export default function Login() {
  const { profile = 'consumer' } = useLocalSearchParams();
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(profile, phone, pin);
    } catch (e) {
      setError(e.code === 'INVALID_CREDENTIALS' && e.details?.remaining_attempts !== undefined
        ? new Error(`${e.message}. Tentatives restantes : ${e.details.remaining_attempts}`)
        : e);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={{ paddingTop: 40 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Wordmark size={36} />
        <Banner tone="info">Connexion · profil {LABEL[profile]}</Banner>
      </View>
      <Card>
        <ErrorBanner error={error} />
        <Input label="Numéro de téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="07 07 00 00 00" />
        <Input label="Code PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" onSubmitEditing={submit} />
        <Button title="Se connecter" onPress={submit} loading={busy} disabled={phone.length < 8 || pin.length !== 4} />
      </Card>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Muted>Pas encore de compte {LABEL[profile]} ?</Muted>
        <Link href={{ pathname: '/register', params: { profile } }} style={{ color: colors.blue, fontWeight: '700', fontSize: 16, padding: 8 }}>
          Créer un compte
        </Link>
        <Link href="/welcome" style={{ color: colors.ink2, padding: 6 }}>← Changer de profil</Link>
      </View>
    </Screen>
  );
}
