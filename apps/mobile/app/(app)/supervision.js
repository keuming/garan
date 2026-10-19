import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorBanner, Loading, Muted, Screen, Segmented } from '../../src/components/ui';
import { useState } from 'react';
import { api } from '../../src/lib/api';
import { date, fcfa, num, PERIODS, periodRange } from '../../src/lib/format';
import { colors } from '../../src/lib/theme';

export default function Supervision() {
  const [period, setPeriod] = useState('month');
  const range = periodRange(period);
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['overview', period],
    queryFn: () => api.get('/org/overview', { from: range.from, to: range.to })
  });
  return (
    <Screen refreshing={isFetching && !isLoading} onRefresh={refetch}>
      <Segmented value={period} options={PERIODS} onChange={setPeriod} />
      <ErrorBanner error={error} />
      {isLoading ? <Loading /> : null}
      {data ? (
        <>
          <Card style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Muted>Ventes réseau</Muted>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{num(data.sale.count)}</Text>
              <Muted>{fcfa(data.sale.amount)}</Muted>
            </View>
            <View style={{ flex: 1 }}>
              <Muted>Rachats réseau</Muted>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{num(data.purchase.count)}</Text>
              <Muted>{fcfa(data.purchase.amount)}</Muted>
            </View>
          </Card>
          <Card>
            <Muted>Sous-marchands ({data.children.length})</Muted>
            {data.children.length === 0 ? <Muted>Aucun sous-marchand. Ajoutez-les depuis le back-office.</Muted> : null}
            {data.children.map((c) => (
              <View key={c.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: colors.ink, flexShrink: 1 }}>{c.name}</Text>
                  <Text style={{ color: c.status === 'active' ? colors.ok : colors.ink3, fontWeight: '600' }}>
                    {c.status === 'active' ? 'Actif' : c.status}
                  </Text>
                </View>
                <Muted>{c.city}, {c.district} · abonnement jusqu’au {date(c.subscription_expires_at)}</Muted>
                <Text style={{ color: colors.ink2, marginTop: 2 }}>{num(c.sales_count)} vente(s) · {fcfa(c.sales_amount)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
