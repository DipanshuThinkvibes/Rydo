import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CommuteDayView, Place, SavedPlace } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { api } from '@/lib/api';
import { fmtClock } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useCurrentLocation } from '@/lib/location';
import { commuteEnds, getOffices, getPlaces, savedPlace, updateDraft } from '@/lib/places';
import type { Office } from '@/lib/types';
import { Icon } from '@/components/icons';
import { buildSaved, PlacePicker } from '@/components/place-picker';
import { SavedPlaces } from '@/components/saved-places';
import { BackButton, Button, Label, Loading, s } from '@/components/ui';

interface Data {
  places: SavedPlace[];
  offices: Office[];
  week: CommuteDayView[];
}

/**
 * "To office" / "To home" from the Home screen: search and save the destination address (several allowed,
 * one default), pick where you start, and find rides between them.
 */
export default function ToPlace() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const toOffice = kind !== 'home';
  const destKind = toOffice ? 'OFFICE' : 'HOME';
  const here = useCurrentLocation();
  const current: Place | null = here.coords ? { label: 'Current location', ...here.coords } : null;
  const [destId, setDestId] = useState<string | null>(null);
  const [from, setFrom] = useState<Place | null>(null);
  const [picking, setPicking] = useState(false);

  const { data, reload } = useData<Data>(async () => {
    const [places, offices, week] = await Promise.all([
      getPlaces(),
      getOffices().catch(() => [] as Office[]),
      api<CommuteDayView[]>('GET', '/me/commute?days=7').catch(() => [] as CommuteDayView[]),
    ]);
    return { places, offices, week };
  }, []);

  // Start: default home (to office) or default office (to home); else where the phone is.
  useEffect(() => {
    if (!data || from) return;
    const ends = commuteEnds(data.places, data.offices);
    const start = toOffice ? ends.home : ends.office;
    if (start) setFrom(start);
    else if (current) setFrom(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, current?.lat]);

  if (!data) return <Loading />;

  const mine = data.places.filter((p) => p.label === destKind);
  const dest = mine.find((p) => p.id === destId) ?? mine.find((p) => p.isDefault) ?? mine[0] ?? null;
  // To office without a saved office: fall back to the company office.
  const destPlace: Place | null = dest ? savedPlace(dest) : toOffice ? commuteEnds([], data.offices).office : null;
  const usual = data.week.find((d) => d.status === 'OFFICE');
  const usualTime = toOffice ? usual?.toOfficeTime : usual?.toHomeTime;
  const noun = toOffice ? 'office' : 'home';

  const find = () => {
    if (!from || !destPlace) return;
    updateDraft({ pickup: from, drop: destPlace, leaveNow: false, ...(usualTime ? { time: usualTime } : {}) });
    router.push('/plan');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 8 }}>
        <BackButton />
        <Text accessibilityRole="header" style={s.h1}>{toOffice ? 'To office' : 'To home'}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130, gap: 18 }} keyboardShouldPersistTaps="handled">
        {/* The trip: from → to */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 22, padding: 16, gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Start: ${from?.label ?? 'not set'}. Change`} onPress={() => setPicking(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.lime }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.panelMuted, fontSize: 12, fontWeight: '700' }}>FROM</Text>
              <Text numberOfLines={1} style={{ color: from ? colors.onPanel : colors.panelMuted, fontSize: 16, fontWeight: '800' }}>{from?.label ?? `Choose where you start`}</Text>
            </View>
            <Text style={{ color: colors.panelAccent, fontWeight: '800' }}>Change</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 15, height: 15, borderRadius: 3, backgroundColor: colors.lime }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.panelMuted, fontSize: 12, fontWeight: '700' }}>TO</Text>
              <Text numberOfLines={1} style={{ color: destPlace ? colors.onPanel : colors.panelMuted, fontSize: 16, fontWeight: '800' }}>{destPlace?.label ?? `Search your ${noun} address below`}</Text>
            </View>
          </View>
          {usualTime ? <Text style={{ color: colors.panelMuted, fontSize: 13 }}>Usually at {fmtClock(usualTime)} · from your commute plan</Text> : null}
        </View>

        <View style={{ gap: 6 }}>
          <Label>{toOffice ? 'Office addresses' : 'Home addresses'}</Label>
          <Text style={s.small}>Search to add one. Tap an address to use it for this ride. The default is used everywhere else.</Text>
        </View>
        <SavedPlaces kind={destKind} places={data.places} offices={data.offices} onChange={reload} selectedId={dest?.id ?? null} onSelect={(p) => setDestId(p.id)} />
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, gap: 8 }}>
        {!from || !destPlace ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="pin" size={16} color={colors.muted} />
            <Text style={s.small}>{!destPlace ? `Add your ${noun} address to find rides.` : 'Choose where you start.'}</Text>
          </View>
        ) : null}
        <Button label={destPlace ? `Find rides to ${destPlace.label}` : 'Find rides'} disabled={!from || !destPlace} onPress={find} />
      </View>

      <PlacePicker
        visible={picking}
        title="Where do you start?"
        saved={buildSaved(data.places.filter((p) => p.label !== destKind || !dest || p.id !== dest.id), data.offices, current)}
        onClose={() => setPicking(false)}
        onPick={(p) => (setFrom(p), setPicking(false))}
      />
    </SafeAreaView>
  );
}
