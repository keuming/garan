import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Card, ErrorBanner, Input, Loading, Muted, Screen, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors } from '../../src/lib/theme';

const EMPTY = { name: '', phone: '', email: '', rccm: '', country: "Côte d'Ivoire", city: '', district: '', address: '' };

export default function Shops() {
  const { user, reload } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const shops = useQuery({ queryKey: ['org-shops'], queryFn: () => api.get('/org/shops') });

  const done = async () => {
    setForm(null);
    await qc.invalidateQueries({ queryKey: ['org-shops'] });
    await reload();
  };
  const create = useMutation({ mutationFn: () => api.post('/org/shops', form), onSuccess: done });
  const toggle = useMutation({
    mutationFn: (s) => api.patch(`/org/shops/${s.id}`, { status: s.status === 'active' ? 'disabled' : 'active' }),
    onSuccess: done
  });
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const max = user?.organization?.max_shops ?? 1;
  const activeCount = (shops.data?.items ?? []).filter((s) => s.status === 'active').length;

  return (
    <Screen refreshing={shops.isFetching} onRefresh={shops.refetch}>
      <Title sub={`${activeCount} magasin(s) actif(s) sur ${max} autorisé(s) par votre abonnement`}>Mes magasins</Title>
      <ErrorBanner error={shops.error || toggle.error} />
      {shops.isLoading ? <Loading /> : null}
      {shops.data?.items.map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink, flexShrink: 1 }}>{s.name}</Text>
            <Text style={{ color: s.status === 'active' ? colors.ok : colors.ink3, fontWeight: '600' }}>{s.status === 'active' ? 'Actif' : 'Désactivé'}</Text>
          </View>
          <Muted>{s.city}, {s.district} · {s.phone}</Muted>
          <Muted>{s.agents_count} compte(s) vendeur actif(s)</Muted>
          <Button title={s.status === 'active' ? 'Désactiver' : 'Réactiver'} variant="secondary" onPress={() => toggle.mutate(s)} style={{ minHeight: 42 }} />
        </Card>
      ))}

      {form ? (
        <Card>
          <Muted>Nouveau magasin</Muted>
          <ErrorBanner error={create.error} />
          <Input label="Nom du magasin" value={form.name} onChangeText={set('name')} />
          <Input label="Contact" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Input label="E-mail (facultatif)" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <Input label="RCCM (facultatif)" value={form.rccm} onChangeText={set('rccm')} autoCapitalize="characters" />
          <Input label="Pays" value={form.country} onChangeText={set('country')} />
          <Input label="Ville" value={form.city} onChangeText={set('city')} />
          <Input label="Quartier" value={form.district} onChangeText={set('district')} />
          <Input label="Adresse (facultatif)" value={form.address} onChangeText={set('address')} />
          <Button title="Créer le magasin" onPress={() => create.mutate()} loading={create.isPending} disabled={!form.name || !form.phone || !form.city || !form.district} />
          <Button title="Annuler" variant="secondary" onPress={() => setForm(null)} />
        </Card>
      ) : activeCount < max ? (
        <Button title="Ajouter un magasin" onPress={() => setForm(EMPTY)} />
      ) : (
        <Banner tone="info">Limite de magasins atteinte. Contactez gaRAN pour étendre votre abonnement.</Banner>
      )}
    </Screen>
  );
}
