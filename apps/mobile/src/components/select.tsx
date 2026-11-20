import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import { Icon } from './icons';
import { s } from './ui';

export interface Option {
  value: string;
  label: string;
}

/** Drop-down field: shows the choice, opens a bottom sheet with the options (like a web select). */
export function Select({ label, value, options, onChange, placeholder = 'Choose…', error, disabled }: { label: string; value: string | null; options: Option[]; onChange: (v: string) => void; placeholder?: string; error?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? 'not chosen'}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{ height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: error ? colors.danger : colors.lineStrong, backgroundColor: colors.white, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}
      >
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: current ? colors.ink : colors.ink }}>{current?.label ?? placeholder}</Text>
        <Text style={{ fontSize: 16, color: colors.ink, transform: [{ rotate: '90deg' }] }}>›</Text>
      </Pressable>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(11,20,38,0.45)' }} />
        <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 16, paddingBottom: 34, maxHeight: '70%' }}>
          <Text style={[s.h2, { paddingHorizontal: 20, paddingBottom: 8 }]}>{label}</Text>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            ListEmptyComponent={<Text style={[s.small, { paddingHorizontal: 20, paddingVertical: 12 }]}>Nothing to choose from yet.</Text>}
            renderItem={({ item }) => {
              const on = item.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: pressed ? colors.surface : colors.white })}
                >
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: on ? '800' : '600', color: colors.ink }}>{item.label}</Text>
                  {on ? <Icon name="check" size={20} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
