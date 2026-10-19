import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Muted, Screen, Wordmark } from '../../src/components/ui';
import { colors, radius } from '../../src/lib/theme';

const PROFILES = [
  { key: 'consumer', title: 'Usager', desc: 'J’ai acheté un téléphone et je veux l’enregistrer à mon nom.', tone: colors.blue },
  { key: 'merchant', title: 'Marchand', desc: 'Je vends des téléphones dans une boutique.', tone: colors.navy },
  { key: 'super_merchant', title: 'Super marchand', desc: 'Je suis grossiste et je supervise plusieurs boutiques.', tone: '#0E86B8' }
];

function Card({ p }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/login', params: { profile: p.key } })}
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
  return (
    <Screen contentStyle={{ paddingTop: 64, gap: 20 }}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: 20 }} accessibilityIgnoresInvertColors />
        <Wordmark size={40} />
        <Muted style={{ fontSize: 15, textAlign: 'center' }}>Registre digital des téléphones · IMEI</Muted>
      </View>
      <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink, marginTop: 8 }}>Je suis…</Text>
      {PROFILES.map((p) => <Card key={p.key} p={p} />)}
      <Pressable accessibilityRole="button" onPress={() => router.push('/why')} style={({ pressed }) => [st.why, pressed && { opacity: 0.85 }]}>
        <Text style={st.whyText}>🛡️  Pourquoi gaRAN ? Découvrir la sécurité et les avantages</Text>
      </Pressable>
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderWidth: 1.5, borderRadius: radius.lg, padding: 18 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  desc: { fontSize: 13, color: colors.ink2, marginTop: 2 },
  why: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  whyText: { color: colors.green, fontWeight: '700', fontSize: 14, textAlign: 'center' }
});
