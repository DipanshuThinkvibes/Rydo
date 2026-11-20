import { Platform, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '@rydo/ui-tokens';
import { pick, type Picked } from '@/lib/photo';
import { Icon } from './icons';
import { Button, s } from './ui';

/**
 * One photo slot of a driver document (front, back, or a vehicle photo): take a photo or choose one,
 * then a preview with "remove". Uber-style hint under it.
 */
export function DocPhoto({ label, hint, value, onChange }: { label: string; hint?: string; value: Picked | null; onChange: (p: Picked | null) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      {value ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: colors.surface }}>
          <Image source={{ uri: value.uri }} style={{ width: 96, height: 68, borderRadius: 10, backgroundColor: colors.surface2 }} contentFit="cover" accessibilityLabel={`${label} preview`} />
          <Text style={[s.small, { flex: 1 }]} numberOfLines={1}>{value.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={() => onChange(null)} hitSlop={8}>
            <Icon name="close" size={18} color={colors.danger} />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {Platform.OS !== 'web' ? <Button small variant="ghost" label="Take photo" style={{ flex: 1 }} onPress={() => pick(true).then((f) => f && onChange(f))} /> : null}
          <Button small variant="ghost" label="Choose photo" style={{ flex: 1 }} onPress={() => pick(false).then((f) => f && onChange(f))} />
        </View>
      )}
      {hint ? <Text style={s.small}>{hint}</Text> : null}
    </View>
  );
}

/** The records-check result under a document: green ticks, amber "look at this", red crosses. */
export function CheckNotes({ notes }: { notes: string[] }) {
  return (
    <View style={{ gap: 4 }}>
      {notes.map((n) => {
        const ok = n.startsWith('✓');
        const fail = n.startsWith('✗');
        return (
          <Text key={n} style={{ fontSize: 13, lineHeight: 19, color: ok ? colors.successText : fail ? colors.danger : colors.warningText }}>
            {ok ? '✓' : fail ? '✗' : '!'} {n.slice(2)}
          </Text>
        );
      })}
    </View>
  );
}
