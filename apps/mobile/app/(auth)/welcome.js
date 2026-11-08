import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Muted, Screen, Wordmark } from '../../src/components/ui';
import { colors, radius } from '../../src/lib/theme';

const cleanPromo = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

const PROFILES = [
  { key: 'consumer', title: 'Usager', desc: 'J’ai acheté un téléphone et je veux l’enregistrer à mon nom.', tone: colors.blue },
  { key: 'merchant', title: 'Marchand', desc: 'Je vends des téléphones dans une boutique.', tone: colors.navy },
  { key: 'super_merchant', title: 'Super marchand', desc: 'Je suis grossiste et je supervise plusieurs boutiques.', tone: '#0E86B8' }
];

/** Carte de profil. En mode invitation (code promo), elle mène directement à la création
    de compte avec le code prérempli ; sinon, vers la connexion (comportement habituel). */
function Card({ p, promo }) {
  const go = () => promo
    ? router.push({ pathname: '/register', params: { profile: p.key, promo } })
    : router.push({ pathname: '/login', params: { profile: p.key } });
  return (
    <Pressable
      accessibilityRole="button"
      onPress={go}
      style={({ pressed }) => [st.card, { borderColor: p.tone }, pressed && { opacity: 0.85 }]}
    >
      <View style={[st.dot, { backgroundColor: p.tone }]} />
      <View style={{ flex: 1 }}>
        <Text style={st.title}>{p.title}</Text>
        <Text style={st.desc}>{p.desc}</Text>
      </View>
      <Text style={{ color: p.tone, fontSize: 22, fontWeight: '800' }}>›</Text>
    </Pressable>
  );
}

export default function Welcome() {
  const params = useLocalSearchParams();
  const promo = cleanPromo(params.code ?? params.promo);
  const invited = Boolean(promo);

  return (
    <Screen contentStyle={{ paddingTop: 64, gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: 20 }} accessibilityIgnoresInvertColors />
        <Wordmark size={40} />
        <Muted style={{ fontSize: 15, textAlign: 'center' }}>Registre digital des téléphones · IMEI</Muted>
      </View>

      {invited ? (
        <View style={st.invite}>
          <Text style={st.inviteTitle}>Vous êtes invité(e) sur gaRAN 🛡️</Text>
          <Text style={st.inviteDesc}>
            Protégez votre téléphone contre le vol. Choisissez votre profil ci-dessous pour créer votre compte — c’est rapide.
          </Text>
          <Text style={st.inviteCode}>Code promo déjà enregistré : <Text style={{ fontWeight: '900', color: colors.green }}>{promo}</Text></Text>
        </View>
      ) : null}

      <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink, marginTop: 4 }}>
        {invited ? 'Je crée mon compte en tant que…' : 'Je suis…'}
      </Text>
      {PROFILES.map((p) => <Card key={p.key} p={p} promo={invited ? promo : null} />)}

      <Pressable accessibilityRole="button" onPress={() => router.push('/why')} style={({ pressed }) => [st.why, pressed && { opacity: 0.85 }]}>
        <Text style={st.whyText}>🛡️  POURQUOI gaRAN ? Découvrir la sécurité et les avantages</Text>
      </Pressable>

      {invited ? (
        <View style={{ alignItems: 'center' }}>
          <Muted style={{ fontSize: 13 }}>Vous avez déjà un compte ?</Muted>
          <Link href="/login" style={{ color: colors.blue, fontWeight: '700', padding: 8 }}>Se connecter</Link>
        </View>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderWidth: 1.5, borderRadius: radius.lg, padding: 18 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  desc: { fontSize: 13, color: colors.ink2, marginTop: 2 },
  why: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  whyText: { color: colors.green, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  invite: { backgroundColor: '#E9F9F1', borderRadius: radius.lg, padding: 16, gap: 6 },
  inviteTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  inviteDesc: { fontSize: 13.5, color: colors.ink2, lineHeight: 19 },
  inviteCode: { fontSize: 13, color: colors.ink2, marginTop: 2 }
});
