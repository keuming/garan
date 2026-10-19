import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { colors, radius } from '../lib/theme';

/**
 * Invite à mettre à jour l'application sans régénérer l'APK.
 * - Mobile (APK) : Expo Updates (OTA) — télécharge le nouveau JS et recharge.
 * - Web (PWA) : service worker — active la nouvelle version et recharge.
 * N'affiche rien tant qu'aucune mise à jour n'est disponible.
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;

    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg || cancel) return;
        if (reg.waiting) setAvailable(true);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) setAvailable(true);
          });
        });
      });
      return () => { cancel = true; };
    }

    // Natif : vérifie une mise à jour OTA au démarrage (désactivé en dev).
    (async () => {
      try {
        if (!Updates.isEnabled) return;
        const u = await Updates.checkForUpdateAsync();
        if (!cancel && u.isAvailable) setAvailable(true);
      } catch { /* hors ligne ou indisponible : on ignore */ }
    })();
    return () => { cancel = true; };
  }, []);

  async function apply() {
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          let reloaded = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloaded) return;
            reloaded = true;
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
        return;
      }
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      setBusy(false);
    }
  }

  if (!available) return null;

  return (
    <Pressable accessibilityRole="button" onPress={apply} disabled={busy} style={({ pressed }) => [st.wrap, pressed && { opacity: 0.9 }]}>
      <View style={{ flex: 1 }}>
        <Text style={st.title}>Mise à jour disponible</Text>
        <Text style={st.sub}>Touchez pour installer la dernière version — pas besoin de réinstaller.</Text>
      </View>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.cta}>Mettre à jour</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy, borderRadius: radius.md, padding: 14 },
  title: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  cta: { color: '#fff', fontWeight: '800', backgroundColor: colors.green, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' }
});
