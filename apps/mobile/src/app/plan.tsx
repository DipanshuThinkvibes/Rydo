import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Place, RideMatch, SavedPlace } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { api, errText } from '@/lib/api';
import { dayLabel, fmtClock, fmtDistance, isoDay, metersBetween } from '@/lib/format';
import { useCurrentLocation } from '@/lib/location';
import { draft, getOffices, getPlaces, searchBody, updateDraft, type Draft } from '@/lib/places';
import { useSession } from '@/lib/session';
import type { Office } from '@/lib/types';
import { Icon } from '@/components/icons';
import { buildSaved, PlacePicker, type Saved } from '@/components/place-picker';
import { FiltersButton, RideFilters } from '@/components/ride-filters';
import { TimeField } from '@/components/time-field';
import { BackButton, Button, Chip, ChipRow, Label, Notice, RoundButton, s } from '@/components/ui';

const DAYS = Array.from({ length: 7 }, (_, i) => isoDay(i));

/** Prototype screen 3: pickup, drop, when, seats and preferences. */
export default function PlanRide() {
  const { features } = useSession();
  const [d, setD] = useState<Draft>(draft.value);
  const [offices, setOffices] = useState<Office[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const here = useCurrentLocation();
  const current: Place | null = here.coords ? { label: 'Current location', ...here.coords } : null;
  const [picking, setPicking] = useState<'pickup' | 'drop' | null>(null);
  const [busy, setBusy] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [error, setError] = useState<string>();
  /** The typed time is a real time (the draft keeps the last good one). */
  const [timeOk, setTimeOk] = useState(true);
  const hasTime = !!d.time;
  const nowHHMM = () => new Date().toTimeString().slice(0, 5);
  const timePast = !d.leaveNow && hasTime && d.date === isoDay(0) && d.time < nowHHMM();
  const timeBad = !d.leaveNow && (!hasTime || !timeOk || timePast);

  useEffect(() => {
    getOffices().then(setOffices, () => undefined);
    getPlaces().then(setPlaces, () => undefined);
  }, []);

  const set = (p: Partial<Draft>) => {
    updateDraft(p);
    setD(draft.value);
    setError(undefined);
  };

  const saved: Saved[] = useMemo(() => buildSaved(places, offices, current), [places, offices, current?.lat, current?.lng]);

  // No pickup yet: start from where the phone is.
  useEffect(() => {
    if (current && !draft.value.pickup) set({ pickup: current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.lat, current?.lng]);

  const when = d.leaveNow ? 'Now' : hasTime ? `${dayLabel(d.date)}, ${fmtClock(d.time)}` : dayLabel(d.date);

  async function find() {
    const body = searchBody(d);
    if (!body) return setError('Choose where you start and where you are going.');
    setBusy(true);
    try {
      const results = await api<RideMatch[]>('POST', '/rides/search', body);
      draft.search = body;
      draft.results = results;
      draft.chosen = results[0] ?? null;
      router.push('/results');
    } catch (e) {
      setError(errText(e, 'Search failed. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const field = (which: 'pickup' | 'drop', value: Place | null, placeholder: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${which === 'pickup' ? 'Pickup' : 'Drop'}: ${value?.label ?? 'not set'}`}
      onPress={() => setPicking(which)}
      style={{ height: 56, borderRadius: 16, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: which === 'pickup' ? colors.surface : colors.white, borderWidth: which === 'drop' ? 2 : 0, borderColor: colors.ink }}
    >
      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: value ? colors.ink : colors.muted }}>{value?.label ?? placeholder}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <BackButton />
        <Text accessibilityRole="header" style={s.h1}>Plan your ride</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 22 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ alignItems: 'center', width: 16 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: colors.ink }} />
            {[0, 1, 2, 3, 4].map((i) => <View key={i} style={{ width: 2, height: 5, marginVertical: 2, backgroundColor: colors.lineStrong }} />)}
            <View style={{ width: 13, height: 13, backgroundColor: colors.inkBg, borderRadius: 2 }} />
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            {field('pickup', d.pickup, 'Pickup: home, a gate or landmark')}
            {field('drop', d.drop, 'Where to?')}
          </View>
          <RoundButton icon="swap" label="Swap pickup and drop" size={46} onPress={() => set({ pickup: d.drop, drop: d.pickup })} />
        </View>

        <View style={{ gap: 12 }}>
          <Label>When</Label>
          <View style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.surface2 }}>
            {[
              { k: true, l: 'Leave now' },
              { k: false, l: 'Schedule' },
            ].map((o) => (
              <Pressable key={o.l} accessibilityRole="tab" accessibilityState={{ selected: d.leaveNow === o.k }} onPress={() => set({ leaveNow: o.k })} style={[{ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, d.leaveNow === o.k && { backgroundColor: colors.white, ...s.lift }]}>
                <Text style={{ fontSize: 15, fontWeight: d.leaveNow === o.k ? '800' : '600', color: d.leaveNow === o.k ? colors.ink : colors.muted }}>{o.l}</Text>
              </Pressable>
            ))}
          </View>
          {!d.leaveNow && (
            <>
              <ChipRow>
                {DAYS.map((day) => <Chip rect key={day} label={dayLabel(day)} selected={d.date === day} onPress={() => set({ date: day })} />)}
              </ChipRow>
              <TimeField
                label="Leave at"
                value={d.time || null}
                onChange={(t) => {
                  setTimeOk(!!t);
                  // Cleared field: no time. A half-typed time keeps the last good one until it is fixed.
                  if (t) set({ time: t });
                }}
                error={timeOk && timePast ? 'That time has already passed today. Type a later time or pick another day.' : undefined}
              />
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label>Seats</Label>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[1, 2, 3].map((n) => (
              <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} seat${n > 1 ? 's' : ''}`} accessibilityState={{ selected: d.seats === n }} onPress={() => set({ seats: n })} style={{ width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: d.seats === n ? colors.inkBg : colors.white, borderWidth: 1.5, borderColor: d.seats === n ? colors.ink : colors.lineStrong }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: d.seats === n ? colors.onInk : colors.ink }}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Vehicle, car type, AC and women-only live behind one Filters button */}
        <FiltersButton d={d} onPress={() => setFiltering(true)} />
        <RideFilters
          visible={filtering}
          d={d}
          womenOnlyAllowed={features.womenOnly !== false}
          onClose={() => setFiltering(false)}
          onApply={(f) => {
            set(f);
            setFiltering(false);
          }}
        />

        {saved.length > 0 && (
          <View style={{ gap: 4 }}>
            <Label>Saved and recent</Label>
            {saved.filter((sv) => sv.key !== 'here').map((sv) => (
              <Pressable key={sv.key} accessibilityRole="button" onPress={() => set({ drop: sv.place })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: sv.icon === 'building' ? colors.inkBg : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={sv.icon} size={20} color={sv.icon === 'building' ? colors.lime : colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={s.strong}>{sv.title}</Text>
                  <Text numberOfLines={1} style={s.small}>
                    {sv.sub}
                    {d.pickup && sv.place !== d.pickup ? ` · ${fmtDistance(metersBetween(d.pickup, sv.place))}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Button label={`Find rides · ${when}`} loading={busy} disabled={!d.pickup || !d.drop || timeBad} onPress={find} />
      </View>

      <PlacePicker
        visible={picking !== null}
        title={picking === 'pickup' ? 'Pickup' : 'Drop'}
        saved={saved}
        onClose={() => setPicking(null)}
        onPick={(p) => {
          set(picking === 'pickup' ? { pickup: p } : { drop: p });
          setPicking(null);
        }}
      />
    </SafeAreaView>
  );
}
