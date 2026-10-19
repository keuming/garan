import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Card, Loading, Muted, Screen, Wordmark } from '../../src/components/ui';
import { UpdateBanner } from '../../src/components/UpdateBanner';
import { ProtectedHero } from '../../src/components/ProtectedHero';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { date } from '../../src/lib/format';
import { colors, radius, shadow } from '../../src/lib/theme';

function Tile({ title, sub, onPress, tone = 'green', icon }) {
  const bg = { green: colors.blue, navy: colors.navy, blood: colors.blood, white: '#fff' }[tone];
  const fg = tone === 'white' ? colors.ink : '#fff';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [st.tile, { backgroundColor: bg, borderColor: tone === 'white' ? colors.line : bg }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
      {icon ? <Text style={{ fontSize: 22 }}>{icon}</Text> : null}
      <View style={{ gap: 2 }}>
        <Text style={[st.tileTitle, { color: fg }]}>{title}</Text>
        {sub ? <Text style={{ color: tone === 'white' ? colors.ink2 : 'rgba(255,255,255,0.9)', fontSize: 12.5 }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={st.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function PhoneCard({ item }) {
  const active = item.status === 'active';
  const reported = ['stolen', 'lost', 'blocked'].includes(item.device_status);
  const specs = [item.color, item.storage_gb ? `${item.storage_gb} Go` : null].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/device/${item.registration_id}`)} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
      <Card style={{ gap: 8, borderLeftWidth: 4, borderLeftColor: reported ? colors.blood : active ? colors.green : colors.line }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={st.phoneTitle} numberOfLines={1}>{item.brand ? `${item.brand} ${item.model ?? ''}`.trim() : 'Téléphone'}</Text>
          <Text style={[st.badge, reported ? st.badgeBlood : active ? st.badgeOk : st.badgeMuted]}>
            {reported ? 'VOL' : active ? 'Lié' : 'Délié'}
          </Text>
        </View>
        <View style={{ gap: 3 }}>
          <InfoRow label="IMEI 1" value={item.imei1} />
          {item.imei2 ? <InfoRow label="IMEI 2" value={item.imei2} /> : null}
          {specs ? <InfoRow label="Caractéristiques" value={specs} /> : null}
          <InfoRow label={active ? 'Lié le' : 'Délié le'} value={date(active ? item.acquired_at : item.released_at)} />
          {item.merchant_name ? <InfoRow label="Marchand" value={item.merchant_name} /> : null}
          {item.receipt_number ? <InfoRow label="N° reçu" value={item.receipt_number} /> : null}
        </View>
      </Card>
    </Pressable>
  );
}

export default function ConsumerHome() {
  const { consumer } = useAuth();
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: ['consumer', 'devices'], queryFn: () => api.get('/consumer/devices') });
  const items = data?.items ?? [];
  const active = items.filter((i) => i.status === 'active');
  const firstName = consumer?.full_name?.split(' ')[0] ?? '';
  const subscribed = consumer?.subscription_expires_at && new Date(consumer.subscription_expires_at) > new Date();

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
        <UpdateBanner />

        {subscribed ? (
          <ProtectedHero
            tone="protected"
            eyebrow={`Bonjour ${firstName}`}
            title="Vous êtes protégé"
            subtitle={`${active.length} téléphone(s) lié(s) · abonnement actif jusqu'au ${date(consumer.subscription_expires_at)}`}
          />
        ) : (
          <ProtectedHero
            tone="soft"
            eyebrow={`Bonjour ${firstName}`}
            title="Protégez vos téléphones"
            subtitle="Abonnez-vous pour signaler un vol en un clic et prouver que vos téléphones sont à vous — 100 FCFA/mois."
          >
            <Button title="S’abonner (100 FCFA/mois)" onPress={() => router.push('/subscribe')} />
          </ProtectedHero>
        )}

        <View style={st.grid}>
          <Tile title="Linker mon téléphone" sub="Enregistrer et protéger" icon="🔗" tone="green" onPress={() => router.push('/link')} />
          <Tile title="Vérifier un IMEI" sub="Avant un achat d’occasion" icon="🔍" tone="navy" onPress={() => router.push('/check')} />
          <Tile title="Téléphones volés" sub="Registre réseau gaRAN" icon="⛔" tone="blood" onPress={() => router.push('/stolen')} />
          <Tile title="Pourquoi gaRAN ?" sub="Sécurité, avantages, abonnement" icon="🛡️" tone="white" onPress={() => router.push('/why')} />
          <Tile title="Mon compte" sub="Profil et sécurité" icon="👤" tone="white" onPress={() => router.push('/account')} />
        </View>

        <Text style={st.section}>Mes téléphones</Text>
        {isLoading ? <Loading /> : null}
        {!isLoading && items.length === 0 ? (
          <Banner tone="info" title="Aucun téléphone enregistré">
            Appuyez sur « Linker mon téléphone » pour enregistrer votre premier appareil. En cas de vol, un téléphone lié est beaucoup plus facile à retrouver et impossible à revendre proprement.
          </Banner>
        ) : null}
        {items.map((item) => <PhoneCard key={item.registration_id} item={item} />)}
      </Screen>
    </>
  );
}

const st = StyleSheet.create({
  hero: { alignItems: 'center', gap: 2, paddingVertical: 6 },
  heroName: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  heroSub: { fontSize: 13, color: colors.ink2, textAlign: 'center' },
  section: { fontSize: 13, fontWeight: '700', color: colors.ink2, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 104, borderRadius: radius.lg, padding: 16, justifyContent: 'space-between', borderWidth: 1, ...shadow.tile },
  tileTitle: { fontSize: 16, fontWeight: '800' },
  phoneTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, flex: 1 },
  infoLabel: { fontSize: 12.5, color: colors.ink2 },
  infoValue: { fontSize: 13, color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  badge: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  badgeOk: { backgroundColor: colors.okBg, color: colors.ok },
  badgeMuted: { backgroundColor: colors.line, color: colors.ink2 },
  badgeBlood: { backgroundColor: colors.bloodBg, color: colors.blood }
});
