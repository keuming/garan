import { useState } from 'react';
import { Alert } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Row, Screen, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { date, LABELS } from '../../src/lib/format';

export default function Account() {
  const { user, logout } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/auth/me/pin', { current_pin: cur, new_pin: next }),
    onSuccess: () => {
      Alert.alert('Code PIN modifié', 'Reconnectez-vous avec votre nouveau code.');
      logout();
    }
  });
  const org = user?.organization;
  const digits = (fn) => (t) => fn(t.replace(/\D/g, '').slice(0, 4));

  return (
    <Screen>
      <Title>{user?.full_name}</Title>
      <Card>
        <Row label="Identifiant" value={user?.phone} />
        <Row label="Rôle" value={user?.role === 'owner' ? 'Compte principal' : 'Vendeur'} />
        <Row label="Organisation" value={org?.name} />
        <Row label="Abonnement" value={LABELS.orgStatus[org?.status] ?? org?.status} />
        <Row label="Échéance" value={date(org?.subscription_expires_at)} />
        <Row label="RCCM" value={org?.rccm} />
      </Card>

      <Card>
        <Muted>Changer mon code PIN</Muted>
        <ErrorBanner error={change.error} />
        <Input label="Code PIN actuel" value={cur} onChangeText={digits(setCur)} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <Input label="Nouveau code PIN" value={next} onChangeText={digits(setNext)} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <Button title="Modifier" onPress={() => change.mutate()} loading={change.isPending} disabled={cur.length !== 4 || next.length !== 4} />
      </Card>

      <Banner tone="info">Assistance gaRAN : contactez votre conseiller pour le renouvellement de l’abonnement ou l’ajout de magasins.</Banner>
      <Button title="Se déconnecter" variant="danger" onPress={logout} />
      <Muted style={{ textAlign: 'center' }}>{Constants.expoConfig?.name} · v{Constants.expoConfig?.version}</Muted>
    </Screen>
  );
}
