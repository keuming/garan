import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Card, Muted, Screen, Wordmark } from '../../src/components/ui';
import { UpdateBanner } from '../../src/components/UpdateBanner';
import { ProtectedHero } from '../../src/components/ProtectedHero';
import { BalanceCard } from '../../src/components/BalanceCard';
import { api, shopPublicUrl } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { date, fcfa, num, periodRange } from '../../src/lib/format';
import { colors, radius, shadow } from '../../src/lib/theme';

function Tile({ title, sub, onPress, tone = 'green', icon }) {
  const bg = { green: colors.blue, navy: colors.navy, cyan: colors.cyan, blood: colors.blood, white: '#fff' }[tone];
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

/** Action principale de la boutique : large, impossible à manquer. */
function PrimaryAction({ title, sub, icon, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [st.primary, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
    >
      <View style={st.primaryIcon}><Text style={{ fontSize: 26 }}>{icon}</Text></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={st.primaryTitle}>{title}</Text>
        <Text style={st.primarySub}>{sub}</Text>
      </View>
      <Text style={st.primaryChevron}>›</Text>
    </Pressable>
  );
}

/** Vitrine en ligne : lien partageable sur WhatsApp et les réseaux. */
function VitrineCard() {
  const { user } = useAuth();
  const shopId = user?.shops?.[0]?.id;
  const items = useQuery({ queryKey: ['org', 'listings'], queryFn: () => api.get('/org/listings') });
  const active = (items.data?.items ?? []).filter((i) => i.status !== 'hidden' && i.quantity > 0).length;
  if (!shopId) return null;
  const name = user?.role === 'agent' ? user.shops?.[0]?.name : user?.organization?.name;
  const share = () => {
    const url = shopPublicUrl(shopId);
    return Share.share({ message: `🛍️ Téléphones disponibles chez ${name} — voir et réserver :\n${url}`, url });
  };
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 24 }}>🛍️</Text>
        <View style={{ flex: 1 }}>
          <Text style={st.vitrineTitle}>Ma vitrine en ligne</Text>
          <Muted>{active > 0 ? `${num(active)} ${active > 1 ? 'articles visibles' : 'article visible'} par vos clients` : 'Ajoutez vos téléphones disponibles'}</Muted>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable accessibilityRole="button" onPress={share} style={[st.pill, { backgroundColor: colors.blue }]}>
          <Text style={[st.pillText, { color: '#fff' }]}>Partager</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/availability')} style={[st.pill, { backgroundColor: colors.emeraldSoft }]}>
          <Text style={[st.pillText, { color: colors.emeraldDeep }]}>Gérer les articles</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <View style={st.kpi}>
      <Text style={st.kpiLabel}>{label}</Text>
      <Text style={st.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

/* --------------------------- Abonnement --------------------------- */
function SubscriptionCard() {
  const { user } = useAuth();
  const org = user?.organization;
  const name = user?.role === 'agent' ? user.shops?.[0]?.name : org?.name;
  const exp = org?.subscription_expires_at ? new Date(org.subscription_expires_at) : null;
  const daysLeft = exp ? Math.ceil((exp - new Date()) / 86_400_000) : null;
  const expired = daysLeft !== null && daysLeft <= 0;
  const trial = org?.status === 'trial';

  const tone = expired ? 'alert' : trial ? 'soft' : 'protected';
  const title = expired ? 'Abonnement expiré' : trial ? 'Période d’essai' : 'Boutique protégée';
  const subtitle = expired
    ? 'Renouvelez pour continuer à enregistrer vos opérations — 1 000 FCFA/mois.'
    : trial
      ? `Essai en cours${exp ? ` jusqu'au ${date(exp)}` : ''}. Abonnez-vous — 1 000 FCFA/mois.`
      : `Abonnement actif${exp ? ` jusqu'au ${date(exp)}` : ''} · paiement ORZAYAH`;

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/subscribe')} style={({ pressed }) => [pressed && { opacity: 0.94 }]}>
      <ProtectedHero tone={tone} eyebrow={name} title={title} subtitle={subtitle} />
    </Pressable>
  );
}

/* ------------------------- Super marchand ------------------------- */
function SupervisorHome() {
  const { user } = useAuth();
  const month = periodRange('month');
  const ov = useQuery({ queryKey: ['overview', 'month'], queryFn: () => api.get('/org/overview', { from: month.from }) });
  return (
    <Screen refreshing={ov.isFetching} onRefresh={ov.refetch}>
      <UpdateBanner />
      <SubscriptionCard />
      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Kpi label="Sous-marchands" value={num(ov.data?.sub_merchants)} />
        <Kpi label="Ventes réseau (mois)" value={num(ov.data?.sale?.count)} hint={fcfa(ov.data?.sale?.amount)} />
        <Kpi label="Rachats réseau (mois)" value={num(ov.data?.purchase?.count)} hint={fcfa(ov.data?.purchase?.amount)} />
      </Card>
      <View style={st.grid}>
        <Tile title="Mes sous-marchands" sub="États par boutique" icon="🏪" tone="navy" onPress={() => router.push('/supervision')} />
        <Tile title="Vérifier un IMEI" sub="Avant un achat" icon="🔍" tone="white" onPress={() => router.push('/check')} />
        <Tile title="Mon compte" icon="👤" tone="white" onPress={() => router.push('/account')} />
      </View>
      <Banner tone="info">Chaque sous-marchand gère ses ventes depuis son propre compte Marchand. Vous suivez ici leur activité consolidée.</Banner>
    </Screen>
  );
}

/* ----------------------------- Marchand ----------------------------- */
function MerchantHome() {
  const { user, isOwner } = useAuth();
  const qc = useQueryClient();

  const org = user?.organization;
  const exp = org?.subscription_expires_at ? new Date(org.subscription_expires_at) : null;
  const daysLeft = exp ? Math.ceil((exp - new Date()) / 86_400_000) : null;
  const refreshing = useIsFetching({ queryKey: ['balance'] }) > 0;
  const refetch = () => qc.invalidateQueries({ queryKey: ['balance'] });
  const shopName = user?.role === 'agent' ? user.shops?.[0]?.name : org?.name;

  return (
    <Screen refreshing={refreshing} onRefresh={refetch}>
      <UpdateBanner />
      <SubscriptionCard />

      <BalanceCard />

      <PrimaryAction title="Nouvelle vente" sub="Lier le téléphone à l’acheteur et encaisser" icon="💸" onPress={() => router.push('/sale')} />
      <View style={st.grid}>
        <Tile title="Rachat" sub="Acheter à un particulier" icon="📥" tone="navy" onPress={() => router.push({ pathname: '/operation', params: { type: 'purchase' } })} />
        <Tile title="Entrée en stock" sub="Téléphone neuf fournisseur" icon="📦" tone="cyan" onPress={() => router.push({ pathname: '/operation', params: { type: 'stock_in' } })} />
      </View>

      <VitrineCard />

      <Text style={st.section}>Gestion</Text>
      <View style={st.grid}>
        <Tile title="Vérifier un IMEI" sub="Avant tout achat" icon="🔍" tone="white" onPress={() => router.push('/check')} />
        <Tile title="Déclarer un vol" sub="Signaler un téléphone volé" icon="🚨" tone="blood" onPress={() => router.push('/report-theft')} />
        <Tile title="Téléphones volés" sub="Registre réseau gaRAN" icon="⛔" tone="white" onPress={() => router.push('/stolen')} />
        <Tile title="Historique" sub="Toutes les opérations" icon="🧾" tone="white" onPress={() => router.push('/history')} />
        <Tile title="États" sub="Par marque et modèle" icon="📊" tone="white" onPress={() => router.push('/stats')} />
        {isOwner ? <Tile title="Comptes vendeurs" sub="Accès de la boutique" icon="👥" tone="white" onPress={() => router.push('/users')} /> : null}
        <Tile title="Pourquoi gaRAN ?" sub="Risques, avantages, abonnement" icon="🛡️" tone="white" onPress={() => router.push('/why')} />
        <Tile title="Mon compte" icon="👤" tone="white" onPress={() => router.push('/account')} />
      </View>
    </Screen>
  );
}

export default function Home() {
  const { isSuperMerchant } = useAuth();
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
      {isSuperMerchant ? <SupervisorHome /> : <MerchantHome />}
    </>
  );
}

const st = StyleSheet.create({
  hero: { alignItems: 'center', gap: 2, paddingVertical: 4 },
  heroName: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  heroRole: { fontSize: 13, color: colors.ink2, textAlign: 'center' },
  section: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 104, borderRadius: radius.lg, padding: 16, justifyContent: 'space-between', borderWidth: 1, ...shadow.tile },
  tileTitle: { fontSize: 17, fontWeight: '800' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.blue, borderRadius: radius.lg, padding: 18, ...shadow.hero },
  primaryIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  primaryTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  primarySub: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  primaryChevron: { color: '#fff', fontSize: 34, fontWeight: '300' },
  vitrineTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 999 },
  pillText: { fontWeight: '800', fontSize: 14 },
  kpi: { flexGrow: 1, flexBasis: '28%', minWidth: 96, gap: 2 },
  kpiLabel: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
  kpiValue: { fontSize: 23, fontWeight: '800', color: colors.ink }
});
