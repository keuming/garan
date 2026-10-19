import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandModelPicker } from '../../src/components/BrandModelPicker';
import { IdPhotoField } from '../../src/components/IdPhotoField';
import { Banner, Button, Card, ErrorBanner, Input, Loading, Muted, Screen, Segmented, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';

export default function ListingForm() {
  const { id } = useLocalSearchParams();
  const editing = Boolean(id);
  const qc = useQueryClient();

  const list = useQuery({ queryKey: ['org', 'listings'], queryFn: () => api.get('/org/listings'), enabled: editing });
  const current = editing ? (list.data?.items ?? []).find((x) => x.id === id) : null;

  const [device, setDevice] = useState({ brand_id: undefined, model_id: undefined, model_label: undefined });
  const [f, setF] = useState({ description: '', price: '', quantity: '1', photo_key: null, status: 'active' });
  const [hydrated, setHydrated] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  // Pré-remplissage en édition (une seule fois, quand la liste arrive).
  if (editing && current && !hydrated) {
    setF({
      description: current.description ?? '',
      price: String(current.price ?? ''),
      quantity: String(current.quantity ?? '0'),
      photo_key: current.photo_key ?? null,
      status: current.status ?? 'active'
    });
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        return api.patch(`/org/listings/${id}`, {
          description: f.description || null,
          price: Number(f.price || 0),
          quantity: Number(f.quantity || 0),
          photo_key: f.photo_key || null,
          status: f.status
        });
      }
      return api.post('/org/listings', {
        brand_id: device.brand_id,
        model_id: device.model_id,
        model_label: device.model_label || undefined,
        description: f.description || undefined,
        photo_key: f.photo_key || undefined,
        price: Number(f.price || 0),
        quantity: Number(f.quantity || 0)
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org', 'listings'] });
      router.back();
    }
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/org/listings/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org', 'listings'] });
      router.back();
    }
  });

  function confirmRemove() {
    Alert.alert('Supprimer cet article ?', 'Il disparaîtra de votre vitrine.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => remove.mutate() }
    ]);
  }

  const modelOk = editing || (device.brand_id && (device.model_id || (device.model_label && device.model_label.trim())));
  const canSave = modelOk && f.price !== '' && f.quantity !== '' && !save.isPending;

  if (editing && list.isLoading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? 'Modifier l’article' : 'Nouvel article' }} />
      <Title sub="Un article disponible apparaît dans votre vitrine partageable. Le stock baisse à chaque vente liée.">
        {editing ? (current?.title ?? 'Modifier l’article') : 'Nouvel article'}
      </Title>

      {!editing ? (
        <Card>
          <Muted>Article (modèle du catalogue)</Muted>
          <BrandModelPicker value={device} onChange={setDevice} />
        </Card>
      ) : null}

      <Card>
        <Muted>Photo de l’article</Muted>
        <IdPhotoField label="Photo (une seule)" uploadedKey={f.photo_key} onUploaded={set('photo_key')} uploader={api.uploadListingPhoto} aspectRatio={1} />
      </Card>

      <Card>
        <Input label="Description" value={f.description} onChangeText={set('description')} placeholder="État, couleur, stockage, garantie…" multiline />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Input label="Prix (FCFA)" value={f.price} onChangeText={(t) => set('price')(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Quantité" value={f.quantity} onChangeText={(t) => set('quantity')(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
        </View>
        {editing ? (
          <>
            <Muted>Visibilité</Muted>
            <Segmented
              value={f.status}
              onChange={set('status')}
              options={[{ value: 'active', label: 'Visible' }, { value: 'hidden', label: 'Masqué' }]}
            />
          </>
        ) : null}
      </Card>

      <ErrorBanner error={save.error} />
      {!modelOk && !editing ? <Banner tone="info">Choisissez la marque et le modèle de l’article.</Banner> : null}
      <Button title={editing ? 'Enregistrer' : 'Ajouter à la vitrine'} onPress={() => save.mutate()} loading={save.isPending} disabled={!canSave} />
      {editing ? <Button title="Supprimer l’article" variant="danger" onPress={confirmRemove} loading={remove.isPending} /> : null}
    </Screen>
  );
}
