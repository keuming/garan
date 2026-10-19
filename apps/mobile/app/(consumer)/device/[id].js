import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Card, ErrorBanner, Loading, Muted, Row, Screen, Title } from '../../../src/components/ui';
import { api } from '../../../src/lib/api';
import { date } from '../../../src/lib/format';
import { colors } from '../../../src/lib/theme';

export default function ConsumerDevice() {
  const { id } = useLocalSearchParams();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['consumer', 'devices'],
    queryFn: () => api.get('/consumer/devices')
  });
  const item = data?.items?.find((i) => i.registration_id === id);

  const release = useMutation({
    mutationFn: () => api.post(`/consumer/devices/${id}/release`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['consumer', 'devices'] });
      router.back();
    }
  });

  function confirmRelease() {
    Alert.alert(
      'Délier ce téléphone ?',
      'Vous confirmez avoir revendu ou cédé ce téléphone. Il sera détaché de votre compte et le nouveau propriétaire pourra l’enregistrer. Vous resterez visible comme ancien propriétaire.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Délier', style: 'destructive', onPress: () => release.mutate() }
      ]
    );
  }

  if (isLoading) return <Screen><Loading /></Screen>;
  if (error) return <Screen><ErrorBanner error={error} /></Screen>;
  if (!item) return <Screen><Banner tone="info" title="Introuvable">Ce téléphone n’est plus dans votre liste.</Banner></Screen>;

  const active = item.status === 'active';
  const reported = ['stolen', 'lost', 'blocked'].includes(item.device_status);

  return (
    <Screen refreshing={isFetching && !isLoading} onRefresh={refetch}>
      <Title>{item.brand ? `${item.brand} ${item.model ?? ''}`.trim() : 'Téléphone'}</Title>

      {reported ? (
        <Banner tone="danger" title="Téléphone signalé">
          Ce téléphone est signalé volé, perdu ou bloqué. Rapprochez-vous de la police avec votre reçu d’achat.
        </Banner>
      ) : active ? (
        <Banner tone="ok" title="Lié à votre compte">Ce téléphone est protégé et relié à votre compte.</Banner>
      ) : (
        <Banner tone="info" title="Délié">Vous avez détaché ce téléphone de votre compte le {date(item.released_at)}.</Banner>
      )}

      <Card>
        <Row label="IMEI 1" value={item.imei1} mono />
        {item.imei2 ? <Row label="IMEI 2" value={item.imei2} mono /> : null}
        <Row label="Lié depuis" value={date(item.acquired_at)} />
        {!active ? <Row label="Délié le" value={date(item.released_at)} /> : null}
      </Card>

      {(item.purchase_place || item.merchant_name || item.receipt_number) ? (
        <Card>
          <Muted>Preuve d’achat</Muted>
          {item.merchant_name ? <Row label="Marchand" value={item.merchant_name} /> : null}
          {item.purchase_place ? <Row label="Lieu d’achat" value={item.purchase_place} /> : null}
          {item.receipt_number ? <Row label="N° de reçu" value={item.receipt_number} /> : null}
          {(item.receipt_key || item.box_photo_key) ? (
            <Muted style={{ color: colors.ink3 }}>
              {item.receipt_key ? 'Reçu' : ''}{item.receipt_key && item.box_photo_key ? ' et ' : ''}{item.box_photo_key ? 'photo du carton' : ''} enregistré(s).
            </Muted>
          ) : null}
        </Card>
      ) : null}

      {active ? (
        <View style={{ gap: 8 }}>
          <ErrorBanner error={release.error} />
          <Button title="J’ai revendu ce téléphone (délier)" variant="danger" onPress={confirmRelease} loading={release.isPending} />
          <Muted>Déliez un téléphone uniquement après l’avoir vendu ou cédé. Cela permet au nouveau propriétaire de l’enregistrer à son tour.</Muted>
        </View>
      ) : null}
    </Screen>
  );
}
