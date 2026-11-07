import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Muted, Row, Screen, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { isValidImei } from '../../src/lib/imei';
import { date, dateTime } from '../../src/lib/format';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

const OWNERSHIP = {
  none: 'Aucun propriétaire enregistré',
  person: 'Particulier',
  this_shop: 'Votre magasin',
  my_org: 'Votre organisation',
  other_shop: 'Une autre boutique'
};

export default function Check() {
  const [imei, setImei] = useState('');
  const check = useMutation({ mutationFn: () => api.get(`/devices/check/${imei}`) });
  const r = check.data;

  return (
    <Screen>
      <Title sub="Avant d’acheter un téléphone, vérifiez qu’il n’est pas signalé et qui en est le propriétaire.">Vérifier un IMEI</Title>
      <Card>
        <ImeiField value={imei} onChange={(v) => { setImei(v); check.reset(); }} />
        <Button title="Vérifier" onPress={() => check.mutate()} loading={check.isPending} disabled={!isValidImei(imei)} />
      </Card>
      <ErrorBanner error={check.error} />
      {r ? (
        <>
          <Banner tone={r.reported ? 'danger' : r.known ? 'ok' : 'info'} title={r.reported ? 'NE PAS ACHETER' : r.known ? 'Téléphone enregistré' : 'Téléphone inconnu'}>
            {r.message}
          </Banner>
          <Card>
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
          {r.can_buy ? <Button title="Faire le rachat" variant="navy" onPress={() => router.replace({ pathname: '/operation', params: { type: 'purchase' } })} /> : null}
          {r.can_sell ? <Button title="Faire la vente" onPress={() => router.replace({ pathname: '/operation', params: { type: 'sale' } })} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
