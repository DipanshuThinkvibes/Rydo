import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as Location from 'expo-location';
import type { LatLng, Place } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { metresBetween, reverseGeocode } from '@/lib/places';
import { Icon } from './icons';
import { PinMap } from './pin-map';
import { Button, RoundButton, s } from './ui';

/** Bengaluru centre: where "Set location on map" opens when nothing better is known. */
export const DEFAULT_PIN: LatLng = { lat: 12.9716, lng: 77.5946 };

/** A label that says nothing about the place itself: replace it with the address under the pin. */
const GENERIC = ['Current location', 'Pinned location'];

/**
 * Put the pin on the exact spot: the map opens at `start` with a pin in its middle; drag the map (or tap) to move it.
 * The address under the pin is looked up when the map stops. A searched place keeps its name while the pin stays
 * within a few metres of it.
 */
export function PinAdjust({ start, here, title, onConfirm, onBack }: { start: Place; here?: LatLng | null; title: string; onConfirm: (p: Place) => void; onBack: () => void }) {
  const [at, setAt] = useState<LatLng>({ lat: start.lat, lng: start.lng });
  const [address, setAddress] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [moving, setMoving] = useState(false);
  const [jump, setJump] = useState<{ at: LatLng; key: number }>();
  const [mine, setMine] = useState<LatLng | null>(here ?? null);
  const seq = useRef(0);

  // No location passed in (e.g. saving a home address): use the phone's last known spot if location is already allowed.
  // Never asks for permission here. "Set location on map" without a location then opens where the person is.
  useEffect(() => {
    if (here) return;
    let alive = true;
    Location.getForegroundPermissionsAsync()
      .then((perm) => (perm.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => {
        if (!alive || !pos) return;
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMine(p);
        if (start.lat === DEFAULT_PIN.lat && start.lng === DEFAULT_PIN.lng) setJump({ at: p, key: Date.now() });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const keepsName = !GENERIC.includes(start.label) && metresBetween(start, at) < 15;

  useEffect(() => {
    setMoving(false);
    if (keepsName) {
      setAddress(null);
      return;
    }
    const n = ++seq.current;
    setLooking(true);
    const t = setTimeout(() => {
      reverseGeocode(at)
        .then((label) => n === seq.current && setAddress(label))
        .catch(() => n === seq.current && setAddress(null))
        .finally(() => n === seq.current && setLooking(false));
    }, 450);
    return () => clearTimeout(t);
  }, [at.lat, at.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = keepsName ? start.label : address ?? (GENERIC.includes(start.label) ? 'Pinned location' : `Near ${start.label}`);
  const busy = moving || (looking && !keepsName);

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
        <RoundButton icon="back" label="Back to search" onPress={onBack} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{title}</Text>
          <Text style={s.small}>Drag the map to put the pin on the exact spot</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <PinMap start={start} jumpTo={jump} onDragStart={() => setMoving(true)} onMove={setAt} style={{ flex: 1 }} />
        {mine ? (
          <View style={{ position: 'absolute', right: 16, bottom: 16 }}>
            <RoundButton icon="pin" label="Use my location" onPress={() => setJump({ at: mine, key: Date.now() })} />
          </View>
        ) : null}
      </View>
      <View style={{ padding: 20, paddingBottom: 30, gap: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pin" size={18} />
          </View>
          <View style={{ flex: 1 }}>
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={colors.ink} />
                <Text style={s.small}>{moving ? 'Move the map, then let go' : 'Finding the address…'}</Text>
              </View>
            ) : (
              <Text numberOfLines={2} style={s.strong}>{label}</Text>
            )}
            <Text style={s.small}>{at.lat.toFixed(5)}, {at.lng.toFixed(5)}</Text>
          </View>
        </View>
        <Button label="Confirm this spot" disabled={busy} onPress={() => onConfirm({ label: label.slice(0, 200), lat: at.lat, lng: at.lng })} />
      </View>
    </View>
  );
}
