import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Row, Screen, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { isValidImei } from '../../src/lib/imei';

const RESULT = {
  reported: { tone: 'danger', title: 'N’ACHETEZ PAS', msg: 'Ce téléphone est signalé volé, perdu ou bloqué. L’acheter vous expose à de graves ennuis.' },
  clean: { tone: 'ok', title: 'Aucun signalement', msg: 'Ce téléphone n’est pas signalé. Demandez tout de même le reçu d’achat au vendeur.' },
  unknown: { tone: 'info', title: 'Téléphone inconnu', msg: 'Ce téléphone n’est pas encore dans le registre gaRAN. Cela n’est pas une preuve qu’il est volé, mais demandez le reçu d’achat.' }
};

export default function ConsumerCheck() {
  const [imei, setImei] = useState('');
  const check = useMutation({ mutationFn: () => api.get(`/consumer/public/imei/${imei}`) });
  const r = check.data;
  const info = r ? RESULT[r.result] : null;

  return (
    <Screen>
      <Title sub="Avant d’acheter un téléphone d’occasion, vérifiez qu’il n’est pas signalé volé ou perdu.">Vérifier un IMEI</Title>
      <Card>
        <ImeiField value={imei} onChange={(v) => { setImei(v); check.reset(); }} />
        <Button title="Vérifier" onPress={() => check.mutate()} loading={check.isPending} disabled={!isValidImei(imei)} />
      </Card>
      <ErrorBanner error={check.error} />
      {info ? (
        <>
          <Banner tone={info.tone} title={info.title}>{info.msg}</Banner>
          {r.brand ? (
            <Card>
              <Row label="Modèle" value={`${r.brand} ${r.model ?? ''}`.trim()} />
              <Row label="IMEI" value={r.imei} mono />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
