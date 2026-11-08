import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Row, Screen, Select, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { isValidImei } from '../../src/lib/imei';
import { date, dateTime } from '../../src/lib/format';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

const DEVICE_TYPES = [
  { value: 'phone', label: 'Téléphone' },
  { value: 'computer', label: 'Ordinateur' },
  { value: 'tablet', label: 'Tablette' },
  { value: 'other', label: 'Autre appareil électronique' }
];

const OWNERSHIP = {
  none: 'Aucun propriétaire enregistré',
  person: 'Particulier',
  this_shop: 'Votre magasin',
  my_org: 'Votre organisation',
  other_shop: 'Une autre boutique'
};

export default function Check() {
  const [dtype, setDtype] = useState('phone');
  const [imei, setImei] = useState('');
  const [serial, setSerial] = useState('');
  const isPhone = dtype === 'phone';
  const identifier = isPhone ? imei : serial.trim();
  const ready = isPhone ? isValidImei(imei) : serial.trim().length >= 3;

  const check = useMutation({
    mutationFn: () => isPhone
      ? api.get(`/devices/check/${imei}`)
      : api.get('/devices/verify', { identifier: serial.trim() })
  });
  const r = check.data;
  const noun = isPhone ? 'téléphone' : 'appareil';

  return (
    <Screen>
      <Title sub="Avant d’acheter un appareil, vérifiez qu’il n’est pas signalé et qui en est le propriétaire.">Vérifier un appareil</Title>
      <Card>
        <Select label="Type d’appareil" value={dtype} options={DEVICE_TYPES} onChange={(v) => { setDtype(v); check.reset(); }} />
        {isPhone ? (
          <ImeiField value={imei} onChange={(v) => { setImei(v); check.reset(); }} />
        ) : (
          <Input
            label="Numéro de série"
            value={serial}
            onChangeText={(v) => { setSerial(v); check.reset(); }}
            autoCapitalize="characters"
            placeholder="N° de série de l’appareil"
          />
        )}
        <Button title="Vérifier" onPress={() => check.mutate()} loading={check.isPending} disabled={!ready} />
      </Card>
      <ErrorBanner error={check.error} />
      {r ? (
        <>
          <Banner tone={r.reported ? 'danger' : r.known ? 'ok' : 'info'} title={r.reported ? 'NE PAS ACHETER' : r.known ? 'Appareil enregistré' : 'Appareil inconnu'}>
            {r.message}
          </Banner>
          <Card>
            <Row label="Identifiant" value={identifier} mono />
            <Row label="Modèle" value={r.brand ? `${r.brand} ${r.model ?? ''}` : '—'} />
            <Row label="Détenteur" value={OWNERSHIP[r.ownership]} />
            <Row label="Rachat possible" value={r.can_buy ? 'Oui' : 'Non'} />
            <Row label="Vente possible" value={r.can_sell ? 'Oui' : 'Non'} />
          </Card>
          {r.garan ? (
            <Card>
              <Muted>gaRAN — acquéreur enregistré</Muted>
              {r.garan.acquirer ? (
                <>
                  <Row label="Nom et prénoms" value={r.garan.acquirer.full_name || '—'} />
                  <Row label="Téléphone" value={r.garan.acquirer.phone || '—'} />
                  {r.garan.acquirer.email ? <Row label="E-mail" value={r.garan.acquirer.email} /> : null}
                  {r.garan.acquirer.account_email ? <Row label="E-mail de l’appareil" value={r.garan.acquirer.account_email} /> : null}
                  <Row label="Date de linkage" value={r.garan.acquirer.acquired_at ? dateTime(r.garan.acquirer.acquired_at) : '—'} />
                  {r.garan.acquirer.purchase_place ? <Row label="Lieu d’achat" value={r.garan.acquirer.purchase_place} /> : null}
                  {r.garan.acquirer.purchase_price != null ? <Row label="Prix d’achat" value={`${nf(r.garan.acquirer.purchase_price)} FCFA`} /> : null}
                  {r.garan.acquirer.merchant_name ? <Row label="Marchand" value={r.garan.acquirer.merchant_name} /> : null}
                  {r.garan.acquirer.receipt_number ? <Row label="N° de reçu" value={r.garan.acquirer.receipt_number} /> : null}
                  <Row label="Certifié gaRAN" value={r.garan.certified ? 'Oui' : 'Abonnement expiré'} />
                  <Muted style={{ marginTop: 6 }}>Vérifiez que le vendeur correspond à cet acquéreur.</Muted>
                </>
              ) : (
                <Muted>{r.garan.message}</Muted>
              )}
            </Card>
          ) : null}
          {r.can_buy ? <Button title="Faire le rachat" variant="navy" onPress={() => router.replace({ pathname: '/operation', params: { type: 'purchase', dtype, ident: identifier } })} /> : null}
          {r.can_sell ? <Button title="Faire la vente" onPress={() => router.replace({ pathname: '/operation', params: { type: 'sale', dtype, ident: identifier } })} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
