import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LatLng } from '@rydo/shared';
import { colors, isDark } from '@/lib/theme';
import { Icon, type IconName } from './icons';
import type { PinMapProps } from './pin-map-types';

/** About 20 m per tap, in degrees (Bengaluru latitude). */
const STEP = 0.00018;

/**
 * Browser preview (Expo web) of the pin map: no map tiles here, so the pin is moved with arrow buttons.
 * Phones use pin-map.native.tsx (Google Maps, drag the map) instead; both take the same props.
 */
export function PinMap({ start, jumpTo, onMove, dark: darkProp, style }: PinMapProps) {
  const dark = darkProp ?? isDark();
  const [at, setAt] = useState<LatLng>(start);
  useEffect(() => {
    if (jumpTo) setAt(jumpTo.at);
  }, [jumpTo?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onMove(at), [at.lat, at.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const nudge = (dLat: number, dLng: number) => setAt((p) => ({ lat: p.lat + dLat, lng: p.lng + dLng }));
  const arrow = (icon: IconName, label: string, rotate: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ transform: [{ rotate }] }}>
        <Icon name={icon} size={18} />
      </View>
    </Pressable>
  );
  const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(11,20,38,0.06)';
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: dark ? colors.inkBg : '#EEF1F5', alignItems: 'center', justifyContent: 'center' }, style]}>
      {Array.from({ length: 12 }, (_, i) => (
        <View key={`h${i}`} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: `${i * 9}%`, height: 1, backgroundColor: grid }} />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <View key={`v${i}`} pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * 9}%`, width: 1, backgroundColor: grid }} />
      ))}
      <View style={{ alignItems: 'center', gap: 6 }}>
        {arrow('next', 'Move the pin north', '-90deg', () => nudge(STEP, 0))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {arrow('next', 'Move the pin west', '180deg', () => nudge(0, -STEP))}
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.inkBg, borderWidth: 3, borderColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pin" size={24} color={colors.lime} />
          </View>
          {arrow('next', 'Move the pin east', '0deg', () => nudge(0, STEP))}
        </View>
        {arrow('next', 'Move the pin south', '90deg', () => nudge(-STEP, 0))}
        <Text style={{ marginTop: 6, fontSize: 12, color: colors.muted }}>
          {at.lat.toFixed(5)}, {at.lng.toFixed(5)} · drag the map in the phone app
        </Text>
      </View>
    </View>
  );
}
