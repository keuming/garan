import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { LABELS, PERIODS, fcfa, num, periodRange } from '../lib/format';
import { radius, shadow } from '../lib/theme';

const BLACK = '#0A0A0A';
const RED = '#FF4D4D';
const SOFT = 'rgba(255,255,255,0.72)';
const LINE = 'rgba(255,255,255,0.14)';
const CONDITIONS = ['new', 'like_new', 'used'];

function Amount({ value, size = 18 }) {
  return (
    <Text style={{ color: RED, fontWeight: '800', fontSize: size }} numberOfLines={1} adjustsFontSizeToFit>
      {fcfa(value)}
    </Text>
  );
}

/** Soldes (digital, espèces, total) et ventes par état du téléphone, sur la période choisie. */
export function BalanceCard() {
  const [period, setPeriod] = useState('today');
  const q = useQuery({
    queryKey: ['balance', period],
    queryFn: () => {
      const r = periodRange(period);
      const params = {};
      if (r.from) params.from = r.from;
      if (r.to) params.to = r.to;
      return api.get('/stats/balance', params);
    }
  });
  const d = q.data;
  const label = PERIODS.find((p) => p.value === period)?.label ?? '';

  return (
    <View style={st.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
        {PERIODS.map((p) => {
          const on = p.value === period;
          return (
            <Pressable
              key={p.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setPeriod(p.value)}
              style={[st.chip, on && st.chipOn]}
            >
              <Text style={[st.chipText, on && st.chipTextOn]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {q.isError ? <Text style={st.soft}>Soldes indisponibles. Tirez l’écran vers le bas pour réessayer.</Text> : null}

      <View style={{ gap: 2 }}>
        <Text style={st.label}>Solde total</Text>
        <Amount value={d?.balances?.total} size={30} />
      </View>

      <View style={st.two}>
        <View style={st.half}>
          <Text style={st.label}>Solde digital</Text>
          <Amount value={d?.balances?.digital} />
        </View>
        <View style={st.half}>
          <Text style={st.label}>Solde espèces</Text>
          <Amount value={d?.balances?.cash} />
        </View>
      </View>
      <Text style={st.hint}>Espèces : ventes en espèces moins rachats. Digital : ventes payées par ORZAYAH.</Text>

      <View style={st.rule} />

      <Text style={st.section}>Ventes · {label}</Text>
      {CONDITIONS.map((c) => {
        const row = d?.sales?.by_condition?.[c];
        return (
          <View key={c} style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.rowTitle}>{LABELS.condition[c]}</Text>
              <Text style={st.soft}>{num(row?.count)} {Number(row?.count) > 1 ? 'ventes' : 'vente'}</Text>
            </View>
            <Amount value={row?.amount} />
          </View>
        );
      })}
      <View style={[st.row, st.rowTotal]}>
        <View style={{ flex: 1 }}>
          <Text style={st.rowTitle}>Rachats</Text>
          <Text style={st.soft}>{num(d?.purchases?.count)} {Number(d?.purchases?.count) > 1 ? 'rachats' : 'rachat'}</Text>
        </View>
        <Amount value={d?.purchases?.amount} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: BLACK, borderRadius: radius.lg, padding: 16, gap: 14, ...shadow.card },
  chips: { gap: 8, paddingRight: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: RED, borderColor: RED },
  chipText: { color: SOFT, fontSize: 12.5, fontWeight: '700' },
  chipTextOn: { color: BLACK },
  label: { color: SOFT, fontSize: 12, fontWeight: '600' },
  two: { flexDirection: 'row', gap: 16 },
  half: { flex: 1, gap: 2 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  rule: { height: 1, backgroundColor: LINE },
  section: { color: '#fff', fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTotal: { borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12 },
  rowTitle: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  soft: { color: SOFT, fontSize: 12 }
});
