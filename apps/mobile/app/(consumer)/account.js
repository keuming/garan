import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Row, Screen, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { date } from '../../src/lib/format';

export default function ConsumerAccount() {
  const { consumer, reloadConsumer, logout } = useAuth();
  const [profile, setProfile] = useState({
    full_name: consumer?.full_name ?? '',
    email: consumer?.email ?? '',
    emergency_number: consumer?.emergency_number ?? '',
    emergency_name: consumer?.emergency_name ?? ''
  });
  const [pin, setPin] = useState({ current_pin: '', new_pin: '', confirm: '' });
  const setP = (k) => (v) => setProfile((p) => ({ ...p, [k]: v }));
  const setPin2 = (k) => (v) => setPin((p) => ({ ...p, [k]: v.replace(/\D/g, '').slice(0, 4) }));

  const saveProfile = useMutation({
    mutationFn: () => api.patch('/consumer/me', { full_name: profile.full_name, email: profile.email || null, emergency_number: profile.emergency_number || null, emergency_name: profile.emergency_name || null }),
    onSuccess: () => { reloadConsumer(); Alert.alert('Enregistré', 'Vos informations ont été mises à jour.'); }
  });

  const changePin = useMutation({
    mutationFn: () => api.post('/consumer/me/pin', { current_pin: pin.current_pin, new_pin: pin.new_pin }),
    onSuccess: async () => {
      Alert.alert('Code PIN modifié', 'Reconnectez-vous avec votre nouveau code PIN.');
      await logout();
      router.replace('/welcome');
    }
  });

  const pinMismatch = pin.confirm.length === 4 && pin.new_pin !== pin.confirm;
  const pinReady = pin.current_pin.length === 4 && pin.new_pin.length === 4 && pin.new_pin === pin.confirm;

  async function confirmLogout() {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: async () => { await logout(); router.replace('/welcome'); } }
    ]);
  }

  return (
    <Screen>
      <Title>Mon compte</Title>

      <Card>
        <Muted>Identifiant de connexion</Muted>
        <Row label="Téléphone" value={consumer?.phone ?? '—'} />
        <Muted>Le numéro de téléphone sert d’identifiant et ne peut pas être modifié.</Muted>
      </Card>

      <Card>
        <Muted>Abonnement gaRAN</Muted>
        <Row label="Statut" value={consumer?.subscription_expires_at && new Date(consumer.subscription_expires_at) > new Date() ? `Actif jusqu’au ${date(consumer.subscription_expires_at)}` : 'Non abonné'} />
        <Button title="S’abonner / Renouveler (100 FCFA/mois)" onPress={() => router.push('/subscribe')} />
      </Card>

      <Card>
        <Muted>Mes informations</Muted>
        <Input label="Nom et prénoms" value={profile.full_name} onChangeText={setP('full_name')} autoCapitalize="words" />
        <Input label="Adresse e-mail (facultatif)" value={profile.email} onChangeText={setP('email')} keyboardType="email-address" autoCapitalize="none" />
        <Muted>Contact de secours — prévenu par SMS en cas de changement de carte SIM (vol probable).</Muted>
        <Input label="Numéro de secours" value={profile.emergency_number} onChangeText={setP('emergency_number')} keyboardType="phone-pad" placeholder="Ex. 0700000000" />
        <Input label="Nom du contact de secours (facultatif)" value={profile.emergency_name} onChangeText={setP('emergency_name')} autoCapitalize="words" />
        <ErrorBanner error={saveProfile.error} />
        <Button title="Enregistrer" onPress={() => saveProfile.mutate()} loading={saveProfile.isPending} disabled={!profile.full_name} />
      </Card>

      <Card>
        <Muted>Changer mon code PIN</Muted>
        <Input label="Code PIN actuel" value={pin.current_pin} onChangeText={setPin2('current_pin')} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <Input label="Nouveau code PIN" value={pin.new_pin} onChangeText={setPin2('new_pin')} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <Input label="Confirmer le nouveau PIN" value={pin.confirm} onChangeText={setPin2('confirm')} keyboardType="number-pad" secureTextEntry maxLength={4} error={pinMismatch ? 'Les codes PIN ne correspondent pas' : null} />
        <ErrorBanner error={changePin.error} />
        <Button title="Modifier le code PIN" variant="navy" onPress={() => changePin.mutate()} loading={changePin.isPending} disabled={!pinReady} />
      </Card>

      <Banner tone="info">Ne communiquez jamais votre code PIN, même à un agent gaRAN.</Banner>
      <Button title="Se déconnecter" variant="secondary" onPress={confirmLogout} />
    </Screen>
  );
}
