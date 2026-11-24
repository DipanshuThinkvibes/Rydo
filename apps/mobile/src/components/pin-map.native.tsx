import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { colors, isDark } from '@/lib/theme';
import { LIGHT_STYLE, useGoogle } from './route-map.native';
import { Icon } from './icons';
import type { PinMapProps } from './pin-map-types';

/** Street level: close enough to pick a gate or a doorstep. */
const ZOOM = { latitudeDelta: 0.0035, longitudeDelta: 0.0035 };

/**
 * A map with a pin fixed in its middle: drag the map (or tap a spot) to move the pin to the exact place.
 * Same props as the browser preview in pin-map.tsx.
 */
export function PinMap({ start, jumpTo, onMove, onDragStart, dark: darkProp, style }: PinMapProps) {
  const dark = darkProp ?? isDark();
  const ref = useRef<MapView>(null);
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    if (jumpTo) ref.current?.animateToRegion({ latitude: jumpTo.at.lat, longitude: jumpTo.at.lng, ...ZOOM }, 350);
  }, [jumpTo?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: dark ? colors.inkBg : '#EEF1F5' }, style]}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        provider={useGoogle ? PROVIDER_GOOGLE : undefined}
        customMapStyle={useGoogle ? LIGHT_STYLE : undefined}
        initialRegion={{ latitude: start.lat, longitude: start.lng, ...ZOOM }}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onPanDrag={() => {
          if (!lifted) {
            setLifted(true);
            onDragStart?.();
          }
        }}
        onPress={(e) => ref.current?.animateToRegion({ ...e.nativeEvent.coordinate, ...ZOOM }, 250)}
        onRegionChangeComplete={(r) => {
          setLifted(false);
          onMove({ lat: r.latitude, lng: r.longitude });
        }}
        accessibilityLabel="Map. Drag it to put the pin on the exact spot."
      />
      <CenterPin lifted={lifted} />
    </View>
  );
}

/** The pin drawn over the map's middle (it does not catch touches, so the map under it can be dragged). */
export function CenterPin({ lifted }: { lifted: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', transform: [{ translateY: lifted ? -30 : -22 }] }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkBg, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.lime, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
          <Icon name="pin" size={22} color={colors.lime} />
        </View>
        <View style={{ width: 3, height: 12, backgroundColor: colors.inkBg }} />
      </View>
      {/* Shadow dot marks the exact spot. */}
      <View style={{ position: 'absolute', width: lifted ? 10 : 8, height: lifted ? 10 : 8, borderRadius: 5, backgroundColor: 'rgba(11,20,38,0.35)' }} />
    </View>
  );
}
