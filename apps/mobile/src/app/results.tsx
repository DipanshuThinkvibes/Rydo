import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RideMatch } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { dayWord, fmtClock, fmtDistance, fmtTime, firstName, shortName, toPath } from '@/lib/format';
import { draft } from '@/lib/places';
import { Icon } from '@/components/icons';
import { MemberCard } from '@/components/member-card';
import { RouteMap, type MapMarker } from '@/components/route-map';
import { Badge, BackButton, Button, Chip, ChipRow, Empty, Label, Notice, s, Sheet, Switch } from '@/components/ui';

type Filter = 'all' | 'car' | 'bike' | 'women';

/** Prototype screen 4: matching rides on the map with "why this match". */
export default function Results() {
  const search = draft.search;
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(draft.chosen?.rideId ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [autoAsk, setAutoAsk] = useState(true);
  const [waitDone, setWaitDone] = useState(false);
  const [waitBusy, setWaitBusy] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);

  const shown = useMemo(
    () =>
      draft.results.filter((m) => !blocked.includes(m.driver.membershipId)).filter((m) =>
        filter === 'car' ? m.vehicle.type === 'CAR' : filter === 'bike' ? m.vehicle.type === 'BIKE' : filter === 'women' ? m.womenOnly : true,
      ),
    [filter, blocked],
  );
  const chosen = shown.find((m) => m.rideId === selected) ?? shown[0];
  if (!search) return <Redirect href="/plan" />;

  const markers: MapMarker[] = [
    { id: 'pickup', at: search.pickup, kind: 'pickup', label: chosen ? `Pickup · ${fmtDistance(chosen.pickupDistanceMeters)} walk` : 'Pickup' },
    { id: 'drop', at: search.drop, kind: 'end', label: shortName(search.drop.label.split(',')[0]) },
  ];

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

  const title = draft.value.leaveNow ? 'Rides leaving now' : `Rides for ${dayWord(search.date)}, ${fmtClock(draft.value.time)}`;
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
        <ChipRow>
          {(
            [
              ['all', 'All'],
              ['car', 'Car'],
              ['bike', 'Bike'],
              ['women', 'Women-only'],
            ] as const
          ).map(([k, l]) => <Chip key={k} label={l} selected={filter === k} onPress={() => setFilter(k)} />)}
        </ChipRow>

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          {shown.length === 0 && (
            <Empty title="No rides match yet">Try another time or day. Or join the waitlist: when a seat opens on this route, you get it first.</Empty>
          )}
          {shown.map((m, i) => (
            <MatchCard key={m.rideId} m={m} best={i === 0 && filter === 'all'} active={m.rideId === chosen?.rideId} onPress={() => setSelected(m.rideId)} onDriver={() => setCard(m.driver.membershipId)} />
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

function MatchCard({ m, best, active, onPress, onDriver }: { m: RideMatch; best: boolean; active: boolean; onPress: () => void; onDriver: () => void }) {
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
            {fmtTime(m.pickupEta)} → {fmtTime(m.dropEta)} · {m.pickupDistanceMeters < 50 ? 'on the route' : `${fmtDistance(m.pickupDistanceMeters)} walk`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{m.score}%</Text>
          <Text style={s.small}>match</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {best && <Badge tone="lime">Best match</Badge>}
        {m.preferred && <Badge tone="ink">Preferred driver</Badge>}
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
