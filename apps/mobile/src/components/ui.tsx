import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { colors, radius } from '@rydo/ui-tokens';
import { initials } from '@/lib/format';
import { Icon, type IconName } from './icons';

/** Same look as apps/web/src/components/ui.tsx and the RYDO Share prototype: ink / lime / ghost buttons, soft cards, pill chips. */
type Variant = 'primary' | 'lime' | 'ghost' | 'soft' | 'danger' | 'white';

const look: Record<Variant, { bg: string; fg: string; border?: string; shadow?: object }> = {
  primary: { bg: colors.ink, fg: colors.white, shadow: { shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 3 } },
  lime: { bg: colors.lime, fg: colors.ink, shadow: { shadowColor: '#8CBE28', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 3 } },
  ghost: { bg: colors.white, fg: colors.ink, border: colors.lineStrong },
  soft: { bg: colors.surface2, fg: colors.ink },
  danger: { bg: colors.danger, fg: colors.white },
  white: { bg: colors.white, fg: colors.danger },
};

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
  small,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const v = look[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        small && { height: 44, borderRadius: 14, paddingHorizontal: 14 },
        !disabled && v.shadow,
        { backgroundColor: disabled && !loading ? colors.lineStrong : v.bg, transform: [{ scale: pressed ? 0.97 : 1 }] },
        v.border ? { borderWidth: 1.5, borderColor: v.border } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text numberOfLines={1} style={[s.buttonText, small && { fontSize: 14 }, { color: disabled ? colors.white : v.fg }]}>{label}</Text>}
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
export function Card({ children, dark = false, style, onPress }: { children: React.ReactNode; dark?: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const st = [s.card, dark && { backgroundColor: colors.ink, borderWidth: 0 }, style];
  if (onPress)
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...st, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  return <View style={st}>{children}</View>;
}

/** Inline error / success message (web Notice). */
export function Notice({ tone, children }: { tone: 'error' | 'ok' | 'info'; children: React.ReactNode }) {
  const bg = tone === 'error' ? '#FEF2F2' : tone === 'ok' ? colors.successBg : colors.surface2;
  const fg = tone === 'error' ? colors.danger : tone === 'ok' ? colors.successText : colors.muted;
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[s.notice, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 14, fontWeight: '600', flex: 1, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

/** Small status pill (web Badge). */
export function Badge({ tone, children }: { tone: 'success' | 'warning' | 'neutral' | 'ink' | 'lime' | 'women' | 'danger'; children: React.ReactNode }) {
  const t = {
    success: { bg: colors.successBg, fg: colors.successText },
    warning: { bg: colors.warningBg, fg: colors.warningText },
    neutral: { bg: colors.surface2, fg: colors.ink },
    ink: { bg: colors.ink, fg: colors.white },
    lime: { bg: colors.lime, fg: colors.ink },
    women: { bg: colors.womenOnlyBg, fg: colors.womenOnlyText },
    danger: { bg: '#FEE2E2', fg: colors.danger },
  }[tone];
  return (
    <View style={{ alignSelf: 'flex-start', minHeight: 26, borderRadius: radius.chip, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: t.bg }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: t.fg }}>{children}</Text>
    </View>
  );
}

/** Choice pill. `tone="lime"` for on/off preferences, ink for picking one of several. */
export function Chip({ label, selected, onPress, tone = 'ink', disabled, rect }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'ink' | 'lime'; disabled?: boolean; rect?: boolean }) {
  const on = selected ? (tone === 'lime' ? { bg: colors.lime, fg: colors.ink, border: colors.lime } : { bg: colors.ink, fg: colors.white, border: colors.ink }) : { bg: colors.white, fg: colors.ink, border: colors.lineStrong };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [s.chip, rect && { borderRadius: 14, height: 46 }, { backgroundColor: on.bg, borderColor: on.border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}
    >
      <Text style={{ fontSize: 14, fontWeight: '700', color: on.fg }}>{label}</Text>
    </Pressable>
  );
}

/** Initials in a soft circle (RM, PS…). */
export function Avatar({ name, size = 44, tone = 'blue' }: { name: string; size?: number; tone?: 'blue' | 'pink' | 'lime' | 'ink' }) {
  const t = { blue: { bg: '#E3E9FF', fg: '#2B3FA8' }, pink: { bg: '#FDE2EC', fg: '#A3204F' }, lime: { bg: colors.lime, fg: colors.ink }, ink: { bg: colors.ink, fg: colors.white } }[tone];
  return (
    <View accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.36, fontWeight: '800', color: t.fg }}>{initials(name)}</Text>
    </View>
  );
}

/** On/off switch: lime track with an ink knob when on (prototype). */
export function Switch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{ width: 58, height: 34, borderRadius: 17, padding: 4, backgroundColor: value ? colors.lime : colors.lineStrong, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: value ? colors.ink : colors.white, alignSelf: value ? 'flex-end' : 'flex-start' }} />
    </Pressable>
  );
}

/** Round icon button (back, swap, bell…). */
export function RoundButton({ icon, onPress, label, dark, size = 48, dot }: { icon: IconName; onPress: () => void; label: string; dark?: boolean; size?: number; dot?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.ink : colors.white, transform: [{ scale: pressed ? 0.94 : 1 }] },
        s.lift,
      ]}
    >
      <Icon name={icon} size={size * 0.46} color={dark ? colors.white : colors.ink} />
      {dot ? <View style={{ position: 'absolute', top: size * 0.22, right: size * 0.24, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.white }} /> : null}
    </Pressable>
  );
}

export const BackButton = ({ dark }: { dark?: boolean }) => (
  <RoundButton icon="back" label="Back" dark={dark} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
);

/** Square action tile with a caption (Chat, Share trip, Safety). */
export function ActionTile({ icon, label, onPress, dark }: { icon: IconName; label: string; onPress: () => void; dark?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', gap: 8, flex: 1, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: dark ? colors.ink : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={24} color={dark ? colors.lime : colors.ink} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

/** White bottom sheet with a grabber, over a map. */
export function Sheet({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.sheet, style]}>
      <View style={s.grabber} />
      {children}
    </View>
  );
}

/** Small caps label: WHEN, SEATS, PREFERENCES… */
export const Label = ({ children, light, style }: { children: React.ReactNode; light?: boolean; style?: object }) => (
  <Text style={[{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: light ? colors.mutedOnDark : colors.muted, textTransform: 'uppercase' }, style]}>{children}</Text>
);

/** Number + caption box (Pickup 8:44 AM, 9.4 km shared). */
export function Stat({ value, label, dark, big, lime }: { value: string; label: string; dark?: boolean; big?: boolean; lime?: boolean }) {
  return (
    <View style={{ flex: 1, borderRadius: 16, padding: 12, gap: 2, backgroundColor: dark ? colors.ink2 : colors.surface }}>
      {big ? (
        <>
          <Text style={{ fontSize: 22, fontWeight: '800', color: lime ? colors.lime : dark ? colors.white : colors.ink }}>{value}</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: dark ? colors.mutedOnDark : colors.muted }}>{label}</Text>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 13, fontWeight: '600', color: dark ? colors.mutedOnDark : colors.muted }}>{label}</Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: dark ? colors.white : colors.ink }}>{value}</Text>
        </>
      )}
    </View>
  );
}

/** Ride PIN shown as four dark tiles. */
export function PinDigits({ pin }: { pin: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }} accessibilityLabel={`Ride PIN ${pin.split('').join(' ')}`}>
      {pin.split('').map((d, i) => (
        <View key={i} style={{ width: 54, height: 62, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.lime }}>{d}</Text>
        </View>
      ))}
    </View>
  );
}

/** Number plate in a bordered box, split over two lines like the prototype. */
export function Plate({ plate }: { plate: string }) {
  const parts = plate.trim().split(/\s+/);
  const half = Math.ceil(parts.length / 2);
  return (
    <View accessibilityLabel={`Number plate ${plate}`} style={{ borderWidth: 2, borderColor: colors.ink, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', backgroundColor: colors.white }}>
      <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1.5, color: colors.ink, fontVariant: ['tabular-nums'] }}>{parts.slice(0, half).join(' ')}</Text>
      {parts.length > 1 ? <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1.5, color: colors.ink }}>{parts.slice(half).join(' ')}</Text> : null}
    </View>
  );
}

/** − 3 + */
export function Stepper({ value, onChange, min = 1, max = 4, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  const btn = (icon: IconName, next: number, off: boolean, a11y: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} disabled={off} onPress={() => onChange(next)} style={{ width: 46, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.4 : 1 }}>
      <Icon name={icon} size={20} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityLabel={`${label}: ${value}`}>
      {btn('minus', value - 1, value <= min, `Fewer ${label.toLowerCase()}`)}
      <Text style={{ fontSize: 22, fontWeight: '800', minWidth: 22, textAlign: 'center', color: colors.ink }}>{value}</Text>
      {btn('plus', value + 1, value >= max, `More ${label.toLowerCase()}`)}
    </View>
  );
}

/** Horizontally scrolling row of chips. */
export const ChipRow = ({ children }: { children: React.ReactNode }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} style={{ flexGrow: 0 }}>
    {children}
  </ScrollView>
);

export function Loading({ dark }: { dark?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.ink : colors.white }}>
      <ActivityIndicator color={dark ? colors.lime : colors.ink} />
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 6, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.lineStrong }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{title}</Text>
      {children ? <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 }}>{children}</Text> : null}
    </View>
  );
}

export const s = StyleSheet.create({
  button: { height: 56, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  input: { height: 52, borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, paddingHorizontal: 16, fontSize: 16, fontWeight: '600', color: colors.ink },
  inputFocused: { borderColor: colors.ink, backgroundColor: colors.white },
  error: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  h1: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted },
  small: { fontSize: 13, lineHeight: 18, color: colors.muted },
  strong: { fontSize: 16, fontWeight: '800', color: colors.ink },
  card: { backgroundColor: colors.white, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 8, shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  chip: { height: 42, borderRadius: radius.chip, borderWidth: 1.5, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: radius.button, paddingHorizontal: 16, paddingVertical: 12 },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: 20, paddingTop: 10, gap: 14, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginBottom: 2 },
  lift: { shadowColor: colors.ink, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  pillDark: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, height: 38 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lime, shadowColor: '#8CBE28', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  logoDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, borderWidth: 2.4, borderColor: colors.ink },
  logoBar: { position: 'absolute', left: 14, right: 14, top: 17, height: 2.4, borderRadius: 2, backgroundColor: colors.ink, transform: [{ rotate: '-45deg' }] },
});
