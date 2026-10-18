import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorBanner, Loading, Muted, Screen, Segmented, Select } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { fcfa, num, PERIODS, periodRange } from '../../src/lib/format';
import { colors } from '../../src/lib/theme';

const TYPES = [
  { value: 'sale', label: 'Ventes' },
  { value: 'purchase', label: 'Rachats' },
  { value: 'stock_in', label: 'Entrées' }
];

function Bar({ ratio }) {
  return (
    <View style={{ height: 6, backgroundColor: colors.blueSoft, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(2, ratio * 100)}%`, height: '100%', backgroundColor: colors.blue }} />
    </View>
  );
}

export default function Stats() {
  const { user, isOwner } = useAuth();
  const [type, setType] = useState('sale');
  const [period, setPeriod] = useState('month');
  const [shopId, setShopId] = useState('');
  const [open, setOpen] = useState(null);
  const range = periodRange(period);

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['stats', type, period, shopId],
    queryFn: () => api.get('/stats/summary', { type, from: range.from, to: range.to, shop_id: shopId || undefined })
  });

  const maxBrand = Math.max(1, ...(data?.by_brand ?? []).map((b) => b.amount || b.count));
  const shopOptions = [{ value: '', label: 'Tous les magasins' }, ...(user?.shops ?? []).map((s) => ({ value: s.id, label: s.name }))];

  return (
    <Screen refreshing={isFetching && !isLoading} onRefresh={refetch}>
      <Segmented value={type} options={TYPES} onChange={setType} />
      <Select label="Période" value={period} options={PERIODS} onChange={setPeriod} />
      {isOwner && (user?.shops?.length ?? 0) > 1 ? <Select label="Magasin" value={shopId} options={shopOptions} onChange={setShopId} /> : null}
      <ErrorBanner error={error} />
      {isLoading ? <Loading /> : null}
      {data ? (
        <>
          <Card style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Muted>Nombre total</Muted>
              <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink }}>{num(data.total_count)}</Text>
            </View>
            <View style={{ flex: 1.4 }}>
              <Muted>Recette totale</Muted>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.blue }} adjustsFontSizeToFit numberOfLines={1}>{fcfa(data.total_amount)}</Text>
            </View>
          </Card>

          {isOwner && !shopId && data.by_shop.length > 1 ? (
            <Card>
              <Muted>Par magasin</Muted>
              {data.by_shop.map((s) => (
                <View key={s.shop_id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{s.shop}</Text>
                  <Text style={{ color: colors.ink2 }}>{num(s.count)} · {fcfa(s.amount)}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          <Card>
            <Muted>Détail par marque et modèle (touchez une marque)</Muted>
            {data.by_brand.length === 0 ? <Muted>Aucune opération sur la période</Muted> : null}
            {data.by_brand.map((b) => {
              const models = data.by_model.filter((m) => m.brand === b.brand);
              const expanded = open === b.brand;
              return (
                <View key={b.brand} style={{ gap: 6 }}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : b.brand)} style={{ gap: 6, paddingVertical: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '700', color: colors.ink }}>{expanded ? '▾' : '▸'} {b.brand}</Text>
                      <Text style={{ fontWeight: '600', color: colors.ink }}>{num(b.count)} · {fcfa(b.amount)}</Text>
                    </View>
                    <Bar ratio={(b.amount || b.count) / maxBrand} />
                  </Pressable>
                  {expanded
                    ? models.map((m) => (
                        <View key={m.model} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 18 }}>
                          <Text style={{ color: colors.ink2 }}>{m.model}</Text>
                          <Text style={{ color: colors.ink2 }}>{num(m.count)} · {fcfa(m.amount)}</Text>
                        </View>
                      ))
                    : null}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
