import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorBanner, Input, Loading, Muted, Segmented } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { dateTime, fcfa, LABELS } from '../../src/lib/format';
import { colors, radius } from '../../src/lib/theme';

const TYPES = [
  { value: '', label: 'Tout' },
  { value: 'sale', label: 'Ventes' },
  { value: 'purchase', label: 'Rachats' },
  { value: 'stock_in', label: 'Stock' }
];
const TONE = { sale: colors.blue, purchase: colors.navy, stock_in: colors.cyan };

export default function History() {
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');

  const query = useInfiniteQuery({
    queryKey: ['transactions', type, search],
    queryFn: ({ pageParam }) => api.get('/transactions', { type, q: search, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined)
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        onRefresh={() => query.refetch()}
        refreshing={query.isRefetching}
        onEndReachedThreshold={0.4}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 6 }}>
            <Segmented value={type} options={TYPES} onChange={setType} />
            <Input
              placeholder="IMEI, n° de reçu ou nom du client"
              value={q}
              onChangeText={setQ}
              returnKeyType="search"
              onSubmitEditing={() => setSearch(q.trim())}
              right={<Button title="OK" variant="secondary" onPress={() => setSearch(q.trim())} style={{ minHeight: 50 }} />}
            />
            <ErrorBanner error={query.error} />
            {query.data ? <Muted>{total} opération{total > 1 ? 's' : ''}</Muted> : null}
          </View>
        }
        renderItem={({ item: t }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/receipt/${t.id}`)}
            style={({ pressed }) => [{ backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 4, borderLeftWidth: 4, borderLeftColor: TONE[t.type] }, pressed && { opacity: 0.8 }]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontWeight: '700', color: colors.ink, flexShrink: 1 }}>{t.device.brand} {t.device.model}</Text>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{fcfa(t.price)}</Text>
            </View>
            <Muted>{LABELS.txType[t.type]} · {dateTime(t.occurred_at)} · {t.shop.name}</Muted>
            <Muted>IMEI {t.device.imei1}{t.person ? ` · ${t.person.full_name}` : ''}</Muted>
          </Pressable>
        )}
        ListEmptyComponent={query.isLoading ? <Loading /> : <Muted style={{ textAlign: 'center', padding: 24 }}>Aucune opération</Muted>}
        ListFooterComponent={query.isFetchingNextPage ? <Loading /> : null}
      />
    </SafeAreaView>
  );
}
