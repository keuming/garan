import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Banner, Card, Loading, Muted, Screen, Wordmark } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { date } from '../../src/lib/format';
import { colors, radius } from '../../src/lib/theme';

function Tile({ title, sub, onPress, tone = 'blue' }) {
  const bg = { blue: colors.blue, navy: colors.navy, white: '#fff' }[tone];
  const fg = tone === 'white' ? colors.ink : '#fff';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [st.tile, { backgroundColor: bg, borderColor: tone === 'white' ? colors.line : bg }, pressed && { opacity: 0.85 }]}>
      <Text style={[st.tileTitle, { color: fg }]}>{title}</Text>
      {sub ? <Text style={{ color: tone === 'white' ? colors.ink2 : 'rgba(255,255,255,0.85)', fontSize: 13 }}>{sub}</Text> : null}
    </Pressable>
  );
}

function PhoneCard({ item }) {
  const active = item.status === 'active';
  const reported = ['stolen', 'lost', 'blocked'].includes(item.device_status);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/device/${item.registration_id}`)}
      style={({ pressed }) => [pressed && { opacity: 0.9 }]}
    >
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 }}>
            {item.brand ? `${item.brand} ${item.model ?? ''}`.trim() : 'Téléphone'}
          </Text>
          <Text style={{ fontWeight: '700', color: reported ? colors.danger : active ? colors.ok : colors.ink3 }}>
            {reported ? 'Signalé' : active ? 'Lié' : 'Délié'}
          </Text>
        </View>
        <Muted>IMEI {item.imei1}</Muted>
        <Muted>{active ? `Lié depuis le ${date(item.acquired_at)}` : `Délié le ${date(item.released_at)}`}</Muted>
      </Card>
    </Pressable>
  );
}

export default function ConsumerHome() {
  const { consumer } = useAuth();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['consumer', 'devices'],
    queryFn: () => api.get('/consumer/devices')
  });
  const items = data?.items ?? [];
  const active = items.filter((i) => i.status === 'active');

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => <Wordmark size={22} light />,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Mon compte" onPress={() => router.push('/account')} hitSlop={12}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Compte</Text>
            </Pressable>
          )
        }}
      />
      <Screen refreshing={isFetching && !isLoading} onRefresh={refetch}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>Bonjour {consumer?.full_name?.split(' ')[0] ?? ''}</Text>
          <Muted>{active.length} téléphone(s) lié(s) à votre compte</Muted>
        </View>

        <View style={st.grid}>
          <Tile title="Linker mon téléphone" sub="Enregistrer et protéger" onPress={() => router.push('/link')} />
          <Tile title="Vérifier un IMEI" sub="Avant un achat d’occasion" tone="navy" onPress={() => router.push('/check')} />
        </View>

        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 4 }}>Mes téléphones</Text>
        {isLoading ? <Loading /> : null}
        {!isLoading && items.length === 0 ? (
          <Banner tone="info" title="Aucun téléphone enregistré">
            Appuyez sur « Linker mon téléphone » pour enregistrer votre premier appareil. En cas de vol, un téléphone lié est beaucoup plus facile à retrouver et impossible à revendre proprement.
          </Banner>
        ) : null}
        {items.map((item) => (
          <PhoneCard key={item.registration_id} item={item} />
        ))}
      </Screen>
    </>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 96, borderRadius: radius.lg, padding: 16, justifyContent: 'flex-end', gap: 4, borderWidth: 1 },
  tileTitle: { fontSize: 17, fontWeight: '800' }
});
