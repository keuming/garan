import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Screen, Segmented, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { isValidImei } from '../../src/lib/imei';
import { FindMyPhone } from '../../src/components/FindMyPhone';

export default function ReportTheft() {
  const qc = useQueryClient();
  const [imei, setImei] = useState('');
  const [kind, setKind] = useState('stolen');
  const [police, setPolice] = useState('');
  const [desc, setDesc] = useState('');

  const report = useMutation({
    mutationFn: () => api.post('/report-theft', { imei, kind, police_report_number: police || undefined, description: desc || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stolen'] })
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Déclarer un vol' }} />
      <Title sub="Signalez un téléphone volé ou perdu. S’il est dans votre stock, le signalement est immédiat sur tout le réseau gaRAN ; sinon il est vérifié par l’équipe.">
        Déclarer un vol
      </Title>

      {report.data ? (
        <>
          <Banner tone={report.data.status === 'confirmed' ? 'danger' : 'info'} title={report.data.status === 'confirmed' ? 'Signalé sur le réseau' : 'Déclaration reçue'}>
            {report.data.message}
          </Banner>
          <Button title="Voir les téléphones volés" onPress={() => router.replace('/stolen')} />
          <Button title="Nouvelle déclaration" variant="secondary" onPress={() => report.reset()} />
          <FindMyPhone mode="theft" />
        </>
      ) : (
        <>
          <Card>
            <ImeiField label="IMEI du téléphone" value={imei} onChange={setImei} />
            <Muted>Type de signalement</Muted>
            <Segmented value={kind} onChange={setKind} options={[{ value: 'stolen', label: 'Vol' }, { value: 'lost', label: 'Perte' }]} />
            <Input label="N° de plainte / main courante (facultatif)" value={police} onChangeText={setPolice} />
            <Input label="Description (facultatif)" value={desc} onChangeText={setDesc} placeholder="Circonstances du vol…" multiline />
          </Card>
          <ErrorBanner error={report.error} />
          <Button title="Déclarer" variant="danger" onPress={() => report.mutate()} loading={report.isPending} disabled={!isValidImei(imei)} />
          <FindMyPhone mode="theft" />
        </>
      )}
    </Screen>
  );
}
