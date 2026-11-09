import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BrandModelPicker } from '../../src/components/BrandModelPicker';
import { IdPhotoField } from '../../src/components/IdPhotoField';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Row, Screen, Select, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { isValidImei } from '../../src/lib/imei';
import { colors } from '../../src/lib/theme';

const DEVICE_TYPES = [
  { value: 'phone', label: 'Téléphone' },
  { value: 'computer', label: 'Ordinateur' },
  { value: 'tablet', label: 'Tablette' },
  { value: 'other', label: 'Autre appareil électronique' }
];

export default function LinkDevice() {
  const { consumer } = useAuth();
  const qc = useQueryClient();
  const [deviceType, setDeviceType] = useState('phone');
  const isPhone = deviceType === 'phone';
  const [imei, setImei] = useState('');
  const [imei2, setImei2] = useState('');
  const [serial, setSerial] = useState('');
  const [device, setDevice] = useState({ brand_id: undefined, model_id: undefined, model_label: undefined });
  const [freeDevice, setFreeDevice] = useState({ brand_label: '', model_label: '' });
  const [f, setF] = useState({ account_email: '', purchase_place: '', purchase_price: '', merchant_name: '', receipt_number: '', receipt_key: null, box_photo_key: null });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const idReady = isPhone ? isValidImei(imei) : serial.trim().length >= 3;

  const check = useMutation({
    mutationFn: () =>
      isPhone
        ? api.get(`/consumer/devices/check/${imei}`)
        : api.get('/consumer/devices/check', { identifier: serial.trim(), device_type: deviceType })
  });
  const r = check.data;

  function resetCheck() {
    check.reset();
    register.reset();
  }

  const register = useMutation({
    mutationFn: () =>
      api.post('/consumer/devices/register', {
        device_type: deviceType,
        imei1: isPhone ? imei : undefined,
        imei2: isPhone && imei2 && isValidImei(imei2) ? imei2 : undefined,
        serial_number: isPhone ? undefined : serial.trim(),
        brand_id: r?.known ? undefined : isPhone ? device.brand_id : undefined,
        brand_label: r?.known ? undefined : isPhone ? undefined : freeDevice.brand_label.trim() || undefined,
        model_id: r?.known ? undefined : isPhone ? device.model_id : undefined,
        model_label: r?.known ? undefined : isPhone ? device.model_label || undefined : freeDevice.model_label.trim() || undefined,
        account_email: f.account_email || undefined,
        purchase_place: f.purchase_place || undefined,
        purchase_price: f.purchase_price ? Number(f.purchase_price) : undefined,
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

  // Un appareil inconnu du registre exige marque + modèle.
  const needDetails = r && !r.known;
  const detailsOk = !needDetails
    ? true
    : isPhone
      ? device.brand_id && (device.model_id || (device.model_label && device.model_label.trim()))
      : freeDevice.brand_label.trim() && freeDevice.model_label.trim();
  const canSubmit = r?.can_register && detailsOk && !register.isPending;

  const ceNoun = isPhone ? 'ce téléphone' : 'cet appareil';

  return (
    <Screen>
      <Title sub="Enregistrez votre appareil pour le relier à votre compte. En cas de vol ou de perte, il sera signalé et introuvable à la revente.">
        Lier un appareil
      </Title>

      <Card>
        <Select
          label="Type d’appareil"
          value={deviceType}
          options={DEVICE_TYPES}
          onChange={(v) => { setDeviceType(v); setImei(''); setImei2(''); setSerial(''); resetCheck(); }}
        />
        {isPhone ? (
          <>
            <ImeiField value={imei} onChange={(v) => { setImei(v); resetCheck(); }} />
            <Button title="Vérifier l’IMEI" onPress={() => check.mutate()} loading={check.isPending} disabled={!idReady} />
            <Muted>Composez *#06# sur le téléphone à enregistrer, ou scannez le code-barres de la boîte.</Muted>
          </>
        ) : (
          <>
            <Input
              label="Numéro de série"
              value={serial}
              onChangeText={(v) => { setSerial(v); resetCheck(); }}
              autoCapitalize="characters"
              placeholder="N° de série de l’appareil"
            />
            <Button title="Vérifier le numéro de série" onPress={() => check.mutate()} loading={check.isPending} disabled={!idReady} />
            <Muted>Le numéro de série figure sous l’appareil, dans ses réglages, ou sur son emballage d’origine.</Muted>
          </>
        )}
      </Card>

      <ErrorBanner error={check.error} />

      {r ? (
        <Banner
          tone={r.reported ? 'danger' : r.can_register ? 'ok' : 'warn'}
          title={r.reported ? 'Appareil signalé' : r.mine_already ? 'Déjà à votre compte' : r.held_by_other ? 'Déjà enregistré' : 'Prêt à enregistrer'}
        >
          {r.message}
        </Banner>
      ) : null}

      {r?.can_register ? (
        <>
          {r.known ? (
            <Card>
              <Row label="Appareil" value={r.brand ? `${r.brand} ${r.model ?? ''}`.trim() : '—'} />
            </Card>
          ) : (
            <Card>
              <Muted>Cet appareil n’est pas encore dans le registre. Indiquez sa marque et son modèle.</Muted>
              {isPhone ? (
                <BrandModelPicker value={device} onChange={setDevice} />
              ) : (
                <>
                  <Input label="Marque" value={freeDevice.brand_label} onChangeText={(v) => setFreeDevice((p) => ({ ...p, brand_label: v }))} placeholder="Ex. HP, Apple, Lenovo…" />
                  <Input label="Modèle" value={freeDevice.model_label} onChangeText={(v) => setFreeDevice((p) => ({ ...p, model_label: v }))} placeholder="Ex. ProBook 450, MacBook Air M2…" />
                </>
              )}
            </Card>
          )}

          {isPhone ? (
            <Card>
              <Muted>Second IMEI (double SIM, facultatif)</Muted>
              <ImeiField label="IMEI 2" value={imei2} onChange={setImei2} optional />
            </Card>
          ) : null}

          <Card>
            <Muted>Le propriétaire, c’est vous</Muted>
            <Row label="Nom et prénoms" value={consumer?.full_name ?? '—'} />
            <Row label="Contact" value={consumer?.phone ?? '—'} />
            {consumer?.email ? <Row label="E-mail" value={consumer.email} /> : null}
            <Muted style={{ color: colors.ink3 }}>Ces informations proviennent de votre compte. Modifiez-les depuis « Mon compte ».</Muted>
          </Card>

          <Card>
            <Muted>Compte enregistré sur cet appareil</Muted>
            <Input
              label="E-mail du compte de l’appareil (Gmail sur Android, iCloud sur iOS, compte Microsoft/Apple sur ordinateur)"
              value={f.account_email}
              onChangeText={set('account_email')}
              placeholder="ex. prenom.nom@gmail.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Muted style={{ color: colors.ink3 }}>Cet e-mail figurera sur votre certificat de sécurité et aide à prouver la propriété de l’appareil.</Muted>
          </Card>

          <Card>
            <Muted>Preuve d’achat (recommandé)</Muted>
            <Input label={`Lieu d’achat de l’appareil`} value={f.purchase_place} onChangeText={set('purchase_place')} placeholder="Ex. Marché d’Adjamé, Abidjan" />
            <Input label="Prix d’achat (FCFA)" value={f.purchase_price} onChangeText={(t) => set('purchase_price')(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Ex. 85000" />
            <Input label="Nom du marchand" value={f.merchant_name} onChangeText={set('merchant_name')} placeholder="Nom de la boutique" />
            <Input label="Numéro du reçu d’achat" value={f.receipt_number} onChangeText={set('receipt_number')} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <IdPhotoField label="Photo du reçu" uploadedKey={f.receipt_key} onUploaded={set('receipt_key')} uploader={api.uploadConsumerDoc} aspectRatio={0.75} />
              <IdPhotoField label="Photo du carton" uploadedKey={f.box_photo_key} onUploaded={set('box_photo_key')} uploader={api.uploadConsumerDoc} aspectRatio={0.75} />
            </View>
          </Card>

          <ErrorBanner error={register.error} />
          <Button title={`Lier ${ceNoun} à mon compte`} onPress={() => register.mutate()} loading={register.isPending} disabled={!canSubmit} />
        </>
      ) : null}
    </Screen>
  );
}
