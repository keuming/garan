import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../lib/theme';

export function Screen({ children, scroll = true, refreshing, onRefresh, contentStyle }) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[s.screen, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.blue} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.screen, { flex: 1 }, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={s.safe} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Wordmark({ size = 28, light = false }) {
  return (
    <Text style={{ fontSize: size, letterSpacing: -0.5 }} accessibilityLabel="gaRAN">
      <Text style={{ fontWeight: '500', color: light ? '#fff' : colors.navy }}>ga</Text>
      <Text style={{ fontWeight: '800', color: colors.green }}>RAN</Text>
    </Text>
  );
}

export const Title = ({ children, sub }) => (
  <View style={{ gap: 4 }}>
    <Text style={s.title}>{children}</Text>
    {sub ? <Text style={s.sub}>{sub}</Text> : null}
  </View>
);

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;

export const Label = ({ children }) => <Text style={s.label}>{children}</Text>;

export const Muted = ({ children, style }) => <Text style={[s.muted, style]}>{children}</Text>;

export function Button({ title, onPress, variant = 'primary', disabled, loading, style, accessibilityHint }) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: v.bg, borderColor: v.border }, pressed && { opacity: 0.85 }, (disabled || loading) && { opacity: 0.5 }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[s.btnText, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  );
}
const VARIANTS = {
  primary: { bg: colors.blue, fg: '#fff', border: colors.blue },
  secondary: { bg: '#fff', fg: colors.ink, border: colors.line },
  danger: { bg: colors.danger, fg: '#fff', border: colors.danger },
  navy: { bg: colors.navy, fg: '#fff', border: colors.navy }
};

export function Input({ label, error, hint, style, right, ...props }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          placeholderTextColor={colors.ink3}
          accessibilityLabel={label}
          style={[s.input, error && { borderColor: colors.danger }, { flex: 1 }, style]}
          {...props}
        />
        {right}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

/** Liste déroulante en plein écran avec recherche (marques, modèles, magasins…). */
export function Select({ label, value, options, onChange, placeholder = 'Choisir…', searchable = false, error }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options),
    [q, options]
  );
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={[s.input, s.select, error && { borderColor: colors.danger }]}>
        <Text style={{ color: current ? colors.ink : colors.ink3, fontSize: 16 }}>{current?.label ?? placeholder}</Text>
        <Text style={{ color: colors.ink3 }}>▾</Text>
      </Pressable>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ padding: 16, gap: 12, flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.title}>{label ?? 'Choisir'}</Text>
              <Button title="Fermer" variant="secondary" onPress={() => setOpen(false)} style={{ minHeight: 40 }} />
            </View>
            {searchable ? <Input placeholder="Rechercher…" value={q} onChangeText={setQ} autoFocus /> : null}
            <FlatList
              data={filtered}
              keyExtractor={(o) => String(o.value)}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.line }} />}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(item.value, item);
                    setOpen(false);
                    setQ('');
                  }}
                  style={({ pressed }) => [s.option, pressed && { backgroundColor: colors.blueSoft }]}
                >
                  <Text style={{ fontSize: 16, color: colors.ink, fontWeight: item.value === value ? '700' : '400' }}>{item.label}</Text>
                  {item.sub ? <Muted>{item.sub}</Muted> : null}
                </Pressable>
              )}
              ListEmptyComponent={<Muted style={{ padding: 16 }}>Aucun résultat</Muted>}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <View style={s.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[s.segmentItem, active && { backgroundColor: colors.blue }]}
          >
            <Text style={{ color: active ? '#fff' : colors.ink2, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Banner({ tone = 'danger', title, children }) {
  const t = { danger: [colors.dangerBg, colors.danger], ok: [colors.okBg, colors.ok], warn: [colors.warnBg, colors.warn], info: [colors.blueSoft, colors.blue] }[tone];
  return (
    <View style={[s.banner, { backgroundColor: t[0] }]} accessibilityRole="alert">
      {title ? <Text style={{ color: t[1], fontWeight: '700', fontSize: 15 }}>{title}</Text> : null}
      {children ? <Text style={{ color: t[1], fontSize: 14 }}>{children}</Text> : null}
    </View>
  );
}

export const ErrorBanner = ({ error }) => (error ? <Banner tone="danger">{error.message ?? String(error)}</Banner> : null);

export const Loading = () => (
  <View style={{ padding: 32, alignItems: 'center' }}>
    <ActivityIndicator color={colors.blue} size="large" />
  </View>
);

export function Row({ label, value, mono }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{value ?? '—'}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: 16, gap: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 14, color: colors.ink2 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  muted: { fontSize: 13, color: colors.ink3 },
  btn: { minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1 },
  btnText: { fontSize: 16, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: '#fff' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  option: { paddingVertical: 14, paddingHorizontal: 8, gap: 2 },
  error: { color: colors.danger, fontSize: 13 },
  segment: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  banner: { borderRadius: radius.md, padding: 14, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  rowLabel: { color: colors.ink2, fontSize: 14 },
  rowValue: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' }
});
