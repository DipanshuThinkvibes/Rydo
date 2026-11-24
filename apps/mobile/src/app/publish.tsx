import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Place, RoutePreview, SavedPlace } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { api, errText } from '@/lib/api';
import { fmtKm, fmtMin } from '@/lib/format';
import { commuteEnds, getOffices, getPlaces } from '@/lib/places';
import { useSession } from '@/lib/session';
import type { DriverProfile, Office } from '@/lib/types';
import { buildSaved, PlacePicker, type Saved } from '@/components/place-picker';
import { TimeField } from '@/components/time-field';
import { BackButton, Button, Chip, Label, Notice, s, Stepper, Switch } from '@/components/ui';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Prototype screen 12: publish a one-off or repeating ride. */
export default function Publish() {
  const { features } = useSession();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null);
  // Times are typed by the driver; nothing is suggested. null = not typed yet (or not a real time).
  const [depart, setDepart] = useState<string | null>(null);
  const [withReturn, setWithReturn] = useState(true);
  const [back, setBack] = useState<string | null>(null);
  const returnBeforeLeave = withReturn && !!depart && !!back && back <= depart;
  const timesOk = !!depart && (!withReturn || (!!back && !returnBeforeLeave));
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [seats, setSeats] = useState(3);
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [womenOnly, setWomenOnly] = useState(false);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<DriverProfile | null>('GET', '/driver/profile').then((p) => {
      setProfile(p);
      const v = p?.vehicles.find((x) => x.isDefault) ?? p?.vehicles[0];
      if (v) {
        setVehicleId(v.id);
        setSeats(Math.min(3, v.type === 'BIKE' ? 1 : v.seatCapacity));
      }
    }, () => undefined);
    Promise.all([getOffices().catch(() => [] as Office[]), getPlaces().catch(() => [] as SavedPlace[])]).then(([o, mine]) => {
      setOffices(o);
      setPlaces(mine);
      // Default home → default office (the usual morning ride).
      const ends = commuteEnds(mine, o);
      if (ends.home) setOrigin((cur) => cur ?? ends.home);
      if (ends.office) setDestination((cur) => cur ?? ends.office);
    });
  }, []);

  useEffect(() => {
    setPreview(null);
    if (!origin || !destination) return;
    const q = `fromLat=${origin.lat}&fromLng=${origin.lng}&toLat=${destination.lat}&toLng=${destination.lng}`;
    api<RoutePreview>('GET', `/maps/route?${q}`).then(setPreview, () => undefined);
  }, [origin, destination]);

  const vehicle = profile?.vehicles.find((v) => v.id === vehicleId);
  const maxSeats = vehicle ? (vehicle.type === 'BIKE' ? 1 : vehicle.seatCapacity) : 4;
  const saved: Saved[] = useMemo(() => buildSaved(places, offices), [places, offices]);
  const dayText = days.join() === '1,2,3,4,5' ? 'Mon–Fri' : days.length ? days.map((d) => DAYS[d - 1]).join(' ') : 'pick days';

  async function publish() {
    if (!origin || !destination || !vehicleId) return;
    setBusy(true);
    setError(undefined);
    try {
      await api('POST', '/ride-plans', { vehicleId, origin, destination, departTime: depart, returnTime: withReturn ? back : undefined, daysOfWeek: days, seats, womenOnly });
      Alert.alert('Ride published', 'Colleagues on your route can request seats now. You will get a pop-up for each request.');
      router.back();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const placeRow = (which: 'origin' | 'destination', p: Place | null) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${which === 'origin' ? 'From' : 'To'}: ${p?.label ?? 'not set'}`} onPress={() => setPicking(which)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
      <View style={which === 'origin' ? { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.lime } : { width: 15, height: 15, borderRadius: 3, backgroundColor: colors.lime }} />
      <Text numberOfLines={1} style={{ flex: 1, color: p ? colors.onPanel : colors.panelMuted, fontSize: 16, fontWeight: '800' }}>{p ? p.label : which === 'origin' ? 'Where do you start?' : 'Where are you going?'}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 8 }}>
        <BackButton />
        <Text accessibilityRole="header" style={s.h1}>Publish a ride</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130, gap: 22 }}>
        <View style={{ backgroundColor: colors.panel, borderRadius: 22, padding: 18, gap: 10 }}>
          {placeRow('origin', origin)}
          {placeRow('destination', destination)}
          <Text style={{ color: colors.panelMuted, fontSize: 14 }}>{preview ? `${fmtKm(preview.distanceMeters)} · about ${fmtMin(preview.durationSeconds)} · riders on this route get matched` : 'Tap a line to change it'}</Text>
        </View>

        <View style={{ gap: 12 }}>
          <TimeField label="Leave at" value={depart} onChange={setDepart} />
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.strong}>Return trip in the evening</Text>
            <Switch label="Return trip in the evening" value={withReturn} onChange={setWithReturn} />
          </View>
          {withReturn && <TimeField label="Return at" pm placeholder="6:30" value={back} onChange={setBack} error={returnBeforeLeave ? 'The return must be later than the time you leave.' : undefined} />}
        </View>

        <View style={{ gap: 12 }}>
          <Label>Vehicle</Label>
          {!profile?.vehicles.length ? <Notice tone="info">Add your vehicle on the RYDO web app first (Drive page).</Notice> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {profile?.vehicles.map((v) => (
              <Pressable
                key={v.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: v.id === vehicleId }}
                onPress={() => {
                  setVehicleId(v.id);
                  setSeats((n) => Math.min(n, v.type === 'BIKE' ? 1 : v.seatCapacity));
                }}
                style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 18, padding: 14, gap: 4, borderWidth: 2, borderColor: v.id === vehicleId ? colors.ink : colors.line }}
              >
                <Text style={s.strong}>{v.make} {v.model}</Text>
                <Text style={s.small}>{v.type === 'BIKE' ? 'Bike' : `${v.color}${v.hasAc ? ' · AC' : ''}`} · {v.plateNumber}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={s.strong}>Seats to offer</Text>
            <Text style={s.small}>Up to {maxSeats} on this {vehicle?.type === 'BIKE' ? 'bike' : 'car'}</Text>
          </View>
          <Stepper label="Seats" value={seats} onChange={setSeats} min={1} max={maxSeats} />
        </View>

        <View style={{ gap: 12 }}>
          <Label>Repeat on</Label>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {DAYS.map((d, i) => {
              const n = i + 1;
              const on = days.includes(n);
              return (
                <Pressable key={d} accessibilityRole="checkbox" accessibilityLabel={d} accessibilityState={{ checked: on }} onPress={() => setDays((x) => (on ? x.filter((y) => y !== n) : [...x, n].sort()))} style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.lime : colors.white, borderWidth: 1.5, borderColor: on ? colors.lime : colors.lineStrong }}>
                  <Text style={{ fontWeight: '800', color: on ? colors.onLime : colors.ink }}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {features.womenOnly !== false && (
          <View style={{ gap: 12 }}>
            <Label>Ride preferences</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip tone="lime" label="Women riders only" selected={womenOnly} onPress={() => setWomenOnly(!womenOnly)} />
            </View>
          </View>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Button label={`Publish · ${seats} seat${seats > 1 ? 's' : ''}, ${dayText}`} loading={busy} disabled={!origin || !destination || !vehicleId || days.length === 0 || !timesOk} onPress={publish} />
      </View>

      <PlacePicker
        visible={picking !== null}
        title={picking === 'origin' ? 'Start' : 'Destination'}
        saved={saved}
        onClose={() => setPicking(null)}
        onPick={(p) => {
          if (picking === 'origin') setOrigin(p);
          else setDestination(p);
          setPicking(null);
        }}
      />
    </SafeAreaView>
  );
}
