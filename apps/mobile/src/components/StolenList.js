import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Banner, Card, Input, Loading, Muted, Screen } from './ui';
import { api } from '../lib/api';
import { date } from '../lib/format';
import { colors, radius } from '../lib/theme';

function StolenCard({ item }) {
  const lost = item.kind === 'lost';
  return (
    <Card style={{ borderLeftWidth: 5, borderLeftColor: lost ? colors.warn : colors.blood, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={st.model} numberOfLines={1}>{item.brand ? `${item.brand} ${item.model ?? ''}`.trim() : 'Téléphone'}</Text>
        <Text style={[st.tag, { backgroundColor: lost ? colors.warnBg : colors.bloodBg, color: lost ? colors.warn : colors.blood }]}>
          {lost ? 'PERDU' : 'VOL'}
        </Text>
      </View>
      <Text style={st.imei}>IMEI {item.imei1}</Text>
      {item.imei2 ? <Text style={st.imei}>IMEI 2 {item.imei2}</Text> : null}
      {item.reported_at ? <Muted>Signalé le {date(item.reported_at)}</Muted> : null}
    </Card>
  );
}

/** Registre partagé des téléphones signalés volés ou perdus — visible par tous les utilisateurs gaRAN. */
export function StolenList() {
  const [q, setQ] = useState('');
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['stolen', q],
    queryFn: () => api.get('/public/stolen-devices', q ? { q } : undefined)
  });
  const items = data?.items ?? [];

  return (
    <Screen refreshing={isFetching && !isLoading} onRefresh={refetch}>
      <View style={st.hero}>
        <Text style={st.heroTitle}>⚠ TÉLÉPHONES VOLÉS</Text>
        <Text style={st.heroSub}>Registre réseau gaRAN — n’achetez jamais un téléphone figurant ici.</Text>
      </View>

      <Card>
        <Input label="Rechercher un IMEI" value={q} onChangeText={(t) => setQ(t.replace(/\D/g, '').slice(0, 15))} keyboardType="number-pad" placeholder="15 chiffres" />
      </Card>

      {isLoading ? <Loading /> : null}
      {!isLoading && items.length === 0 ? (
        <Banner tone="ok" title="Aucun téléphone signalé">{q ? 'Cet IMEI n’est pas dans la liste des volés.' : 'Aucun vol enregistré pour le moment.'}</Banner>
      ) : null}
      {items.map((it, i) => <StolenCard key={`${it.imei1}-${i}`} item={it} />)}
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: colors.blood, borderRadius: radius.lg, padding: 18, gap: 4 },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 0.5 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  model: { fontSize: 15.5, fontWeight: '700', color: colors.ink, flex: 1 },
  imei: { fontFamily: 'monospace', fontSize: 13.5, color: colors.ink2, letterSpacing: 1 },
  tag: { fontSize: 12, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }
});
