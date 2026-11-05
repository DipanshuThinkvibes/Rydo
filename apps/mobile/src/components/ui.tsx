import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius } from '@rydo/ui-tokens';

export function Button({ label, onPress, disabled, loading, variant = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'lime' | 'ghost' }) {
  const bg = variant === 'primary' ? colors.ink : variant === 'lime' ? colors.lime : colors.white;
  const fg = variant === 'primary' ? colors.white : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: bg, opacity: disabled && !loading ? 0.5 : pressed ? 0.85 : 1 }, variant === 'ghost' && s.ghost]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={s.input} {...props} />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export const s = StyleSheet.create({
  button: { height: 56, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  ghost: { borderWidth: 1.5, borderColor: colors.lineStrong },
  buttonText: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink },
  input: { height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, paddingHorizontal: 16, fontSize: 16, fontWeight: '600', color: colors.ink },
  error: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  h1: { fontSize: 26, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted },
});