import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BrandModelPicker } from '../../src/components/BrandModelPicker';
import { IdPhotoField } from '../../src/components/IdPhotoField';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Row, Screen, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { isValidImei } from '../../src/lib/imei';
import { colors } from '../../src/lib/theme';

export default function LinkPhone() {
  const { consumer } = useAuth();
  const qc = useQueryClient();
  const [imei, setImei] = useState('');
  const [imei2, setImei2] = useState('');
  const [device, setDevice] = useState({ brand_id: undefined, model_id: undefined, model_label: undefined });
  const [f, setF] = useState({ purchase_place: '', merchant_name: '', receipt_number: '', receipt_key: null, box_photo_key: null });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const check = useMutation({ mutationFn: () => api.get(`/consumer/devices/check/${imei}`) });
  const r = check.data;

  const register = useMutation({
    mutationFn: () =>
      api.post('/consumer/devices/register', {
        imei1: imei,
        imei2: imei2 && isValidImei(imei2) ? imei2 : undefined,
        brand_id: r?.known ? undefined : device.brand_id,
        model_id: r?.known ? undefined : device.model_id,
        model_label: r?.known ? undefined : device.model_label || undefined,
        purchase_place: f.purchase_place || undefined,
        merchant_name: f.merchant_name || undefined,
        receipt_number: f.receipt_number || undefined,
        receipt_key: f.receipt_key || undefined,
        box_photo_key: f.box_photo_key || undefined
      }),
    onSuccess: async ({ registration_id }) => {
      await qc.invalidateQueries({ queryKey: ['consumer', 'devices'] });
      router.replace(`/device/${registration_id}`);
    }
  });

  // Un téléphone inconnu du registre exige marque + modèle.
  const needDetails = r && !r.known;
  const detailsOk = !needDetails || (device.brand_id && (device.model_id || (device.model_label && device.model_label.trim())));
  const canSubmit = r?.can_register && detailsOk && !register.isPending;

  return (
    <Screen>
      <Title sub="Enregistrez votre téléphone pour le relier à votre compte. En cas de vol ou de perte, il sera signalé et introuvable à la revente.">
        Linker mon téléphone
      </Title>

      <Card>
        <ImeiField value={imei} onChange={(v) => { setImei(v); check.reset(); register.reset(); }} />
        <Button title="Vérifier l’IMEI" onPress={() => check.mutate()} loading={check.isPending} disabled={!isValidImei(imei)} />
        <Muted>Composez *#06# sur le téléphone à enregistrer, ou scannez le code-barres de la boîte.</Muted>
      </Card>

      <ErrorBanner error={check.error} />

      {r ? (
        <Banner
          tone={r.reported ? 'danger' : r.can_register ? 'ok' : 'warn'}
          title={r.reported ? 'Téléphone signalé' : r.mine_already ? 'Déjà à votre compte' : r.held_by_other ? 'Déjà enregistré' : 'Prêt à enregistrer'}
        >
          {r.message}
        </Banner>
      ) : null}

      {r?.can_register ? (
        <>
          {r.known ? (
            <Card>
              <Row label="Modèle" value={r.brand ? `${r.brand} ${r.model ?? ''}`.trim() : '—'} />
            </Card>
          ) : (
            <Card>
              <Muted>Ce téléphone n’est pas encore dans le registre. Indiquez sa marque et son modèle.</Muted>
              <BrandModelPicker value={device} onChange={setDevice} />
            </Card>
          )}

          <Card>
            <Muted>Second IMEI (double SIM, facultatif)</Muted>
            <ImeiField label="IMEI 2" value={imei2} onChange={setImei2} optional />
          </Card>

          <Card>
            <Muted>Le propriétaire, c’est vous</Muted>
            <Row label="Nom et prénoms" value={consumer?.full_name ?? '—'} />
            <Row label="Contact" value={consumer?.phone ?? '—'} />
            {consumer?.email ? <Row label="E-mail" value={consumer.email} /> : null}
            <Muted style={{ color: colors.ink3 }}>Ces informations proviennent de votre compte. Modifiez-les depuis « Mon compte ».</Muted>
          </Card>

          <Card>
            <Muted>Preuve d’achat (recommandé)</Muted>
            <Input label="Lieu d’achat du téléphone" value={f.purchase_place} onChangeText={set('purchase_place')} placeholder="Ex. Marché d’Adjamé, Abidjan" />
            <Input label="Nom du marchand" value={f.merchant_name} onChangeText={set('merchant_name')} placeholder="Nom de la boutique" />
            <Input label="Numéro du reçu d’achat" value={f.receipt_number} onChangeText={set('receipt_number')} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <IdPhotoField label="Photo du reçu" uploadedKey={f.receipt_key} onUploaded={set('receipt_key')} uploader={api.uploadConsumerDoc} aspectRatio={0.75} />
              <IdPhotoField label="Photo du carton" uploadedKey={f.box_photo_key} onUploaded={set('box_photo_key')} uploader={api.uploadConsumerDoc} aspectRatio={0.75} />
            </View>
          </Card>

          <ErrorBanner error={register.error} />
          <Button title="Lier ce téléphone à mon compte" onPress={() => register.mutate()} loading={register.isPending} disabled={!canSubmit} />
        </>
      ) : null}
    </Screen>
  );
}
