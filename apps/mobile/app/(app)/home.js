import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Banner, Card, Muted, Screen, Wordmark } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { date, fcfa, num, periodRange } from '../../src/lib/format';
import { colors, radius } from '../../src/lib/theme';

function Tile({ title, sub, onPress, tone = 'blue' }) {
  const bg = { blue: colors.blue, navy: colors.navy, cyan: '#0E86B8', white: '#fff' }[tone];
  const fg = tone === 'white' ? colors.ink : '#fff';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [st.tile, { backgroundColor: bg, borderColor: tone === 'white' ? colors.line : bg }, pressed && { opacity: 0.85 }]}>
      <Text style={[st.tileTitle, { color: fg }]}>{title}</Text>
      {sub ? <Text style={{ color: tone === 'white' ? colors.ink2 : 'rgba(255,255,255,0.85)', fontSize: 13 }}>{sub}</Text> : null}
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

/* ------------------------- Super marchand (supervision) ------------------------- */
function SupervisorHome() {
  const { user } = useAuth();
  const month = periodRange('month');
  const ov = useQuery({ queryKey: ['overview', 'month'], queryFn: () => api.get('/org/overview', { from: month.from }) });
  return (
    <Screen refreshing={ov.isFetching} onRefresh={ov.refetch}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{user?.organization?.name}</Text>
        <Muted>Super marchand · {user?.full_name}</Muted>
      </View>
      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Kpi label="Sous-marchands" value={num(ov.data?.sub_merchants)} />
        <Kpi label="Ventes réseau (mois)" value={num(ov.data?.sale?.count)} hint={fcfa(ov.data?.sale?.amount)} />
        <Kpi label="Rachats réseau (mois)" value={num(ov.data?.purchase?.count)} hint={fcfa(ov.data?.purchase?.amount)} />
      </Card>
      <View style={st.grid}>
        <Tile title="Mes sous-marchands" sub="États par boutique" tone="white" onPress={() => router.push('/supervision')} />
        <Tile title="Vérifier un IMEI" sub="Avant un achat" tone="white" onPress={() => router.push('/check')} />
        <Tile title="Mon compte" tone="white" onPress={() => router.push('/account')} />
      </View>
      <Banner tone="info">Chaque sous-marchand gère ses ventes depuis son propre compte Marchand. Vous suivez ici leur activité consolidée.</Banner>
    </Screen>
  );
}

/* ----------------------------- Marchand / vendeur ----------------------------- */
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
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{shopName}</Text>
        <Muted>{user?.full_name} · {isOwner ? 'Compte principal' : 'Vendeur'}</Muted>
      </View>

      {daysLeft !== null && daysLeft <= 0 ? (
        <Banner tone="danger" title="Abonnement expiré">Les nouvelles opérations sont bloquées. Contactez gaRAN.</Banner>
      ) : daysLeft !== null && daysLeft <= 7 ? (
        <Banner tone="warn" title={org.status === 'trial' ? 'Fin de la période d’essai' : 'Abonnement bientôt expiré'}>Échéance le {date(exp)} ({daysLeft} j).</Banner>
      ) : null}

      <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Kpi label="Ventes du jour" value={num(sToday.data?.total_count)} hint={fcfa(sToday.data?.total_amount)} />
        <Kpi label="Rachats du jour" value={num(pToday.data?.total_count)} hint={fcfa(pToday.data?.total_amount)} />
        <Kpi label="Ventes du mois" value={num(sMonth.data?.total_count)} hint={fcfa(sMonth.data?.total_amount)} />
      </Card>

      <View style={st.grid}>
        <Tile title="Vente" sub="Lier le téléphone à l’acheteur" onPress={() => router.push({ pathname: '/operation', params: { type: 'sale' } })} />
        <Tile title="Rachat" sub="Acheter à un particulier" tone="navy" onPress={() => router.push({ pathname: '/operation', params: { type: 'purchase' } })} />
        <Tile title="Entrée en stock" sub="Téléphone neuf fournisseur" tone="cyan" onPress={() => router.push({ pathname: '/operation', params: { type: 'stock_in' } })} />
        <Tile title="Vérifier un IMEI" sub="Avant tout achat" tone="white" onPress={() => router.push('/check')} />
      </View>
      <View style={st.grid}>
        <Tile title="Historique" sub="Toutes les opérations" tone="white" onPress={() => router.push('/history')} />
        <Tile title="États" sub="Par marque et modèle" tone="white" onPress={() => router.push('/stats')} />
        {isOwner ? <Tile title="Comptes vendeurs" sub="Accès de la boutique" tone="white" onPress={() => router.push('/users')} /> : null}
        <Tile title="Mon compte" tone="white" onPress={() => router.push('/account')} />
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 96, borderRadius: radius.lg, padding: 16, justifyContent: 'flex-end', gap: 4, borderWidth: 1 },
  tileTitle: { fontSize: 18, fontWeight: '800' },
  kpi: { flexGrow: 1, flexBasis: '28%', minWidth: 96, gap: 2 },
  kpiLabel: { fontSize: 12, color: colors.ink2, fontWeight: '600' },
  kpiValue: { fontSize: 24, fontWeight: '800', color: colors.ink }
});
