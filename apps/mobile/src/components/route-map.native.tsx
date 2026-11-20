import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LatLng } from '@rydo/shared';
import { colors, isDark } from '@/lib/theme';
import { initials } from '@/lib/format';
import { Icon } from './icons';
import type { MapMarker, RouteMapProps } from './route-map-types';

export type { MapMarker, MapRoute } from './route-map-types';

/**
 * Real Google map on phones (react-native-maps). Same props as the browser-preview map in route-map.tsx.
 * Android always uses Google Maps. iOS uses Google Maps in a development or store build when
 * GOOGLE_MAPS_IOS_KEY is set (app.config.ts), and Apple Maps in Expo Go (which cannot load Google Maps on iOS).
 */

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const iosGoogleKey = (Constants.expoConfig?.ios?.config as { googleMapsApiKey?: string } | undefined)?.googleMapsApiKey;
const useGoogle = Platform.OS === 'android' || (Platform.OS === 'ios' && !!iosGoogleKey && !inExpoGo);

/** Bengaluru: where the map opens before any point is known. */
const DEFAULT_REGION = { latitude: 12.9352, longitude: 77.6245, latitudeDelta: 0.09, longitudeDelta: 0.09 };

const toCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

/** Quiet map (no shop, transit or road icons) on both the light and the dark Google map. */
const LIGHT_STYLE = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

export function RouteMap({ routes = [], markers = [], dark: darkProp, style, inset, children }: RouteMapProps) {
  // Follows the app theme unless a screen asks for a dark map (driver screens).
  const dark = darkProp ?? isDark();
  const ref = useRef<MapView>(null);
  const [ready, setReady] = useState(false);

  const points = useMemo(() => [...routes.flatMap((r) => r.path), ...markers.map((m) => m.at)], [routes, markers]);
  // Refit only when the set of points really changes (not on every live-location tick).
  const fitKey = useMemo(() => {
    const fixed = [...routes.flatMap((r) => [r.path[0], r.path[r.path.length - 1]]), ...markers.filter((m) => m.kind !== 'car').map((m) => m.at)].filter(Boolean);
    return fixed.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|') + `#${routes.length}`;
  }, [routes, markers]);

  useEffect(() => {
    if (!ready || !ref.current || points.length === 0) return;
    const pad = { top: (inset?.top ?? 0) + 50, bottom: (inset?.bottom ?? 0) + 50, left: (inset?.left ?? 0) + 40, right: (inset?.right ?? 0) + 40 };
    if (points.length === 1) {
      ref.current.animateToRegion({ ...toCoord(points[0]), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    } else {
      ref.current.fitToCoordinates(points.map(toCoord), { edgePadding: pad, animated: true });
    }
    // fitKey stands in for points; see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey, inset?.top, inset?.bottom]);

  const ordered = [...routes].sort((a, b) => Number(!!a.active) - Number(!!b.active));

  return (
    <View style={[{ backgroundColor: dark ? colors.inkBg : '#EEF1F5', overflow: 'hidden' }, style]}>
      <MapView
        // Google's own light or dark map, matching the app (the default follows the phone's setting).
        // Screens redraw when the theme changes, so the map is always created with the right scheme.
        userInterfaceStyle={dark ? 'dark' : 'light'}
        ref={ref}
        style={{ flex: 1 }}
        provider={useGoogle ? PROVIDER_GOOGLE : undefined}
        customMapStyle={useGoogle ? LIGHT_STYLE : undefined}
        initialRegion={DEFAULT_REGION}
        onMapReady={() => setReady(true)}
        showsUserLocation={false}
        toolbarEnabled={false}
        showsCompass={false}
        pitchEnabled={false}
        rotateEnabled={false}
        accessibilityLabel="Map of the route"
      >
        {ordered.map((r) =>
          r.path.length < 2 ? null : r.active === false ? (
            <Polyline key={r.id} coordinates={r.path.map(toCoord)} strokeColor={dark ? 'rgba(184,194,214,0.55)' : 'rgba(90,101,120,0.55)'} strokeWidth={4} zIndex={1} />
          ) : dark ? (
            <Polyline key={r.id} coordinates={r.path.map(toCoord)} strokeColor={colors.lime} strokeWidth={6} zIndex={3} />
          ) : (
            [
              <Polyline key={`${r.id}-c`} coordinates={r.path.map(toCoord)} strokeColor={colors.ink} strokeWidth={9} zIndex={2} />,
              <Polyline key={`${r.id}-l`} coordinates={r.path.map(toCoord)} strokeColor={colors.lime} strokeWidth={4} zIndex={3} />,
            ]
          ),
        )}
        {markers.map((m) => (
          <SettledMarker key={m.id} m={m} dark={!!dark} />
        ))}
      </MapView>
      {children ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** Where on the marker view the map point sits (labels sit above their dot). */
function anchorOf(m: MapMarker) {
  if (m.kind === 'place') return { x: 0.5, y: 1 };
  if (m.label && (m.kind === 'pickup' || m.kind === 'end' || m.kind === 'start')) return { x: 0.5, y: 0.82 };
  return { x: 0.5, y: 0.5 };
}

/** Current location: a location pin in a white badge, with a soft blue halo. */
/**
 * Android draws a custom marker from a snapshot. Taken too early the snapshot is blank or half drawn,
 * so a marker keeps redrawing for a moment after it appears (cars always redraw: they move).
 */
function SettledMarker({ m, dark }: { m: MapMarker; dark: boolean }) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const t = setTimeout(() => setTracking(false), 800);
    return () => clearTimeout(t);
  }, [m.kind, m.label, dark]);
  return (
    <Marker coordinate={toCoord(m.at)} anchor={anchorOf(m)} tracksViewChanges={m.kind === 'car' || tracking} zIndex={m.kind === 'car' ? 10 : m.kind === 'me' ? 8 : 5}>
      <Pin m={m} dark={dark} />
    </Marker>
  );
}

function MeIcon() {
  return (
    <View accessibilityLabel="You are here" style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(47,107,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.youAreHere }}>
        <Icon name="pin" size={20} color={colors.youAreHere} />
      </View>
    </View>
  );
}

/** A saved address on the map: its name in a small card above a pin with a house or building icon. */
function Bookmark({ m }: { m: MapMarker }) {
  const fill = m.isDefault ? colors.lime : '#FFFFFF';
  const fg = m.isDefault ? colors.onLime : '#0B1426';
  return (
    <View accessibilityLabel={m.label ? `Saved place: ${m.label}` : 'Saved place'} style={{ alignItems: 'center' }}>
      {m.label ? (
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 8, height: 24, justifyContent: 'center', marginBottom: 3, borderWidth: 1, borderColor: '#D7DCE5' }}>
          <Text numberOfLines={1} style={{ color: '#0B1426', fontSize: 12, fontWeight: '800', maxWidth: 140 }}>{m.label}</Text>
        </View>
      ) : null}
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: fill, borderWidth: 2, borderColor: '#0B1426', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={m.icon ?? 'pin'} size={17} color={fg} />
      </View>
      <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#0B1426', marginTop: -1 }} />
    </View>
  );
}

function Label({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.inkBg, borderRadius: 999, paddingHorizontal: 12, height: 28, justifyContent: 'center', marginBottom: 6 }}>
      <Text numberOfLines={1} style={{ color: colors.onInk, fontSize: 12, fontWeight: '800', maxWidth: 180 }}>{text}</Text>
    </View>
  );
}

function Pin({ m, dark }: { m: MapMarker; dark: boolean }) {
  const withLabel = (dot: React.ReactNode) => (
    <View style={{ alignItems: 'center' }}>
      {m.label ? <Label text={m.label} /> : null}
      {dot}
    </View>
  );
  switch (m.kind) {
    case 'me':
      return <MeIcon />;
    case 'place':
      return <Bookmark m={m} />;
    case 'start':
      return withLabel(<View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, borderWidth: 5, borderColor: colors.ink }} />);
    case 'pickup':
      return withLabel(<View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, borderWidth: 6, borderColor: colors.ink }} />);
    case 'end':
      return withLabel(<View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: colors.inkBg, borderWidth: 3, borderColor: dark ? colors.white : colors.lime }} />);
    case 'car': {
      const ink = !!m.inkCar;
      return (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ink ? colors.inkBg : colors.lime, borderWidth: 3, borderColor: ink ? colors.white : colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: ink ? colors.lime : colors.ink, fontSize: 16, fontWeight: '800', transform: [{ rotate: `${m.headingDeg ?? 0}deg` }] }}>▲</Text>
        </View>
      );
    }
    case 'person':
      return (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '800' }}>{initials(m.label ?? '?')}</Text>
        </View>
      );
  }
}
