import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { colors, radius } from '../lib/theme';

/* Mémorise « déjà affiché aujourd'hui » : localStorage sur PWA, repli mémoire sur natif
   (pas de dépendance AsyncStorage). Le popup reparaît donc chaque jour (PWA) ou à chaque
   ouverture de session (natif), tant que le reliquat n'est pas réglé. */
const mem = {};
const dayKey = () => new Date().toISOString().slice(0, 10);
function shownToday(key) {
  try { if (typeof localStorage !== 'undefined') return localStorage.getItem('garan_reminder_' + key) === dayKey(); } catch { /* ignore */ }
  return mem[key] === dayKey();
}
function markShown(key) {
  try { if (typeof localStorage !== 'undefined') { localStorage.setItem('garan_reminder_' + key, dayKey()); return; } } catch { /* ignore */ }
  mem[key] = dayKey();
}

/**
 * Rappel du reliquat de mise en service, affiché sur l'accueil (marchand et usager).
 * - Bannière persistante, toujours visible tant qu'il reste à payer (touchez pour payer).
 * - Popup une fois par jour invitant à régler le prochain versement.
 */
export function SetupReminder({ storageKey, title, message, ctaLabel, onPay, overdue = false }) {
  const [popup, setPopup] = useState(false);
  useEffect(() => {
    if (!shownToday(storageKey)) { setPopup(true); markShown(storageKey); }
  }, [storageKey]);

  const accent = overdue ? colors.danger : colors.warn;
  const bg = overdue ? colors.dangerBg : colors.warnBg;
  const close = () => setPopup(false);
  const payNow = () => { close(); onPay?.(); };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={onPay} style={({ pressed }) => [st.banner, { backgroundColor: bg }, pressed && { opacity: 0.92 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[st.title, { color: accent }]}>{title}</Text>
          <Text style={[st.msg, { color: accent }]}>{message}</Text>
        </View>
        <Text style={[st.cta, { color: '#fff', backgroundColor: accent }]}>{ctaLabel}</Text>
      </Pressable>

      <Modal visible={popup} transparent animationType="fade" onRequestClose={close}>
        <View style={st.overlay}>
          <View style={st.sheet}>
            <Text style={st.sheetTitle}>{title}</Text>
            <Text style={st.sheetMsg}>{message}</Text>
            <View style={{ height: 14 }} />
            <Button title={ctaLabel} onPress={payNow} />
            <View style={{ height: 8 }} />
            <Button title="Plus tard" variant="secondary" onPress={close} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 14, marginBottom: 12 },
  title: { fontWeight: '800', fontSize: 14.5 },
  msg: { fontSize: 13, marginTop: 2 },
  cta: { fontWeight: '800', fontSize: 13, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: radius.lg ?? 16, padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  sheetMsg: { fontSize: 14.5, color: colors.ink2, marginTop: 8, lineHeight: 20 }
});
