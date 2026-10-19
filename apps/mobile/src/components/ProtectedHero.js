import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors, radius, shadow } from '../lib/theme';

/** Bouclier (téléphone protégé) dessiné en SVG — net, aux couleurs de la marque. */
export function ShieldIcon({ size = 56, color = '#fff', check = true }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.2 20 5.2 V11 C20 16.1 16.4 20 12 21.8 C7.6 20 4 16.1 4 11 V5.2 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      {check ? <Path d="M8.3 11.9 l2.6 2.6 l4.8 -5.3" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" /> : null}
    </Svg>
  );
}

/**
 * Bandeau de confiance. `tone` :
 *  - 'protected' (émeraude plein) : abonné / protégé.
 *  - 'soft' (émeraude clair) : invitation à s'abonner.
 *  - 'alert' (rouge sang) : abonnement expiré.
 */
export function ProtectedHero({ tone = 'protected', eyebrow, title, subtitle, children }) {
  const plain = tone === 'protected';
  const alert = tone === 'alert';
  const bg = alert ? colors.blood : plain ? colors.green : colors.emeraldSoft;
  const fg = plain || alert ? '#fff' : colors.forest;
  const dim = plain || alert ? 'rgba(255,255,255,0.88)' : colors.ink2;
  const icon = plain || alert ? '#fff' : colors.emeraldDeep;

  return (
    <View style={[st.hero, { backgroundColor: bg }, plain && shadow.hero]}>
      {/* halo translucide derrière le bouclier */}
      <View style={st.halo} pointerEvents="none">
        <Svg width={220} height={220} viewBox="0 0 220 220">
          <Circle cx={170} cy={40} r={110} fill={plain || alert ? 'rgba(255,255,255,0.10)' : 'rgba(0,194,113,0.10)'} />
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={[st.badge, { backgroundColor: plain || alert ? 'rgba(255,255,255,0.16)' : '#fff' }]}>
          <ShieldIcon size={40} color={icon} check={!alert} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {eyebrow ? <Text style={[st.eyebrow, { color: dim }]}>{eyebrow}</Text> : null}
          <Text style={[st.title, { color: fg }]}>{title}</Text>
          {subtitle ? <Text style={[st.sub, { color: dim }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {children ? <View style={{ marginTop: 14 }}>{children}</View> : null}
    </View>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 20, overflow: 'hidden' },
  halo: { position: 'absolute', top: -40, right: -40 },
  badge: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  title: { fontSize: 21, fontWeight: '900' },
  sub: { fontSize: 13.5, lineHeight: 19 }
});
