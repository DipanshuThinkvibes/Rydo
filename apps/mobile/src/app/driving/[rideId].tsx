import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LiveRide } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { api, errText } from '@/lib/api';
import { dayOf, etaSeconds, fmtDistance, fmtTime, firstName, metersBetween, progressAlong, shortName, toPath } from '@/lib/format';
import { openLongStop, useData, useLiveRide, useNow } from '@/lib/hooks';
import { confirmSos, openDirections } from '@/lib/safety';
import { useGpsSender } from '@/lib/location';
import { useDriveSimulator } from '@/lib/simulator';
import type { ManagedRide } from '@/lib/types';
import { Icon } from '@/components/icons';
import { RouteMap, type MapMarker } from '@/components/route-map';
import { Stars } from '@/components/stars';
import { Avatar, BackButton, Badge, Button, Card, Label, Loading, Notice, RoundButton, s, Sheet } from '@/components/ui';

type Rider = LiveRide['riders'][number];

/** One ride from the driver's side: before the start, turn-by-turn pickups with PIN check (prototype 11), and the end. */
export default function DriverTrip() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { live, location, reload } = useLiveRide(rideId, 4000);
  const manage = useData(() => api<ManagedRide>('GET', `/rides/${rideId}/manage`), [rideId], 10_000);

  if (!live || !manage.data) return manage.error ? <Gone /> : <Loading dark />;
  const refresh = () => Promise.all([reload(), manage.reload()]);
  const st = live.ride.status;
  if (st === 'IN_PROGRESS') return <Navigate live={live} location={location} onChange={refresh} />;
  if (st === 'COMPLETED') return <Finished live={live} onChange={refresh} />;
  return <BeforeStart live={live} ride={manage.data} onChange={refresh} />;
}

function Gone() {
  return (
    <SafeAreaView style={{ flex: 1, padding: 20, gap: 16 }}>
      <BackButton />
      <Notice tone="info">This ride is not available any more.</Notice>
    </SafeAreaView>
  );
}

// ── Before the start: riders, requests, start / cancel ──

function BeforeStart({ live, ride, onChange }: { live: LiveRide; ride: ManagedRide; onChange: () => void }) {
  const now = useNow(10_000);
  const [busy, setBusy] = useState<string | null>(null);
  const startFrom = new Date(ride.departAt).getTime() - 30 * 60_000;
  const cancelled = live.ride.status === 'CANCELLED';

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      onChange();
    } catch (e) {
      Alert.alert('That did not work', errText(e));
    } finally {
      setBusy(null);
    }
  };

  const markers: MapMarker[] = ride.riders.filter((r) => r.pickup).map((r) => ({ id: r.bookingId, at: r.pickup!, kind: 'person' as const, label: r.name }));
  const path = toPath(ride.route);
  if (path.length) markers.push({ id: 's', at: path[0], kind: 'start' }, { id: 'e', at: path[path.length - 1], kind: 'end', label: ride.to.split(',')[0] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.inkBg }}>
      <RouteMap dark style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '45%' }} routes={[{ id: 'r', path, active: true }]} markers={markers} inset={{ top: 70, bottom: 20 }} />
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16 }}>
        <BackButton />
      </SafeAreaView>
      <View style={{ flex: 1 }} />
      <Sheet style={{ height: '60%', paddingBottom: 0 }}>
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
          <Label>{dayOf(ride.departAt)} · {fmtTime(ride.departAt)} · {ride.seatsBooked} of {ride.seatsTotal} seats booked</Label>
          <Text style={s.h2}>{ride.from.split(',')[0]} → {ride.to.split(',')[0]}</Text>
          {cancelled ? <Notice tone="info">This ride is cancelled.</Notice> : null}

          {ride.requests.map((r) => (
            <Card key={r.requestId} style={{ gap: 10, borderColor: colors.lime, borderWidth: 2 }}>
              <Badge tone="lime">New request · answer by {fmtTime(r.expiresAt)}</Badge>
              <View style={s.row}>
                <Avatar name={r.name} />
                <View style={{ flex: 1 }}>
                  <Text style={s.strong}>{shortName(r.name)}{r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ''}</Text>
                  <Text style={s.small}>Pickup {r.pickupLabel} · {r.seats} seat{r.seats > 1 ? 's' : ''}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button small label="Decline" variant="ghost" style={{ flex: 1 }} loading={busy === `d${r.requestId}`} disabled={!!busy} onPress={() => act(`d${r.requestId}`, () => api('POST', `/requests/${r.requestId}/decline`))} />
                <Button small label="Accept" style={{ flex: 1 }} loading={busy === `a${r.requestId}`} disabled={!!busy} onPress={() => act(`a${r.requestId}`, () => api('POST', `/requests/${r.requestId}/accept`))} />
              </View>
            </Card>
          ))}

          <Label>Riders</Label>
          {ride.riders.length === 0 ? <Text style={s.small}>No riders yet. Requests show up here.</Text> : null}
          {ride.riders.map((r, i) => (
            <View key={r.bookingId} style={s.row}>
              <Avatar name={r.name} tone={i % 2 ? 'pink' : 'blue'} />
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>{shortName(r.name)}{r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ''}</Text>
                <Text numberOfLines={1} style={s.small}>Pickup {r.pickupLabel}</Text>
              </View>
              <RoundButton icon="chat" label={`Chat with ${r.name}`} size={42} onPress={() => router.push({ pathname: '/chat/[rideId]/[riderId]', params: { rideId: ride.id, riderId: live.riders.find((x) => x.bookingId === r.bookingId)?.membershipId ?? 'me' } })} />
            </View>
          ))}

          {!cancelled && (
            <>
              <Button
                label={now >= startFrom ? 'Start trip' : `You can start from ${fmtTime(new Date(startFrom))}`}
                variant="lime"
                disabled={now < startFrom}
                loading={busy === 'start'}
                onPress={() => act('start', () => api('POST', `/rides/${ride.id}/start`))}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert('Cancel this ride?', ride.riders.length ? 'Booked riders are told at once. Cancelling late lowers your reliability score.' : 'Nobody is booked yet.', [
                    { text: 'Keep ride', style: 'cancel' },
                    { text: 'Cancel ride', style: 'destructive', onPress: () => act('cancel', () => api('POST', `/rides/${ride.id}/cancel`, {})) },
                  ])
                }
                style={{ alignSelf: 'center', padding: 8 }}
              >
                <Text style={{ color: colors.danger, fontWeight: '800', textDecorationLine: 'underline' }}>Cancel ride</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}

// ── In progress: next pickup, PIN check, drop-off ──

function Navigate({ live, location, onChange }: { live: LiveRide; location: LiveRide['location']; onChange: () => void }) {
  const now = useNow(1000);
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const path = useMemo(() => toPath(live.ride.route), [live.ride.route]);
  const startAt = location ? progressAlong(path, location) : 0;
  // Real phone GPS by default; the simulator is for testing at a desk.
  const [simulate, setSimulate] = useState(false);
  const gps = useGpsSender(live.ride.id, !simulate);
  const sim = useDriveSimulator(live.ride.id, path, simulate, startAt);

  // Riders in pickup order along the route.
  const riders = useMemo(
    () => [...live.riders].filter((r) => r.status !== 'CANCELLED_BY_RIDER' && r.status !== 'CANCELLED_BY_DRIVER').sort((a, b) => (a.pickup ? progressAlong(path, a.pickup) : 0) - (b.pickup ? progressAlong(path, b.pickup) : 0)),
    [live.riders, path],
  );
  const waiting = riders.filter((r) => r.status === 'CONFIRMED');
  const current: Rider | undefined = waiting[0];
  const index = current ? riders.indexOf(current) + 1 : riders.length;
  const end = path[path.length - 1];
  const target = current?.pickup ?? end;
  const away = location && target ? metersBetween(location, target) : null;
  const mins = away != null ? Math.max(1, Math.round(etaSeconds(away) / 60)) : null;
  const longStop = openLongStop(live.events);
  const noShowAt = current?.arrivedAt ? new Date(current.arrivedAt).getTime() + live.noShowAfterMinutes * 60_000 : null;

  const act = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    try {
      await fn();
      after?.();
      onChange();
    } catch (e) {
      Alert.alert('That did not work', errText(e));
    } finally {
      setBusy(null);
    }
  };

  const complete = () =>
    Alert.alert('Complete the ride?', waiting.length ? `${waiting.length} rider(s) were not picked up and will be marked as missed.` : 'Riders get their trip summary.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Complete', onPress: () => act('done', () => api('POST', `/rides/${live.ride.id}/complete`)) },
    ]);

  const markers: MapMarker[] = riders.filter((r) => r.pickup && r.status === 'CONFIRMED').map((r) => ({ id: r.bookingId, at: r.pickup!, kind: 'person' as const, label: r.name }));
  if (end) markers.push({ id: 'e', at: end, kind: 'end' });
  if (location) markers.push({ id: 'car', at: location, kind: 'car', headingDeg: location.headingDeg });

  return (
    <View style={{ flex: 1, backgroundColor: colors.inkBg }}>
      <RouteMap dark style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '52%' }} routes={[{ id: 'r', path, active: true }]} markers={markers} inset={{ top: 150, bottom: 20 }} />
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16, gap: 10 }}>
        <View style={{ backgroundColor: colors.lime, borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="turn" size={30} color={colors.onLime} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.onLime }}>{away != null ? fmtDistance(away) : current ? 'Pickup' : 'Drop-off'}</Text>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: colors.onLime }}>Head to {current ? current.pickupLabel : live.ride.to}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close navigation" onPress={() => (router.canGoBack() ? router.back() : router.replace('/drive'))} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.inkBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={22} color={colors.onInk} />
          </Pressable>
        </View>
        {target ? (
          <Pressable accessibilityRole="button" onPress={() => openDirections(target)} style={{ alignSelf: 'flex-end', backgroundColor: colors.white, borderRadius: 18, height: 36, paddingHorizontal: 14, justifyContent: 'center', ...s.lift }}>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 13 }}>Open in Google Maps</Text>
          </Pressable>
        ) : null}
        {longStop ? (
          <View style={{ backgroundColor: colors.warningBg, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontWeight: '700', color: colors.warningText }}>You haven&apos;t moved for a while. Everything OK?</Text>
            <Button small label="I'm OK" variant="ghost" loading={busy === 'ok'} onPress={() => act('ok', () => api('POST', `/rides/${live.ride.id}/ok`))} />
          </View>
        ) : null}
      </SafeAreaView>
      <View style={{ flex: 1 }} />

      <Sheet style={{ paddingBottom: 26 }}>
        {current ? (
          <>
            <Label>
              Pickup {index} of {riders.length}
              {mins != null && !current.arrivedAt ? ` · ${mins} min away` : current.arrivedAt ? ' · you are there' : ''}
            </Label>
            <View style={s.row}>
              <Avatar name={current.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>{shortName(current.name)}</Text>
                <Text numberOfLines={2} style={s.small}>{current.pickupLabel}</Text>
              </View>
              <RoundButton icon="chat" label={`Chat with ${current.name}`} size={46} onPress={() => router.push({ pathname: '/chat/[rideId]/[riderId]', params: { rideId: live.ride.id, riderId: current.membershipId } })} />
            </View>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
              <Text style={s.small}>
                {waiting[1] ? `Next: ${shortName(waiting[1].name)} at ${waiting[1].pickupLabel.split(',')[0]} · then ${live.ride.to.split(',')[0]}` : `Then ${live.ride.to.split(',')[0]}`}
              </Text>
            </View>
            {!current.arrivedAt ? (
              <Button label="I've arrived" loading={busy === 'arr'} onPress={() => act('arr', () => api('POST', `/bookings/${current.bookingId}/arrived`))} />
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={s.strong}>Ask {firstName(shortName(current.name))} for the ride PIN</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput
                    value={pin}
                    onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="• • • •"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Rider PIN"
                    style={{ flex: 1, height: 56, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, textAlign: 'center', fontSize: 26, fontWeight: '800', letterSpacing: 10, color: colors.ink }}
                  />
                  <Button label="Check PIN" disabled={pin.length !== 4} loading={busy === 'pin'} onPress={() => act('pin', () => api('POST', `/bookings/${current.bookingId}/board`, { pin }), () => setPin(''))} style={{ flex: 1 }} />
                </View>
                <Button
                  small
                  variant="ghost"
                  label={noShowAt && now < noShowAt ? `No-show possible in ${Math.ceil((noShowAt - now) / 1000)} s` : 'Mark no-show'}
                  disabled={!!noShowAt && now < noShowAt}
                  loading={busy === 'ns'}
                  onPress={() => act('ns', () => api('POST', `/bookings/${current.bookingId}/no-show`))}
                />
              </View>
            )}
          </>
        ) : (
          <>
            <Label>Drop-off{mins != null ? ` · ${mins} min away` : ''}</Label>
            <Text style={s.h2}>{live.ride.to}</Text>
            <Text style={s.small}>{riders.filter((r) => r.status === 'BOARDED').length} on board</Text>
            <Button label="Complete ride" variant="lime" loading={busy === 'done'} onPress={complete} />
          </>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.small, { color: colors.ink, fontWeight: '700' }]}>
              {simulate ? `Simulating drive${sim.done > 0 ? ` · ${Math.round(sim.done * 100)}%` : ''}` : gps.status === 'ok' ? 'Sharing your phone location' : gps.status === 'denied' ? 'Location is off' : 'Turning on location…'}
            </Text>
            <Text style={s.small}>
              {simulate
                ? sim.error ?? 'Sends points along the route (for testing).'
                : gps.status === 'denied'
                  ? 'Allow location for RYDO in phone settings, or simulate.'
                  : gps.error ?? (gps.lastSent ? `Last sent ${Math.max(0, Math.round((now - gps.lastSent) / 1000))} s ago · keep this screen open` : 'Riders see your car live.')}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => (setSimulate(!simulate), sim.setPlaying(!simulate))} style={{ height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.lineStrong, justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 13 }}>{simulate ? 'Use GPS' : 'Simulate'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="SOS" onPress={() => confirmSos(live.ride.id, onChange)} style={{ height: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.danger, justifyContent: 'center' }}>
            <Text style={{ color: colors.onInk, fontWeight: '800' }}>SOS</Text>
          </Pressable>
        </View>
        {current ? (
          <Pressable accessibilityRole="button" onPress={complete} style={{ alignSelf: 'center' }}>
            <Text style={[s.small, { textDecorationLine: 'underline' }]}>End the ride early</Text>
          </Pressable>
        ) : null}
      </Sheet>
    </View>
  );
}

// ── Completed: rate the riders ──

function Finished({ live, onChange }: { live: LiveRide; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const toRate = live.riders.filter((r) => r.status === 'COMPLETED' && !r.rated);
  const rate = async (r: Rider, stars: number, tags: string[]) => {
    setBusy(r.bookingId);
    try {
      await api('POST', `/rides/${live.ride.id}/ratings`, { rateeMembershipId: r.membershipId, stars, tags });
      onChange();
    } catch (e) {
      Alert.alert('Could not send rating', errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        <View style={{ backgroundColor: colors.inkBg, borderRadius: 24, padding: 20, gap: 8 }}>
          <Badge tone="lime">RIDE COMPLETE{live.ride.completedAt ? ` · ${fmtTime(live.ride.completedAt)}` : ''}</Badge>
          <Text style={{ color: colors.onInk, fontSize: 26, fontWeight: '800' }}>Thanks for sharing your car</Text>
          <Text style={{ color: colors.mutedOnDark, fontSize: 15 }}>
            {live.riders.filter((r) => r.status === 'COMPLETED').length} colleague(s) rode with you to {live.ride.to.split(',')[0]}.
          </Text>
        </View>
        {toRate.map((r) => (
          <Card key={r.bookingId} style={{ gap: 12 }}>
            <View style={s.row}>
              <Avatar name={r.name} />
              <Text style={[s.strong, { flex: 1 }]}>How was {firstName(shortName(r.name))}?</Text>
            </View>
            <Stars compact forRider busy={busy === r.bookingId} onRate={(stars, tags) => rate(r, stars, tags)} />
          </Card>
        ))}
        {toRate.length === 0 && live.riders.length > 0 ? <Notice tone="ok">All riders rated. Thank you!</Notice> : null}
        <Button label="Back to Drive" onPress={() => router.replace('/drive')} />
      </ScrollView>
    </SafeAreaView>
  );
}
