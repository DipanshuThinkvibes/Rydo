import { useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Icon } from './icons';
import type { MapMarker, RouteMapProps } from './route-map-types';
import type { LatLng } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { initials } from '@/lib/format';

/**
 * Browser-preview map (Expo web): real route lines and points from the API drawn with plain views on a
 * stylised street grid. Phones use route-map.native.tsx (Google Maps) instead; both take the same props.
 */

export type { MapMarker, MapRoute } from './route-map-types';

const MAX_POINTS = 70;

function thin(path: LatLng[]) {
  if (path.length <= MAX_POINTS) return path;
  const step = (path.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => path[Math.round(i * step)]);
}

export function RouteMap({ routes = [], markers = [], dark, style, inset, children }: RouteMapProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  const project = useMemo(() => {
    const pts = [...routes.flatMap((r) => r.path), ...markers.map((m) => m.at)];
    if (!pts.length || !size.w) return null;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of pts) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = Math.max((maxLng - minLng) * kx, 0.004);
    const spanY = Math.max(maxLat - minLat, 0.004);
    const pad = { top: (inset?.top ?? 0) + 44, bottom: (inset?.bottom ?? 0) + 44, left: (inset?.left ?? 0) + 40, right: (inset?.right ?? 0) + 40 };
    const w = Math.max(40, size.w - pad.left - pad.right);
    const h = Math.max(40, size.h - pad.top - pad.bottom);
    const scale = Math.min(w / spanX, h / spanY);
    const cx = (minLng + maxLng) / 2;
    const cy = (minLat + maxLat) / 2;
    const ox = pad.left + w / 2;
    const oy = pad.top + h / 2;
    return (p: LatLng) => ({ x: ox + (p.lng - cx) * kx * scale, y: oy - (p.lat - cy) * scale });
  }, [routes, markers, size.w, size.h, inset?.top, inset?.bottom, inset?.left, inset?.right]);

  const bg = dark ? colors.ink : '#EEF1F5';
  return (
    <View onLayout={onLayout} style={[{ backgroundColor: bg, overflow: 'hidden' }, style]} accessibilityLabel="Map of the route" accessible={false}>
      <Streets w={size.w} h={size.h} dark={!!dark} />
      {project &&
        [...routes].sort((a, b) => Number(!!a.active) - Number(!!b.active)).map((r) => (
          <Line key={r.id} points={thin(r.path).map(project)} active={r.active !== false} dark={!!dark} />
        ))}
      {project && markers.map((m) => <Marker key={m.id} m={m} at={project(m.at)} dark={!!dark} />)}
      {!project && markers.length === 0 && size.w > 0 ? <MeDot x={size.w / 2} y={size.h * 0.42} /> : null}
      {children}
    </View>
  );
}

/** Decorative street grid, a park, a lake and a ring road. */
function Streets({ w, h, dark }: { w: number; h: number; dark: boolean }) {
  if (!w) return null;
  const street = dark ? colors.ink3 : colors.white;
  const block = dark ? '#121C31' : '#E6EAF0';
  const cols = Math.ceil(w / 92) + 1;
  const rows = Math.ceil(h / 118) + 1;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, backgroundColor: block }}>
      {Array.from({ length: cols }).map((_, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', left: i * 92 - 6 + (i % 2) * 8, top: 0, bottom: 0, width: i % 3 === 1 ? 14 : 9, backgroundColor: street }} />
      ))}
      {Array.from({ length: rows }).map((_, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', top: i * 118 - 4, left: 0, right: 0, height: i % 2 ? 9 : 13, backgroundColor: street }} />
      ))}
      {!dark && (
        <>
          <View style={{ position: 'absolute', left: w * 0.36, top: h * 0.2, width: 110, height: 120, borderRadius: 14, backgroundColor: '#D6EFD8' }} />
          <View style={{ position: 'absolute', right: -60, top: h * 0.52, width: 190, height: 110, borderRadius: 90, backgroundColor: '#CFE2FA' }} />
          <View style={{ position: 'absolute', left: -w * 0.1, top: h * 0.62, width: w * 1.4, height: 24, backgroundColor: '#F4E3A6', transform: [{ rotate: '-28deg' }] }} />
        </>
      )}
      {dark && <View style={{ position: 'absolute', left: -w * 0.1, top: h * 0.66, width: w * 1.4, height: 18, backgroundColor: colors.ink2, transform: [{ rotate: '-28deg' }] }} />}
    </View>
  );
}

type Pt = { x: number; y: number };

function Segment({ a, b, width, color }: { a: Pt; b: Pt; width: number; color: string }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  return (
    <View
      style={{
        position: 'absolute',
        left: (a.x + b.x) / 2 - (len + width) / 2,
        top: (a.y + b.y) / 2 - width / 2,
        width: len + width,
        height: width,
        borderRadius: width / 2,
        backgroundColor: color,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
      }}
    />
  );
}

/** Ink casing with a lime centre line (prototype style); inactive routes are thin and faint. */
function Line({ points, active, dark }: { points: Pt[]; active: boolean; dark: boolean }) {
  const pairs = points.slice(1).map((p, i) => [points[i], p] as const);
  if (!active)
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: 0.45 }}>
        {pairs.map(([a, b], i) => <Segment key={i} a={a} b={b} width={4} color={dark ? colors.mutedOnDark : colors.muted} />)}
      </View>
    );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {pairs.map(([a, b], i) => <Segment key={`c${i}`} a={a} b={b} width={9} color={dark ? colors.lime : colors.ink} />)}
      {!dark && pairs.map(([a, b], i) => <Segment key={`l${i}`} a={a} b={b} width={4} color={colors.lime} />)}
    </View>
  );
}

/** Current location: a location pin in a white badge, with a soft blue halo. */
function MeDot({ x, y }: Pt) {
  return (
    <View pointerEvents="none" accessibilityLabel="You are here" style={{ position: 'absolute', left: x - 26, top: y - 26, width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(47,107,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.youAreHere }}>
        <Icon name="pin" size={20} color={colors.youAreHere} />
      </View>
    </View>
  );
}

function Marker({ m, at, dark }: { m: MapMarker; at: Pt; dark: boolean }) {
  const place = (size: number): ViewStyle => ({ position: 'absolute', left: at.x - size / 2, top: at.y - size / 2, width: size, height: size });
  const pill = (text: string, side: 'right' | 'top' = 'right') => (
    <View
      style={{
        position: 'absolute',
        ...(side === 'right' ? { left: at.x + 16, top: at.y - 14 } : { left: at.x - 70, top: at.y - 46, width: 140, alignItems: 'center' }),
      }}
    >
      <View style={{ backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 12, height: 28, justifyContent: 'center' }}>
        <Text numberOfLines={1} style={{ color: colors.white, fontSize: 12, fontWeight: '800', maxWidth: 160 }}>{text}</Text>
      </View>
    </View>
  );
  switch (m.kind) {
    case 'me':
      return <MeDot x={at.x} y={at.y} />;
    case 'start':
      return (
        <>
          <View style={[place(22), { borderRadius: 11, backgroundColor: colors.white, borderWidth: 5, borderColor: colors.ink }]} />
          {m.label ? pill(m.label) : null}
        </>
      );
    case 'pickup':
      return (
        <>
          <View style={[place(30), { borderRadius: 15, backgroundColor: colors.white, borderWidth: 6, borderColor: colors.ink }]} />
          {m.label ? pill(m.label) : null}
        </>
      );
    case 'end':
      return (
        <>
          <View style={[place(20), { borderRadius: 4, backgroundColor: colors.ink, borderWidth: 3, borderColor: dark ? colors.white : colors.lime }]} />
          {m.label ? pill(m.label, 'top') : null}
        </>
      );
    case 'car':
      return (
        <View style={[place(40), { borderRadius: 20, backgroundColor: m.inkCar ? colors.ink : colors.lime, borderWidth: 3, borderColor: m.inkCar ? colors.white : colors.ink, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: m.inkCar ? colors.lime : colors.ink, fontSize: 16, fontWeight: '800', transform: [{ rotate: `${m.headingDeg ?? 0}deg` }] }}>▲</Text>
        </View>
      );
    case 'person':
      return (
        <View style={[place(32), { borderRadius: 16, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '800' }}>{initials(m.label ?? '?')}</Text>
        </View>
      );
  }
}
