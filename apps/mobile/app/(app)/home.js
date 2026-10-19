import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Banner, Card, Muted, Screen, Wordmark } from '../../src/components/ui';
import { UpdateBanner } from '../../src/components/UpdateBanner';
import { ProtectedHero } from '../../src/components/ProtectedHero';
import { api } from '../../src/lib/api';
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
  const today = periodRange('today');
  const month = periodRange('month');
  const sToday = useQuery({ queryKey: ['stats', 'sale', 'today'], queryFn: () => api.get('/stats/summary', { type: 'sale', from: today.from }) });
  const pToday = useQuery({ queryKey: ['stats', 'purchase', 'today'], queryFn: () => api.get('/stats/summary', { type: 'purchase', from: today.from }) });
  const sMonth = useQuery({ queryKey: ['stats', 'sale', 'month'], queryFn: () => api.get('/stats/summary', { type: 'sale', from: month.from }) });

  const org = user?.organization;
  const exp = org?.subscription_expires_at ? new Date(org.subscription_expires_at) : null;
  const daysLeft = exp ? Math.ceil((exp - new Date()) / 86_400_000) : null;
  const refreshing = sToday.isFetching || pToday.isFetching || sMonth.isFetching;
  const refetch = () => Promise.all([sToday.refetch(), pToday.refetch(), sMonth.refetch()]);
  const shopName = user?.role === 'agent' ? user.shops?.[0]?.name : org?.name;

  return (
    <Screen refreshing={refreshing} onRefresh={refetch}>
      <UpdateBanner />
      <SubscriptionCard />

      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Kpi label="Ventes du jour" value={num(sToday.data?.total_count)} hint={fcfa(sToday.data?.total_amount)} />
        <Kpi label="Rachats du jour" value={num(pToday.data?.total_count)} hint={fcfa(pToday.data?.total_amount)} />
        <Kpi label="Ventes du mois" value={num(sMonth.data?.total_count)} hint={fcfa(sMonth.data?.total_amount)} />
      </Card>

      <Text style={st.section}>Opérations</Text>
      <View style={st.grid}>
        <Tile title="Vente" sub="Lier le téléphone à l’acheteur" icon="💸" tone="green" onPress={() => router.push('/sale')} />
        <Tile title="Rachat" sub="Acheter à un particulier" icon="📥" tone="navy" onPress={() => router.push({ pathname: '/operation', params: { type: 'purchase' } })} />
        <Tile title="Entrée en stock" sub="Téléphone neuf fournisseur" icon="📦" tone="cyan" onPress={() => router.push({ pathname: '/operation', params: { type: 'stock_in' } })} />
        <Tile title="Disponibilité" sub="Vitrine des articles en boutique" icon="🛍️" tone="white" onPress={() => router.push('/availability')} />
      </View>

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
  section: { fontSize: 13, fontWeight: '700', color: colors.ink2, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 104, borderRadius: radius.lg, padding: 16, justifyContent: 'space-between', borderWidth: 1, ...shadow.tile },
  tileTitle: { fontSize: 17, fontWeight: '800' },
  kpi: { flexGrow: 1, flexBasis: '28%', minWidth: 96, gap: 2 },
  kpiLabel: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
  kpiValue: { fontSize: 23, fontWeight: '800', color: colors.ink }
});
