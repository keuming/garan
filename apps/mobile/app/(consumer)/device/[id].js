import { useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import QRCode from 'qrcode';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Banner, Button, Card, ErrorBanner, Loading, Muted, Row, Screen, Title } from '../../../src/components/ui';
import { api } from '../../../src/lib/api';
import { useAuth } from '../../../src/lib/auth';
import { date } from '../../../src/lib/format';
import { colors } from '../../../src/lib/theme';
import { certificateHtml, certifiedReceiptHtml } from '../../../src/lib/certificate';

const WEB_URL = (Constants.expoConfig?.extra?.publicWebUrl || 'https://garan.orzayah.com').replace(/\/$/, '');

export default function ConsumerDevice() {
  const { id } = useLocalSearchParams();
  const qc = useQueryClient();
  const { consumer } = useAuth();
  const [docBusy, setDocBusy] = useState(null); // 'cert' | 'receipt' | null
  const [docError, setDocError] = useState(null);
  const paid = Boolean(consumer?.subscription_expires_at && new Date(consumer.subscription_expires_at) > new Date());
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

  const theft = useMutation({
    mutationFn: (kind) => api.post(`/consumer/devices/${id}/report-theft`, { kind }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['consumer', 'devices'] });
      await qc.invalidateQueries({ queryKey: ['stolen'] });
    }
  });

  function confirmTheft() {
    Alert.alert(
      'Déclarer ce téléphone',
      'Il sera signalé sur tout le réseau gaRAN et deviendra invendable. Rapprochez-vous ensuite de la police avec votre reçu.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Perdu', onPress: () => theft.mutate('lost') },
        { text: 'Volé', style: 'destructive', onPress: () => theft.mutate('stolen') }
      ]
    );
  }

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

  /** Génère et partage un document certifié gaRAN (certificat de sécurité ou reçu d'achat). */
  async function generateDoc(kind) {
    if (!item) return;
    setDocBusy(kind);
    setDocError(null);
    try {
      const verifyUrl = `${WEB_URL}/verifier?imei=${encodeURIComponent(item.imei1)}`;
      const qrSvg = await QRCode.toString(verifyUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).catch(() => '');
      const owner = { full_name: consumer?.full_name, phone: consumer?.phone, email: consumer?.email };
      const device = { ...item, acquired_at_fmt: date(item.acquired_at) };
      const html = kind === 'cert' ? certificateHtml({ owner, device, qrSvg }) : certifiedReceiptHtml({ owner, device, qrSvg });
      const title = kind === 'cert' ? 'Certificat de sécurité gaRAN' : 'Reçu d’achat certifié gaRAN';
      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e) {
      setDocError(e);
    } finally {
      setDocBusy(null);
    }
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

      {reported ? (
        <Card>
          <Muted>Localiser mon téléphone</Muted>
          <Muted style={{ color: colors.ink3, marginBottom: 10 }}>
            gaRAN rend l’appareil invendable sur le réseau, mais ne le géolocalise pas. Pour tenter de le localiser, utilisez le service de votre compte, connecté avec le compte Google ou Apple du téléphone :
          </Muted>
          <View style={{ gap: 8 }}>
            <Button title="Localiser (Android · Google)" variant="secondary" onPress={() => Linking.openURL('https://www.google.com/android/find')} />
            <Button title="Localiser (iPhone · iCloud)" variant="secondary" onPress={() => Linking.openURL('https://www.icloud.com/find')} />
          </View>
          <Muted style={{ color: colors.ink3, marginTop: 10 }}>
            Ne tentez jamais de récupérer l’appareil vous-même : transmettez la position à la police avec votre reçu d’achat.
          </Muted>
        </Card>
      ) : null}

      <Card>
        <Row label="Marque" value={item.brand ?? '—'} />
        <Row label="Modèle" value={item.model ?? '—'} />
        <Row label="IMEI 1" value={item.imei1} mono />
        {item.imei2 ? <Row label="IMEI 2" value={item.imei2} mono /> : null}
        {item.account_email ? <Row label="E-mail de l’appareil" value={item.account_email} /> : null}
        {item.color ? <Row label="Couleur" value={item.color} /> : null}
        {item.storage_gb ? <Row label="Stockage" value={`${item.storage_gb} Go`} /> : null}
        <Row label="Statut" value={reported ? (item.device_status === 'lost' ? 'Perdu' : 'Volé') : active ? 'Lié à votre compte' : 'Délié'} />
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
        <Card>
          <Muted>Mes documents gaRAN</Muted>
          {paid ? (
            <>
              <Muted style={{ color: colors.ink3, marginBottom: 8 }}>
                Générez et partagez votre certificat de sécurité et votre reçu d’achat certifiés (PDF, avec QR code de vérification).
              </Muted>
              <ErrorBanner error={docError} />
              <View style={{ gap: 8 }}>
                <Button title="📄 Certificat de sécurité gaRAN" onPress={() => generateDoc('cert')} loading={docBusy === 'cert'} />
                <Button title="🧾 Reçu d’achat certifié" variant="secondary" onPress={() => generateDoc('receipt')} loading={docBusy === 'receipt'} />
              </View>
            </>
          ) : (
            <>
              <Muted style={{ color: colors.ink3, marginBottom: 8 }}>
                Les documents certifiés gaRAN sont réservés aux appareils dont l’abonnement est actif.
              </Muted>
              <Button title="Activer mon abonnement" onPress={() => router.push('/subscribe')} />
            </>
          )}
        </Card>
      ) : null}

      {active ? (
        <View style={{ gap: 8 }}>
          <ErrorBanner error={theft.error} />
          <Button title="🚨 Déclarer volé / perdu" variant="danger" onPress={confirmTheft} loading={theft.isPending} />
          <ErrorBanner error={release.error} />
          <Button title="J’ai revendu ce téléphone (délier)" variant="secondary" onPress={confirmRelease} loading={release.isPending} />
          <Muted>Déclarez un vol dès que possible : le téléphone devient invendable sur le réseau. Déliez uniquement après une vente ou une cession volontaire.</Muted>
        </View>
      ) : null}
    </Screen>
  );
}
