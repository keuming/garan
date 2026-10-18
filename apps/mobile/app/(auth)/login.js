import { useState } from 'react';
import { Image, View } from 'react-native';
import { Link } from 'expo-router';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Screen, Wordmark } from '../../src/components/ui';
import { IS_SUPERVISOR_APP, useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(phone, pin);
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
    <Screen contentStyle={{ paddingTop: 72 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: 20 }} accessibilityIgnoresInvertColors />
        <Wordmark size={40} />
        <Muted style={{ fontSize: 15 }}>{IS_SUPERVISOR_APP ? 'Espace superviseur' : 'Registre digital des téléphones · IMEI'}</Muted>
      </View>
      <Card>
        <ErrorBanner error={error} />
        <Input label="Numéro de téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="07 07 00 00 00" />
        <Input label="Code PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" onSubmitEditing={submit} />
        <Button title="Se connecter" onPress={submit} loading={busy} disabled={phone.length < 8 || pin.length !== 4} />
      </Card>
      {IS_SUPERVISOR_APP ? (
        <Banner tone="info">Connectez-vous avec le compte principal créé lors de l’inscription de votre premier magasin.</Banner>
      ) : (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Muted>Nouveau commerçant ?</Muted>
          <Link href="/register" style={{ color: colors.blue, fontWeight: '700', fontSize: 16, padding: 8 }}>
            Créer le compte de mon magasin
          </Link>
        </View>
      )}
    </Screen>
  );
}
