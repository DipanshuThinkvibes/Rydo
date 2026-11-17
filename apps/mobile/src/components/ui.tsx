import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius } from '@rydo/ui-tokens';

/** Same look as apps/web/src/components/ui.tsx: ink / lime / ghost / soft buttons, 2xl radius, soft shadows. */
type Variant = 'primary' | 'lime' | 'ghost' | 'soft' | 'danger';

const look: Record<Variant, { bg: string; fg: string; border?: string; shadow?: object }> = {
  primary: { bg: colors.ink, fg: colors.white, shadow: { shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 3 } },
  lime: { bg: colors.lime, fg: colors.ink, shadow: { shadowColor: '#8CBE28', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 3 } },
  ghost: { bg: colors.white, fg: colors.ink, border: colors.lineStrong },
  soft: { bg: colors.surface2, fg: colors.ink },
  danger: { bg: colors.danger, fg: colors.white },
};

export function Button({ label, onPress, disabled, loading, variant = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: Variant }) {
  const v = look[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        v.shadow,
        { backgroundColor: v.bg, opacity: disabled && !loading ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        v.border ? { borderWidth: 1.5, borderColor: v.border } : null,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[s.buttonText, { color: v.fg }]}>{label}</Text>}
    </Pressable>
  );
}

/** Text input: surface fill, turns white with an ink border on focus (like the web fields). */
export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[s.input, focused && s.inputFocused]}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/** The lime RYDO mark and word, same as the web Logo. */
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityRole="header" accessibilityLabel="RYDO">
      <View style={s.logoBox}>
        <View style={[s.logoDot, { left: 8, bottom: 8 }]} />
        <View style={[s.logoDot, { right: 8, top: 8 }]} />
        <View style={s.logoBar} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: 3, color: light ? colors.white : colors.ink }}>RYDO</Text>
    </View>
  );
}

/** White rounded card with a soft shadow (web Card). */
export function Card({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <View style={[s.card, dark && { backgroundColor: colors.ink, borderWidth: 0 }]}>{children}</View>;
}

/** Inline error / success message (web Notice). */
export function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  const error = tone === 'error';
  return (
    <View accessibilityRole={error ? 'alert' : undefined} style={[s.notice, { backgroundColor: error ? '#FEF2F2' : colors.successBg }]}>
      <Text style={{ color: error ? colors.danger : colors.successText, fontSize: 14, fontWeight: '600', flex: 1 }}>{children}</Text>
    </View>
  );
}

/** Small status pill (web Badge). */
export function Badge({ tone, children }: { tone: 'success' | 'warning' | 'neutral' | 'ink' | 'lime'; children: React.ReactNode }) {
  const t = {
    success: { bg: colors.successBg, fg: colors.successText },
    warning: { bg: colors.warningBg, fg: colors.warningText },
    neutral: { bg: colors.surface2, fg: colors.ink },
    ink: { bg: colors.ink, fg: colors.white },
    lime: { bg: colors.lime, fg: colors.ink },
  }[tone];
  return (
    <View style={{ alignSelf: 'flex-start', height: 24, borderRadius: radius.chip, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: t.bg }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: t.fg }}>{children}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  button: { height: 52, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { fontSize: 15, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  input: { height: 52, borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, paddingHorizontal: 16, fontSize: 16, fontWeight: '600', color: colors.ink },
  inputFocused: { borderColor: colors.ink, backgroundColor: colors.white },
  error: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  h1: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted },
  card: { backgroundColor: colors.white, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 8, shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: radius.button, paddingHorizontal: 16, paddingVertical: 12 },
  logoBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lime, shadowColor: '#8CBE28', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  logoDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, borderWidth: 2.4, borderColor: colors.ink },
  logoBar: { position: 'absolute', left: 14, right: 14, top: 17, height: 2.4, borderRadius: 2, backgroundColor: colors.ink, transform: [{ rotate: '-45deg' }] },
});
