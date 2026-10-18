import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorBanner, Input, Loading, Muted, Screen, Select, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { dateTime } from '../../src/lib/format';
import { colors } from '../../src/lib/theme';

export default function Users() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [pinFor, setPinFor] = useState(null);
  const [newPin, setNewPin] = useState('');

  const users = useQuery({ queryKey: ['org-users'], queryFn: () => api.get('/org/users') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['org-users'] });

  const create = useMutation({ mutationFn: () => api.post('/org/users', form), onSuccess: () => { setForm(null); refresh(); } });
  const update = useMutation({ mutationFn: ({ id, ...body }) => api.patch(`/org/users/${id}`, body), onSuccess: () => { setPinFor(null); setNewPin(''); refresh(); } });

  const shopOptions = (user?.shops ?? []).filter((s) => s.status === 'active').map((s) => ({ value: s.id, label: s.name }));

  return (
    <Screen refreshing={users.isFetching} onRefresh={users.refetch}>
      <Title sub="Chaque vendeur se connecte avec son propre numéro et son code PIN, rattaché à un magasin.">Comptes vendeurs</Title>
      <ErrorBanner error={users.error || update.error} />
      {users.isLoading ? <Loading /> : null}
      {users.data?.items.map((u) => (
        <Card key={u.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 }}>{u.full_name}</Text>
            <Text style={{ color: u.status === 'active' ? colors.ok : colors.ink3, fontWeight: '600' }}>
              {u.role === 'owner' ? 'Principal' : u.status === 'active' ? 'Actif' : 'Désactivé'}
            </Text>
          </View>
          <Muted>{u.phone} · {u.shop_name ?? 'Tous les magasins'}</Muted>
          <Muted>Dernière connexion : {dateTime(u.last_login_at)}</Muted>
          {u.role === 'agent' ? (
            pinFor === u.id ? (
              <>
                <Input label="Nouveau code PIN" value={newPin} onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} />
                <Button title="Enregistrer le PIN" onPress={() => update.mutate({ id: u.id, pin: newPin })} disabled={newPin.length !== 4} loading={update.isPending} />
                <Button title="Annuler" variant="secondary" onPress={() => setPinFor(null)} />
              </>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Changer le PIN" variant="secondary" style={{ flex: 1, minHeight: 42 }} onPress={() => setPinFor(u.id)} />
                <Button
                  title={u.status === 'active' ? 'Désactiver' : 'Réactiver'}
                  variant={u.status === 'active' ? 'danger' : 'secondary'}
                  style={{ flex: 1, minHeight: 42 }}
                  onPress={() =>
                    u.status === 'active'
                      ? Alert.alert('Désactiver ce compte ?', `${u.full_name} ne pourra plus se connecter.`, [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Désactiver', style: 'destructive', onPress: () => update.mutate({ id: u.id, status: 'disabled' }) }
                        ])
                      : update.mutate({ id: u.id, status: 'active' })
                  }
                />
              </View>
            )
          ) : null}
        </Card>
      ))}

      {form ? (
        <Card>
          <Muted>Nouveau compte vendeur</Muted>
          <ErrorBanner error={create.error} />
          <Input label="Nom complet" value={form.full_name} onChangeText={(t) => setForm({ ...form, full_name: t })} autoCapitalize="words" />
          <Input label="Login (numéro de téléphone)" value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} keyboardType="phone-pad" />
          <Input label="Code PIN (4 chiffres)" value={form.pin} onChangeText={(t) => setForm({ ...form, pin: t.replace(/\D/g, '').slice(0, 4) })} keyboardType="number-pad" secureTextEntry maxLength={4} />
          <Select label="Magasin" value={form.shop_id} options={shopOptions} onChange={(v) => setForm({ ...form, shop_id: v })} />
          <Button title="Créer le compte" onPress={() => create.mutate()} loading={create.isPending} disabled={!form.full_name || !form.phone || form.pin.length !== 4 || !form.shop_id} />
          <Button title="Annuler" variant="secondary" onPress={() => setForm(null)} />
        </Card>
      ) : (
        <Button title="Ajouter un vendeur" onPress={() => setForm({ full_name: '', phone: '', pin: '', shop_id: shopOptions.length === 1 ? shopOptions[0].value : undefined })} />
      )}
    </Screen>
  );
}
