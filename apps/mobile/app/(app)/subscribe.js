import { Stack, router } from 'expo-router';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Loading, Muted, Row, Screen, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { date } from '../../src/lib/format';
import { colors } from '../../src/lib/theme';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

/** Barre de progression de la mise en service. */
function Progress({ paid, total }) {
  const pct = Math.max(0, Math.min(100, Math.round((paid / total) * 100)));
  return (
    <View style={{ height: 10, backgroundColor: colors.line, borderRadius: 999, overflow: 'hidden', marginVertical: 8 }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.green, borderRadius: 999 }} />
    </View>
  );
}

export default function Subscribe() {
  const { data: setup, isLoading, isFetching, refetch } = useQuery({ queryKey: ['org', 'setup'], queryFn: () => api.get('/org/setup/plan') });
  const { data: plan } = useQuery({ queryKey: ['org', 'plan'], queryFn: () => api.get('/org/subscription/plan') });

  if (isLoading) return <Screen><Loading /></Screen>;

  return (
    <>
      <Stack.Screen options={{ title: 'Abonnement' }} />
      <Screen refreshing={isFetching && !isLoading} onRefresh={refetch}>
        <Title sub="Mise en service puis abonnement mensuel du compte marchand.">Abonnement marchand</Title>

        <Card>
          <Muted>Mise en service</Muted>
          {setup?.complete ? (
            <Row label="Statut" value={`Réglée (${nf(setup.setup_total_fcfa)} FCFA)`} />
          ) : (
            <>
              <Row label="Payé" value={`${nf(setup?.setup_paid_fcfa ?? 0)} / ${nf(setup?.setup_total_fcfa ?? 10000)} FCFA`} />
              <Progress paid={setup?.setup_paid_fcfa ?? 0} total={setup?.setup_total_fcfa ?? 10000} />
              <Muted style={{ color: colors.ink3 }}>
                {setup?.installments_paid ?? 0}/{setup?.installments_total ?? 4} versement(s) · reste {nf(setup?.remaining_fcfa ?? 10000)} FCFA
              </Muted>
              <Muted style={{ color: setup?.overdue ? colors.blood : colors.ink3, marginTop: 4 }}>
                {setup?.due_at
                  ? `À compléter avant le ${date(setup.due_at)} (30 jours).${setup?.overdue ? ' Délai dépassé — régularisez au plus vite.' : ''}`
                  : `Payable en ${setup?.installments_total ?? 4} versements de ${nf(setup?.installment_fcfa ?? 2500)} FCFA, sur 30 jours maximum.`}
              </Muted>
              <Button title={`Payer un versement (${nf(setup?.installment_fcfa ?? 2500)} FCFA)`} onPress={() => router.push('/subscribe-setup')} />
            </>
          )}
        </Card>

        <Card>
          <Muted>Abonnement mensuel</Muted>
          <Row label="Tarif" value={`${nf(plan?.month_fcfa ?? 1000)} FCFA / mois`} />
          <Muted style={{ color: colors.ink3, marginBottom: 6 }}>Sécurisation, archivage et sauvegarde des données. Payable plusieurs mois d’avance.</Muted>
          <Button title="Payer l’abonnement mensuel" onPress={() => router.push('/subscribe-month')} />
        </Card>
      </Screen>
    </>
  );
}
