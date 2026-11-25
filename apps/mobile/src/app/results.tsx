import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RideMatch } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { api, errText } from '@/lib/api';
import { dayWord, fmtClock, fmtDistance, fmtTime, firstName, shortName, toPath } from '@/lib/format';
import { draft } from '@/lib/places';
import { Icon } from '@/components/icons';
import { MemberCard } from '@/components/member-card';
import { RouteMap, type MapMarker } from '@/components/route-map';
import { Badge, BackButton, Button, Empty, Label, Notice, s, Sheet, Switch } from '@/components/ui';

/** Prototype screen 4: matching rides on the map with "why this match". */
export default function Results() {
  const search = draft.search;
  const [selected, setSelected] = useState<string | null>(draft.chosen?.rideId ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [autoAsk, setAutoAsk] = useState(true);
  const [waitDone, setWaitDone] = useState(false);
  const [waitBusy, setWaitBusy] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  // Preferred-driver changes made here, on top of what the search returned (same as the web ♥).
  const [fav, setFav] = useState<Record<string, boolean>>({});
  const toggleFav = async (m: RideMatch) => {
    const on = !(fav[m.driver.membershipId] ?? m.preferred);
    setFav((f) => ({ ...f, [m.driver.membershipId]: on }));
    try {
      if (on) await api('POST', '/me/preferred-drivers', { driverMembershipId: m.driver.membershipId });
      else await api('DELETE', `/me/preferred-drivers/${m.driver.membershipId}`);
      setMsg({ tone: 'ok', text: on ? `${shortName(m.driver.name)} is now a preferred driver. Their rides show first.` : 'Removed from preferred drivers.' });
    } catch (e) {
      setFav((f) => ({ ...f, [m.driver.membershipId]: !on }));
      setMsg({ tone: 'error', text: errText(e) });
    }
  };

  const shown = useMemo(
    () =>
      // Filters are chosen before searching (Find a ride → Filters); the results already match them.
      draft.results.filter((m) => !blocked.includes(m.driver.membershipId)),
    [blocked],
  );
  const chosen = shown.find((m) => m.rideId === selected) ?? shown[0];
  if (!search) return <Redirect href="/plan" />;

  const markers: MapMarker[] = [
    { id: 'pickup', at: search.pickup, kind: 'pickup', label: chosen ? (chosen.nearby ? 'Your pickup' : `Pickup · ${fmtDistance(chosen.pickupDistanceMeters)} walk`) : 'Pickup' },
    { id: 'drop', at: search.drop, kind: 'end', label: shortName(search.drop.label.split(',')[0]) },
    // A nearby suggestion: where the rider meets the car on the driver's route.
    ...(chosen?.nearby ? [{ id: 'meet', at: chosen.pickupPoint, kind: 'place' as const, icon: 'pin' as const, isDefault: true, label: 'Meet the car here' }] : []),
  ];
  const firstNearby = shown.findIndex((m) => m.nearby);

  async function request(m: RideMatch) {
    setBusy(true);
    setMsg(undefined);
    try {
      const r = await api<{ id: string; status: 'ACCEPTED' | 'PENDING' }>('POST', `/rides/${m.rideId}/requests`, { pickup: search!.pickup, drop: search!.drop, seats: search!.seats, autoRematch: true });
      draft.chosen = m;
      router.replace({ pathname: '/requested', params: { requestId: r.id, rideId: m.rideId } });
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    setWaitBusy(true);
    try {
      const w = await api<{ status: string }>('POST', '/me/waitlist', { ...search, autoRequest: autoAsk });
      setWaitDone(true);
      setMsg({ tone: 'ok', text: w.status === 'MATCHED' ? 'A seat just opened and we asked the driver for you.' : autoAsk ? "You're on the waitlist. When a seat opens we'll ask the driver for you." : "You're on the waitlist. We'll tell you when a seat opens." });
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setWaitBusy(false);
    }
  }

  const title = draft.value.leaveNow ? 'Rides leaving now' : `Rides for ${dayWord(search.date)}${draft.value.time ? `, ${fmtClock(draft.value.time)}` : ''}`;
  const state = chosen?.requestStatus;

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <RouteMap
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '46%' }}
        routes={shown.map((m) => ({ id: m.rideId, path: toPath(m.route), active: m.rideId === chosen?.rideId }))}
        markers={markers}
        inset={{ top: 60, bottom: 30 }}
      />
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16 }}>
        <BackButton />
      </SafeAreaView>
      <View style={{ flex: 1 }} />

      <Sheet style={{ height: '60%', paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={[s.h2, { flex: 1 }]}>{title}</Text>
          <Text style={s.small}>{shown.length} {shown.length === 1 ? 'ride' : 'rides'}</Text>
        </View>

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          {shown.length === 0 && (
            <Empty title="No rides match yet">Try another time or day. Or join the waitlist: when a seat opens on this route, you get it first.</Empty>
          )}
          {shown.map((m, i) => (
            <View key={m.rideId} style={{ gap: 12 }}>
              {i === firstNearby ? (
                <View style={{ gap: 2, paddingTop: i ? 6 : 0 }}>
                  <Text style={[s.strong, { fontSize: 17 }]}>Nearby suggestions</Text>
                  <Text style={s.small}>These pass a little further from your pickup or drop, or meet your trip partway. You meet the car on its route.</Text>
                </View>
              ) : null}
            <MatchCard m={m} best={i === 0 && !m.nearby} active={m.rideId === chosen?.rideId} onPress={() => setSelected(m.rideId)} onDriver={() => setCard(m.driver.membershipId)} preferred={fav[m.driver.membershipId] ?? m.preferred} onFav={() => toggleFav(m)} />
            </View>
          ))}
          <View style={{ gap: 10, padding: 16, borderRadius: 20, backgroundColor: colors.surface }}>
            <Text style={s.strong}>{shown.length ? 'Nothing quite right?' : 'Join the waitlist'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[s.small, { flex: 1 }]}>When a seat opens on this route, send the request for me</Text>
              <Switch label="Send the request for me" value={autoAsk} onChange={setAutoAsk} />
            </View>
            <Button small variant="ghost" label={waitDone ? 'On the waitlist' : 'Join waitlist'} disabled={waitDone} loading={waitBusy} onPress={joinWaitlist} />
          </View>
        </ScrollView>
      </Sheet>

      {chosen ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, backgroundColor: colors.white }}>
          {state ? (
            <Button label={state === 'ACCEPTED' ? 'You are booked on this ride' : 'Requested · waiting for driver'} variant="soft" disabled onPress={() => undefined} />
          ) : (
            <Button label={`Request ${firstName(shortName(chosen.driver.name))}'s ride`} loading={busy} onPress={() => request(chosen)} />
          )}
        </View>
      ) : null}
      <MemberCard membershipId={card} onClose={() => setCard(null)} onBlocked={() => card && setBlocked((b) => [...b, card])} />
    </View>
  );
}

function MatchCard({ m, best, active, onPress, onDriver, preferred, onFav }: { m: RideMatch; best: boolean; active: boolean; onPress: () => void; onDriver: () => void; preferred: boolean; onFav: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${m.driver.name}, ${m.score} percent match, leaves ${fmtTime(m.departAt)}`}
      onPress={onPress}
      style={{ borderRadius: 20, borderWidth: 2, borderColor: active ? colors.ink : colors.line, padding: 14, gap: 12, backgroundColor: colors.white }}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="car" size={24} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`See ${m.driver.name}'s profile`} onPress={onDriver} hitSlop={6}>
            <Text style={s.strong}>
              {shortName(m.driver.name)}
              {m.driver.rating ? ` · ★ ${m.driver.rating.toFixed(1)}` : ''}
            </Text>
          </Pressable>
          <Text numberOfLines={1} style={s.small}>
            {m.vehicle.color} {m.vehicle.make} {m.vehicle.model} · {m.seatsLeft} left
          </Text>
          <Text style={[s.small, { color: colors.ink, fontWeight: '600' }]}>
            {fmtTime(m.pickupEta)} → {fmtTime(m.dropEta)} · {m.pickupDistanceMeters < 50 ? 'on the route' : m.nearby ? `meet ${fmtDistance(m.pickupDistanceMeters)} away` : `${fmtDistance(m.pickupDistanceMeters)} walk`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{m.score}%</Text>
          <Text style={s.small}>match</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: preferred }}
          accessibilityLabel={preferred ? 'Remove preferred driver' : 'Save as preferred driver'}
          onPress={onFav}
          hitSlop={6}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: preferred ? colors.dangerBg : colors.surface2 }}
        >
          <Text style={{ fontSize: 18, color: preferred ? colors.danger : colors.muted }}>{preferred ? '♥' : '♡'}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {best && <Badge tone="lime">Best match</Badge>}
        {m.nearby && <Badge tone="warning">Nearby suggestion</Badge>}
        {preferred && <Badge tone="ink">Preferred driver</Badge>}
        {m.womenOnly && <Badge tone="women">Women-only</Badge>}
        {m.vehicle.hasAc && <Badge tone="neutral">AC</Badge>}
        {m.vehicle.type === 'BIKE' && <Badge tone="neutral">Bike</Badge>}
      </View>
      {active && m.reasons.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>Why this match</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {m.reasons.map((r) => (
              <View key={r} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surface2 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink }}>{r}</Text>
              </View>
            ))}
          </View>
          <Text style={s.small}>Free cancellation until shortly before pickup.</Text>
        </View>
      )}
    </Pressable>
  );
}
