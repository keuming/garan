import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Banner, Button, Card, Loading, Muted, Screen, Wordmark } from '../../src/components/ui';
import { UpdateBanner } from '../../src/components/UpdateBanner';
import { SetupReminder } from '../../src/components/SetupReminder';
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
          {active ? <InfoRow label="Abonnement" value={item.subscription_expires_at && new Date(item.subscription_expires_at) > new Date() ? `Jusqu’au ${date(item.subscription_expires_at)}` : 'À activer'} /> : null}
          {item.merchant_name ? <InfoRow label="Marchand" value={item.merchant_name} /> : null}
          {item.receipt_number ? <InfoRow label="N° reçu" value={item.receipt_number} /> : null}
        </View>
      </Card>
    </Pressable>
  );
}

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

function BdStat({ label, value }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 70 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: colors.ink2 }}>{label}</Text>
    </View>
  );
}

/** Tuile de solde de commission (couleur pleine, pour motiver le BD). */
function BdBalanceTile({ label, due, total, bg }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 16, padding: 14 }}>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 4 }}>{nf(due)} F</Text>
      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginTop: 2 }}>cumul {nf(total)} F</Text>
    </View>
  );
}

/** Bloc parrainage sur l'accueil : demande, ou code promo + partage une fois validé. */
function BusinessDeveloperCard() {
  const { consumer, reloadConsumer } = useAuth();
  const bd = consumer?.business_developer;
  const request = useMutation({
    mutationFn: () => api.post('/consumer/business-developer/request', {}),
    onSuccess: async () => { await reloadConsumer?.(); Alert.alert('Demande envoyée', 'Votre demande pour devenir Business Développeur est en cours de validation.'); },
    onError: (e) => Alert.alert('Impossible pour le moment', e?.message ?? 'Réessayez plus tard.')
  });
  if (!bd) return null;

  if (bd.status === 'active') {
    const code = bd.promo_code;
    const s = bd.stats ?? {};
    const link = 'https://apps.garan.solutions';
    const msg = `Protège ton téléphone contre le vol avec gaRAN. Utilise mon code promo ${code} à l'inscription : ${link}`;
    const openUrl = (u) => Linking.openURL(u).catch(() => Alert.alert('Partage impossible', 'Application de partage introuvable sur cet appareil.'));
    return (
      <Card style={{ gap: 12, borderWidth: 1, borderColor: colors.green }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Muted>Mon espace Business Développeur</Muted>
          <Text style={{ fontSize: 11.5, color: colors.ink3 }}>{s.usagers ?? 0} usagers · {s.marchands ?? 0} marchands</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <BdBalanceTile label="Commission usager" due={s.consumer_due_fcfa ?? 0} total={s.consumer_total_fcfa ?? 0} bg={colors.green} />
          <BdBalanceTile label="Commission marchand" due={s.merchant_due_fcfa ?? 0} total={s.merchant_total_fcfa ?? 0} bg={colors.navy} />
        </View>
        <Text style={{ textAlign: 'center', color: colors.ink2, fontSize: 12.5 }}>
          Disponible à reverser : <Text style={{ fontWeight: '900', color: colors.ink }}>{nf(s.due_fcfa ?? 0)} FCFA</Text>
        </Text>

        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 12.5, color: colors.ink2 }}>Votre code promo à partager</Text>
          <Text style={{ fontSize: 30, fontWeight: '900', letterSpacing: 4, color: colors.green }}>{code}</Text>
        </View>
        <Button title="Partager sur WhatsApp" onPress={() => openUrl('https://wa.me/?text=' + encodeURIComponent(msg))} />
        <Button title="Mon espace & reversements" variant="secondary" onPress={() => router.push('/bd')} />
        {bd.pending_request ? (
          <Text style={{ textAlign: 'center', color: colors.warn, fontSize: 12.5 }}>
            Reversement de {nf(bd.pending_request.amount_fcfa)} FCFA en cours de traitement.
          </Text>
        ) : !bd.orzayah_account ? (
          <Text style={{ textAlign: 'center', color: colors.ink3, fontSize: 12 }}>
            💡 Créez votre compte ORZAYAH pour gérer vos gains vous-même.
          </Text>
        ) : null}
      </Card>
    );
  }
  if (bd.status === 'pending') {
    return (
      <Card style={{ gap: 6 }}>
        <Muted>Business Développeur</Muted>
        <Text style={{ color: colors.ink2, fontSize: 13 }}>Votre demande est en cours de validation. Vous recevrez votre code promo dès qu'elle sera acceptée.</Text>
      </Card>
    );
  }
  if (bd.status === 'suspended') {
    return (
      <Card style={{ gap: 6 }}>
        <Muted>Business Développeur</Muted>
        <Text style={{ color: colors.ink2, fontSize: 13 }}>Votre accès Business Développeur est suspendu. Contactez le support gaRAN.</Text>
      </Card>
    );
  }
  // 'none' ou 'rejected'
  return (
    <Card style={{ gap: 8 }}>
      <Muted>Devenez Business Développeur</Muted>
      <Text style={{ color: colors.ink2, fontSize: 13 }}>Recommandez gaRAN et gagnez des commissions : 250 FCFA par usager recruté, 2 000 FCFA par marchand, et 25 FCFA à chaque abonnement mensuel de vos filleuls.</Text>
      <Button title={bd.status === 'rejected' ? 'Renouveler ma demande' : 'Devenir Business Développeur'} onPress={() => request.mutate()} loading={request.isPending} />
    </Card>
  );
}

export default function ConsumerHome() {
  const { consumer } = useAuth();
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: ['consumer', 'devices'], queryFn: () => api.get('/consumer/devices') });
  const setupPending = useQuery({ queryKey: ['consumer', 'setup-pending'], queryFn: () => api.get('/consumer/setup/pending') });
  const pending = setupPending.data;
  const items = data?.items ?? [];
  const active = items.filter((i) => i.status === 'active');
  const firstName = consumer?.full_name?.split(' ')[0] ?? '';
  const now = Date.now();
  const unpaid = active.filter((i) => !(i.subscription_expires_at && new Date(i.subscription_expires_at).getTime() > now));

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

        {pending?.count > 0 ? (
          <SetupReminder
            storageKey={`consumer-setup-${consumer?.id ?? 'me'}`}
            title="Mise en service à finaliser"
            message={
              pending.count === 1
                ? `Il reste ${nf(pending.remaining_total_fcfa)} FCFA à régler pour la mise en service de votre appareil.`
                : `Il reste ${nf(pending.remaining_total_fcfa)} FCFA à régler pour la mise en service de ${pending.count} appareils.`
            }
            ctaLabel="Payer"
            onPay={() => router.push(`/setup?reg=${pending.items[0].registration_id}`)}
          />
        ) : null}

        {active.length > 0 && unpaid.length === 0 ? (
          <ProtectedHero
            tone="protected"
            eyebrow={`Bonjour ${firstName}`}
            title="Vous êtes protégé"
            subtitle={`${active.length} téléphone(s) lié(s), tous à jour d’abonnement.`}
          />
        ) : unpaid.length > 0 ? (
          <ProtectedHero
            tone="soft"
            eyebrow={`Bonjour ${firstName}`}
            title={`${unpaid.length} appareil(s) à abonner`}
            subtitle="Chaque téléphone a son propre abonnement — 125 FCFA/mois (+ mise en service). Activez-le pour signaler un vol et générer vos documents certifiés."
          >
            <Button title="Abonner un appareil" onPress={() => router.push(`/subscribe?reg=${unpaid[0].registration_id}`)} />
          </ProtectedHero>
        ) : (
          <ProtectedHero
            tone="soft"
            eyebrow={`Bonjour ${firstName}`}
            title="Protégez vos téléphones"
            subtitle="Enregistrez un téléphone puis abonnez-le pour signaler un vol en un clic et prouver qu’il est à vous."
          >
            <Button title="Linker mon téléphone" onPress={() => router.push('/link')} />
          </ProtectedHero>
        )}

        <View style={st.grid}>
          <Tile title="Linker mon téléphone" sub="Enregistrer et protéger" icon="🔗" tone="green" onPress={() => router.push('/link')} />
          <Tile title="Vérifier un IMEI" sub="Avant un achat d’occasion" icon="🔍" tone="navy" onPress={() => router.push('/check')} />
          <Tile title="Téléphones volés" sub="Registre réseau gaRAN" icon="⛔" tone="blood" onPress={() => router.push('/stolen')} />
          <Tile title="Pourquoi gaRAN ?" sub="Sécurité, avantages, abonnement" icon="🛡️" tone="white" onPress={() => router.push('/why')} />
          <Tile title="Mon compte" sub="Profil et sécurité" icon="👤" tone="white" onPress={() => router.push('/account')} />
        </View>

        <BusinessDeveloperCard />

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
