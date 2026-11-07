import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Muted, Row, Screen, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { isValidImei } from '../../src/lib/imei';
import { date, dateTime } from '../../src/lib/format';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

function banner(r) {
  if (r.reported) return { tone: 'danger', title: 'N’ACHETEZ PAS' };
  if (r.status === 'registered') return r.certified
    ? { tone: 'ok', title: 'Certifié gaRAN' }
    : { tone: 'info', title: 'Enregistré (abonnement expiré)' };
  if (r.status === 'known') return { tone: 'info', title: 'Connu, non certifié' };
  return { tone: 'warn', title: 'Jamais enregistré' };
}

export default function ConsumerCheck() {
  const [imei, setImei] = useState('');
  const check = useMutation({ mutationFn: () => api.get(`/consumer/imei/${imei}`) });
  const r = check.data;
  const b = r ? banner(r) : null;
  const a = r?.acquirer;

  return (
    <Screen>
      <Title sub="Vérifiez qu'un téléphone est bien enregistré sur gaRAN et à qui il appartient avant de l'acheter.">Vérifier un IMEI</Title>
      <Card>
        <ImeiField value={imei} onChange={(v) => { setImei(v); check.reset(); }} />
        <Button title="Vérifier" onPress={() => check.mutate()} loading={check.isPending} disabled={!isValidImei(imei)} />
      </Card>
      <ErrorBanner error={check.error} />
      {r ? (
        <>
          <Banner tone={b.tone} title={b.title}>{r.message}</Banner>

          {r.device?.brand ? (
            <Card>
              <Row label="Appareil" value={`${r.device.brand} ${r.device.model ?? ''}`.trim()} />
              {r.device.imei1 ? <Row label="IMEI" value={r.device.imei1} mono /> : null}
            </Card>
          ) : null}

          {a ? (
            <Card>
              <Muted>Acquéreur enregistré</Muted>
              <Row label="Nom et prénoms" value={a.full_name || '—'} />
              <Row label="Téléphone" value={a.phone || '—'} />
              {a.email ? <Row label="E-mail" value={a.email} /> : null}
              {a.account_email ? <Row label="E-mail de l’appareil" value={a.account_email} /> : null}
              <Row label="Date de linkage" value={a.acquired_at ? dateTime(a.acquired_at) : '—'} />
              {a.purchase_place ? <Row label="Lieu d’achat" value={a.purchase_place} /> : null}
              {a.purchase_price != null ? <Row label="Prix d’achat" value={`${nf(a.purchase_price)} FCFA`} /> : null}
              {a.merchant_name ? <Row label="Marchand" value={a.merchant_name} /> : null}
              {a.receipt_number ? <Row label="N° de reçu" value={a.receipt_number} /> : null}
              <Row label="Abonnement" value={a.subscription_expires_at && new Date(a.subscription_expires_at) > new Date() ? `Actif jusqu’au ${date(a.subscription_expires_at)}` : 'Expiré'} />
              <Muted style={{ marginTop: 6 }}>Vérifiez que le vendeur correspond bien à cet acquéreur. Sinon, soyez prudent.</Muted>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
