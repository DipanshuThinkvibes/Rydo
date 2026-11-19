import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LiveLocation, LiveRide } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { co2Kg, etaSeconds, firstName, fmtKm, fmtTime, fmtWhen, metersBetween, pathLength, progressAlong, shortName, toPath } from '@/lib/format';
import { openLongStop, useData, useLiveRide, useNow } from '@/lib/hooks';
import { useCurrentLocation } from '@/lib/location';
import { confirmSos, shareTrip } from '@/lib/safety';
import { useSession } from '@/lib/session';
import type { Booking } from '@/lib/types';
import { Icon } from '@/components/icons';
import { MemberCard } from '@/components/member-card';
import { RouteMap, type MapMarker } from '@/components/route-map';
import { Stars } from '@/components/stars';
import { ActionTile, Avatar, BackButton, Badge, Button, Card, Empty, Label, Loading, Notice, PinDigits, Plate, s, Sheet, Stat } from '@/components/ui';

/**
 * One booked ride from the rider's side. The screen follows the ride:
 * pickup details with the PIN (prototype 6) → on the way (7) → arrived and rating (8).
 */
export default function Trip() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { data: bookings, reload: reloadBookings } = useData(() => api<Booking[]>('GET', '/me/bookings'), [], 15_000);
  const b = bookings?.find((x) => x.id === bookingId);
  const { live, location, reload } = useLiveRide(b?.ride.id);

  if (!bookings) return <Loading />;
  if (!b)
    return (
      <SafeAreaView style={{ flex: 1, padding: 20, gap: 16 }}>
        <BackButton />
        <Empty title="Ride not found">It may be older than two days or cancelled.</Empty>
      </SafeAreaView>
    );

  const rideStatus = live?.ride.status ?? b.ride.status;
  const me = live?.riders[0];
  const status = me?.status ?? b.status;
  const refresh = () => Promise.all([reload(), reloadBookings()]);

  if (status === 'COMPLETED' || (rideStatus === 'COMPLETED' && status === 'BOARDED')) return <Arrived b={b} live={live} onRated={refresh} />;
  if (status !== 'CONFIRMED' && status !== 'BOARDED') return <Closed b={b} status={status} rideStatus={rideStatus} />;
  if (rideStatus === 'CANCELLED') return <Closed b={b} status="CANCELLED_BY_DRIVER" rideStatus={rideStatus} />;
  if (status === 'BOARDED') return <OnTheWay b={b} live={live} location={location} onChange={refresh} />;
  return <Pickup b={b} live={live} location={location} onChange={refresh} />;
}

// ── 1. Pickup details with the PIN ──

function Pickup({ b, live, location, onChange }: { b: Booking; live: LiveRide | null; location: LiveLocation | null; onChange: () => void }) {
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const here = useCurrentLocation();
  const driver = shortName(b.ride.driverName);
  const first = firstName(driver);
  const started = (live?.ride.status ?? b.ride.status) === 'IN_PROGRESS';
  const me = live?.riders[0];
  const away = location && b.pickup ? metersBetween(location, b.pickup) : null;
  const v = b.ride.vehicle;

  let banner = `${first} leaves ${fmtWhen(b.ride.departAt)}`;
  if (started && me?.arrivedAt) banner = `${first} is at the pickup`;
  else if (started && away != null) {
    const secs = etaSeconds(away);
    banner = secs < 60 ? `${first} is almost there` : `${first} arrives in about ${Math.ceil(secs / 60)} min`;
  } else if (started) banner = `${first} is on the way`;

  const markers: MapMarker[] = [];
  if (b.pickup) markers.push({ id: 'p', at: b.pickup, kind: 'pickup', label: b.pickupLabel.split(',')[0] });
  if (b.drop) markers.push({ id: 'd', at: b.drop, kind: 'end' });
  if (location) markers.push({ id: 'car', at: location, kind: 'car', headingDeg: location.headingDeg, inkCar: true });
  if (here.coords) markers.push({ id: 'me', at: here.coords, kind: 'me' });

  const cancel = () =>
    Alert.alert('Cancel this ride?', 'Cancelling close to departure lowers your reliability score.', [
      { text: 'Keep my seat', style: 'cancel' },
      {
        text: 'Cancel ride',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await api<{ late?: boolean }>('POST', `/bookings/${b.id}/cancel`, {});
            Alert.alert('Ride cancelled', r.late ? 'It was inside the free-cancel window, so your reliability score went down.' : `${first} has been told.`);
            router.replace('/');
          } catch (e) {
            Alert.alert('Could not cancel', errText(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <RouteMap style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '44%' }} routes={[{ id: 'r', path: toPath(b.route), active: true }]} markers={markers} inset={{ top: 80, bottom: 20 }} />
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BackButton />
        <View style={[s.pillDark, { height: 48, flex: 1, paddingHorizontal: 16 }]}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: started ? colors.lime : colors.mutedOnDark }} />
          <Text numberOfLines={1} style={{ color: colors.white, fontSize: 15, fontWeight: '800', flex: 1 }}>{banner}</Text>
        </View>
      </SafeAreaView>
      <View style={{ flex: 1 }} />

      <Sheet style={{ height: '62%', paddingBottom: 0 }}>
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.small}>Meet at</Text>
              <Text style={s.h2}>{b.pickupLabel}</Text>
            </View>
            <Plate plate={v.plateNumber} />
          </View>

          {b.pin ? (
            <View style={{ borderRadius: 20, padding: 16, gap: 12, backgroundColor: colors.surface }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label style={{ color: colors.ink }}>Your ride PIN</Label>
                <Text style={s.small}>Share only inside the car</Text>
              </View>
              <PinDigits pin={b.pin} />
              <Text style={s.small}>The ride starts only after {first} enters this PIN, so you never get into the wrong car.</Text>
            </View>
          ) : null}

          <Pressable accessibilityRole="button" accessibilityLabel={`See ${driver}'s profile`} onPress={() => setCard(b.ride.driverMembershipId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={driver} />
            <View style={{ flex: 1 }}>
              <Text style={s.strong}>{driver}</Text>
              <Text style={s.small}>{v.color} {v.make} {v.model} · Verified driver</Text>
            </View>
            {!started && <Badge tone="neutral">{fmtTime(b.ride.departAt)}</Badge>}
          </Pressable>

          <View style={{ flexDirection: 'row' }}>
            <ActionTile icon="chat" label="Chat" onPress={() => router.push({ pathname: '/chat/[rideId]/[riderId]', params: { rideId: b.ride.id, riderId: 'me' } })} />
            <ActionTile icon="share" label="Share trip" onPress={() => shareTrip(b.ride.id, () => router.push('/account'))} />
            <ActionTile icon="flag" label="Report" onPress={() => router.push({ pathname: '/report', params: { rideId: b.ride.id } })} />
            <ActionTile icon="shield" label="Safety" dark onPress={() => confirmSos(b.ride.id, onChange)} />
          </View>

          {started && me?.arrivedAt ? <Notice tone="ok">{first} is waiting at {b.pickupLabel}. Say your PIN only inside the car.</Notice> : null}

          <Pressable accessibilityRole="button" disabled={busy} onPress={cancel} style={{ alignSelf: 'center', padding: 8 }}>
            <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 15, textDecorationLine: 'underline' }}>Cancel ride</Text>
          </Pressable>
          {!started && <Text style={[s.small, { textAlign: 'center' }]}>Updated {fmtTime(new Date(now))}. You&apos;ll see the car here once {first} starts the ride.</Text>}
        </ScrollView>
      </Sheet>
      <MemberCard membershipId={card} onClose={() => setCard(null)} onBlocked={() => router.replace('/')} />
    </View>
  );
}

// ── 2. In the car, on the way ──

function OnTheWay({ b, live, location, onChange }: { b: Booking; live: LiveRide | null; location: LiveLocation | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const path = toPath(live?.ride.route ?? b.route);
  const total = pathLength(path);
  const done = location ? progressAlong(path, location) : 0;
  const leftM = Math.max(0, total - done);
  const arriveAt = new Date(Date.now() + etaSeconds(leftM) * 1000);
  const boardedAt = live?.events.find((e) => e.type === 'PIN_VERIFIED' && (!e.bookingId || e.bookingId === b.id))?.at;
  const longStop = openLongStop(live?.events);

  const markers: MapMarker[] = [];
  if (b.drop) markers.push({ id: 'd', at: b.drop, kind: 'end', label: b.dropLabel.split(',')[0] });
  if (location) markers.push({ id: 'car', at: location, kind: 'car', headingDeg: location.headingDeg, inkCar: true });

  const ok = async () => {
    setBusy(true);
    try {
      await api('POST', `/rides/${b.ride.id}/ok`);
      onChange();
    } catch (e) {
      Alert.alert('Could not send', errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <RouteMap style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%' }} routes={[{ id: 'r', path, active: true }]} markers={markers} inset={{ top: longStop ? 260 : 110, bottom: 20 }} />
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderRadius: 20, padding: 16, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedOnDark, fontSize: 13, fontWeight: '600' }}>On the way to {b.dropLabel.split(',')[0]}</Text>
            <Text style={{ color: colors.white, fontSize: 18, fontWeight: '800' }}>Arrive {fmtTime(arriveAt)} · {Math.max(1, Math.round(etaSeconds(leftM) / 60))} min</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime }} />
            <Text style={{ color: colors.lime, fontSize: 12, fontWeight: '800' }}>LIVE</Text>
          </View>
        </View>
        {longStop && (
          <Card style={{ gap: 10 }}>
            <Text style={s.strong}>Long stop detected. Everything OK?</Text>
            <Text style={s.small}>The car hasn&apos;t moved for a few minutes. RYDO checks in automatically.</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button small label="I'm OK" variant="ghost" loading={busy} onPress={ok} style={{ flex: 1 }} />
              <Button small label="Get help" onPress={() => confirmSos(b.ride.id, onChange)} style={{ flex: 1 }} />
            </View>
          </Card>
        )}
      </SafeAreaView>
      <View style={{ flex: 1 }} />

      <Sheet style={{ paddingBottom: 30 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={s.strong}>{fmtKm(total)} trip</Text>
          <Text style={s.small}>{fmtKm(done)} done</Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' }}>
          <View style={{ height: 8, borderRadius: 4, width: `${total ? Math.min(100, (done / total) * 100) : 0}%`, backgroundColor: colors.ink }} />
        </View>
        <View style={{ gap: 14, paddingVertical: 4 }}>
          <Step done title="You got in · PIN verified" sub={boardedAt ? `${fmtTime(boardedAt)} · ${b.pickupLabel}` : b.pickupLabel} />
          <Step end title={b.dropLabel} sub={`about ${fmtTime(arriveAt)}`} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Share trip" variant="ghost" style={{ flex: 1 }} onPress={() => shareTrip(b.ride.id, () => router.push('/account'))} />
          <Button label="Safety" variant="ghost" style={{ flex: 1 }} onPress={() => confirmSos(b.ride.id, onChange)} />
        </View>
      </Sheet>
    </View>
  );
}

function Step({ title, sub, done, end }: { title: string; sub: string; done?: boolean; end?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 22, height: 22, marginTop: 1, borderRadius: end ? 5 : 11, backgroundColor: end ? colors.ink : done ? colors.lime : colors.white, borderWidth: done || end ? 0 : 3, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        {done ? <Icon name="check" size={14} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.strong}>{title}</Text>
        <Text style={s.small}>{sub}</Text>
      </View>
    </View>
  );
}

// ── 3. Arrived: trip stats and rating ──

function Arrived({ b, live, onRated }: { b: Booking; live: LiveRide | null; onRated: () => void }) {
  const { me } = useSession();
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const driver = shortName(b.ride.driverName);
  const meters = pathLength(toPath(live?.ride.route ?? b.route));
  const started = live?.ride.startedAt ? new Date(live.ride.startedAt).getTime() : null;
  const ended = live?.ride.completedAt ? new Date(live.ride.completedAt).getTime() : null;
  const rated = thanks || b.ride.ratedDriver || live?.ratedDriver;

  const rate = async (stars: number, tags: string[]) => {
    setBusy(true);
    try {
      await api('POST', `/rides/${b.ride.id}/ratings`, { rateeMembershipId: b.ride.driverMembershipId, stars, tags });
      setThanks(true);
      onRated();
    } catch (e) {
      Alert.alert('Could not send rating', errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <SafeAreaView edges={['top']} style={{ padding: 20, gap: 16 }}>
          <Badge tone="lime">ARRIVED{ended ? ` · ${fmtTime(new Date(ended))}` : ''}</Badge>
          <Text accessibilityRole="header" style={{ color: colors.white, fontSize: 30, fontWeight: '800', lineHeight: 36 }}>
            You&apos;re at {b.dropLabel.split(',')[0]}, {firstName(me?.user.name ?? '')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat dark big value={fmtKm(meters) || '—'} label="shared" />
            <Stat dark big value={started && ended ? `${Math.max(1, Math.round((ended - started) / 60000))} min` : '—'} label="on the road" />
            <Stat dark big lime value={`≈${co2Kg(meters).toFixed(1)} kg`} label="CO₂ saved" />
          </View>
          {b.costShareEstimate ? (
            <View style={{ backgroundColor: colors.ink2, borderRadius: 14, padding: 12 }}>
              <Text style={{ color: colors.mutedOnDark, fontSize: 14 }}>
                Your cost share <Text style={{ color: colors.white, fontWeight: '800' }}>₹{Math.round(b.costShareEstimate)} [est.]</Text>
              </Text>
            </View>
          ) : null}
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        {rated ? (
          <Card style={{ alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={32} />
            <Text style={s.strong}>Thanks for rating {firstName(driver)}</Text>
            <Text style={[s.small, { textAlign: 'center' }]}>Ratings keep RYDO safe and friendly for everyone.</Text>
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={driver} />
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>How was your ride with {firstName(driver)}?</Text>
                <Text style={s.small}>Only RYDO and {firstName(driver)}&apos;s average rating are affected</Text>
              </View>
            </View>
            <Stars busy={busy} onRate={rate} />
          </>
        )}
        <Button label="Done" variant={rated ? 'primary' : 'soft'} onPress={() => router.replace('/')} />
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/report', params: { rideId: b.ride.id } })} style={{ alignSelf: 'center', padding: 8 }}>
          <Text style={{ color: colors.muted, fontWeight: '700', textDecorationLine: 'underline' }}>Report a problem with this ride</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Closed({ b, status, rideStatus }: { b: Booking; status: string; rideStatus: string }) {
  const text =
    status === 'NO_SHOW'
      ? 'The driver marked you as a no-show for this ride.'
      : status === 'CANCELLED_BY_DRIVER' || rideStatus === 'CANCELLED'
        ? `${shortName(b.ride.driverName)} cancelled this ride. Find another one from Home.`
        : 'You cancelled this ride.';
  return (
    <SafeAreaView style={{ flex: 1, padding: 20, gap: 16, backgroundColor: colors.white }}>
      <BackButton />
      <Text style={s.h1}>Ride closed</Text>
      <Notice tone="info">{text}</Notice>
      <Button label="Find another ride" onPress={() => router.replace('/plan')} />
    </SafeAreaView>
  );
}
