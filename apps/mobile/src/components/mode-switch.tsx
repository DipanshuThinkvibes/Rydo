import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/lib/theme';
import { s } from './ui';

/** Ride / Drive switch at the top of Home and Drive. */
export function ModeSwitch({ mode, dark }: { mode: 'ride' | 'drive'; dark?: boolean }) {
  const item = (key: 'ride' | 'drive', label: string) => {
    const on = key === mode;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => !on && router.replace(key === 'ride' ? '/' : '/drive')}
        style={{ height: 40, paddingHorizontal: 20, borderRadius: 20, justifyContent: 'center', backgroundColor: on ? (dark ? colors.lime : colors.inkBg) : 'transparent' }}
      >
        <Text style={{ fontSize: 15, fontWeight: '800', color: on ? (dark ? colors.onLime : colors.onInk) : dark ? colors.panelMuted : colors.ink }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', padding: 4, borderRadius: 24, backgroundColor: dark ? colors.panel : colors.white }, s.lift]}>
      {item('ride', 'Ride')}
      {item('drive', 'Drive')}
    </View>
  );
}
