import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { dayOf, fmtTime, fmtWhen, shortName, toPath } from '@/lib/format';
import { useData, useNow } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { DriverProfile, DrivingRide, ManagedRide, MyProfile, RidePlan } from '@/lib/types';
import { Icon } from '@/components/icons';
import { AccountButton } from '@/components/account-button';
import { ModeSwitch } from '@/components/mode-switch';
import { RouteMap, type MapMarker } from '@/components/route-map';
import { TabBar } from '@/components/tab-bar';
import { Avatar, Badge, Button, Card, Label, Loading, Notice, s, Switch } from '@/components/ui';

const DAY = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const daysText = (d: number[]) => (d.join() === '1,2,3,4,5' ? 'Mon–Fri' : d.map((x) => DAY[x - 1]).join(' '));

interface DriveData {
  profile: DriverProfile | null;
  rides: DrivingRide[];
  plans: RidePlan[];
  me: MyProfile | null;
  next: ManagedRide | null;
  asking: ManagedRide | null;
}

/** Prototype screens 10: the driver's home with today's ride, stats and new requests. */
export default function Drive() {
  const { active } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const { data, reload, error } = useData<DriveData>(
    async () => {
      const profile = await api<DriverProfile | null>('GET', '/driver/profile');
      if (profile?.status !== 'VERIFIED') return { profile, rides: [], plans: [], me: null, next: null, asking: null };
      const [rides, plans, me] = await Promise.all([
        api<DrivingRide[]>('GET', '/rides/driving'),
        api<RidePlan[]>('GET', '/ride-plans/mine'),
        api<MyProfile>('GET', '/me/profile').catch(() => null),
      ]);
      const upcoming = rides.filter((r) => r.status !== 'COMPLETED' && r.status !== 'CANCELLED');
      const nextRide = upcoming.find((r) => r.status === 'IN_PROGRESS') ?? upcoming[0];
      const askRide = upcoming.find((r) => r.pendingRequests > 0);
      const [next, asking] = await Promise.all([
        nextRide ? api<ManagedRide>('GET', `/rides/${nextRide.id}/manage`).catch(() => null) : null,
        askRide && askRide.id !== nextRide?.id ? api<ManagedRide>('GET', `/rides/${askRide.id}/manage`).catch(() => null) : null,
      ]);
      return { profile, rides, plans, me, next, asking: askRide ? (askRide.id === nextRide?.id ? next : asking) : null };
    },
    [active],
    10_000,
  );

  if (!data && !error) return <Loading dark />;

  const next = data?.next;
  const markers: MapMarker[] = [];
  next?.riders.forEach((r) => r.pickup && markers.push({ id: r.bookingId, at: r.pickup, kind: 'person', label: r.name }));
  const path = toPath(next?.route);
  if (path.length) {
    markers.push({ id: 's', at: path[0], kind: 'start' });
    markers.push({ id: 'e', at: path[path.length - 1], kind: 'end' });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <RouteMap dark style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 330 }} routes={next ? [{ id: 'r', path, active: true }] : []} markers={markers} inset={{ top: 70, bottom: 40 }} />
      <SafeAreaView edges={['top']} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 }}>
        <AccountButton dark />
        <ModeSwitch mode="drive" dark />
        <View style={{ width: 44 }} />
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1, marginTop: 160 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: data?.asking?.requests.length ? 280 : 30 }}
        refreshControl={<RefreshControl tintColor={colors.lime} refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}
      >
        {error ? <Notice tone="error">{errText(error, 'Could not load your driving.')}</Notice> : null}
        {data && data.profile?.status !== 'VERIFIED' ? <BecomeDriver profile={data.profile} onStart={reload} /> : null}
        {data && data.profile?.status === 'VERIFIED' ? <Driving data={data} reload={reload} /> : null}
      </ScrollView>

      {data?.asking?.requests[0] ? <RequestPopup ride={data.asking} onDone={reload} /> : null}
      <TabBar active="drive" />
    </View>
  );
}

function Driving({ data, reload }: { data: DriveData; reload: () => void }) {
  const now = useNow(15_000);
  const [busy, setBusy] = useState(false);
  const { next, plans, me, profile } = data;
  const activePlans = plans.filter((p) => p.active);
  const license = profile?.documents.find((d) => d.kind === 'DRIVING_LICENSE' && d.status === 'APPROVED');
  const others = data.rides.filter((r) => r.id !== next?.id && r.status !== 'CANCELLED').slice(0, 6);

  const canStart = next ? now >= new Date(next.departAt).getTime() - 30 * 60_000 : false;
  const start = async () => {
    if (!next) return;
    if (next.status === 'IN_PROGRESS') return router.push({ pathname: '/driving/[rideId]', params: { rideId: next.id } });
    setBusy(true);
    try {
      await api('POST', `/rides/${next.id}/start`);
      router.push({ pathname: '/driving/[rideId]', params: { rideId: next.id } });
    } catch (e) {
      Alert.alert('Could not start', errText(e));
    } finally {
      setBusy(false);
    }
  };

  // On: publish a ride. Off: stop every live plan (their future rides are cancelled and riders told).
  const toggleOffering = (on: boolean) => {
    if (on) return router.push('/publish');
    Alert.alert('Stop offering seats?', `All ${activePlans.length} live ride ${activePlans.length === 1 ? 'plan stops' : 'plans stop'}. Their future rides are cancelled and booked riders are told.`, [
      { text: 'Keep offering', style: 'cancel' },
      {
        text: 'Stop all',
        style: 'destructive',
        onPress: () =>
          Promise.all(activePlans.map((p) => api<{ cancelledRides: number }>('DELETE', `/ride-plans/${p.id}`))).then(
            (r) => (Alert.alert('Stopped', `${r.reduce((n, x) => n + x.cancelledRides, 0)} future rides cancelled.`), reload()),
            (e) => (Alert.alert('Could not stop', errText(e)), reload()),
          ),
      },
    ]);
  };

  const stopPlan = (p: RidePlan) =>
    Alert.alert('Stop this plan?', 'Its future rides are cancelled and booked riders are told.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Stop plan',
        style: 'destructive',
        onPress: () =>
          api<{ cancelledRides: number }>('DELETE', `/ride-plans/${p.id}`).then(
            (r) => (Alert.alert('Plan stopped', `${r.cancelledRides} future rides cancelled.`), reload()),
            (e) => Alert.alert('Could not stop', errText(e)),
          ),
      },
    ]);

  return (
    <>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>Offering seats</Text>
          <Text style={s.small}>{activePlans.length ? `${activePlans.length} ${activePlans.length === 1 ? 'plan' : 'plans'} live · colleagues on your route can request` : 'Publish a ride so colleagues can request'}</Text>
        </View>
        <Switch label="Offering seats" value={activePlans.length > 0} onChange={toggleOffering} />
      </Card>

      {next ? (
        <Card dark style={{ gap: 12, backgroundColor: colors.ink2 }} onPress={() => router.push({ pathname: '/driving/[rideId]', params: { rideId: next.id } })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.lime, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }}>{dayOf(next.departAt).toUpperCase()} · {fmtTime(next.departAt)}</Text>
            <Text style={{ color: colors.mutedOnDark, fontSize: 12, fontWeight: '800' }}>{next.seatsBooked} OF {next.seatsTotal} SEATS BOOKED</Text>
          </View>
          <Text style={{ color: colors.white, fontSize: 20, fontWeight: '800' }}>{next.from.split(',')[0]} → {next.to.split(',')[0]}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {next.riders.slice(0, 4).map((r, i) => <Avatar key={r.bookingId} name={r.name} size={34} tone={i % 2 ? 'pink' : 'blue'} />)}
            <Text style={{ color: colors.mutedOnDark, fontSize: 13, marginLeft: 6, flex: 1 }}>{next.riders.length ? 'Pickups in order on your route' : 'No riders yet'}</Text>
          </View>
          <Button
            label={next.status === 'IN_PROGRESS' ? 'Continue trip' : canStart ? 'Start trip' : `You can start from ${fmtTime(new Date(new Date(next.departAt).getTime() - 30 * 60_000))}`}
            variant="lime"
            disabled={next.status !== 'IN_PROGRESS' && !canStart}
            loading={busy}
            onPress={start}
          />
        </Card>
      ) : (
        <Card dark style={{ backgroundColor: colors.ink2 }}>
          <Text style={{ color: colors.white, fontSize: 18, fontWeight: '800' }}>No rides coming up</Text>
          <Text style={{ color: colors.mutedOnDark, fontSize: 14 }}>Publish a ride and colleagues on your route can request a seat.</Text>
        </Card>
      )}

      {me ? (
        <Card style={{ gap: 10 }}>
          <Label>So far</Label>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Big value={String(me.ridesCompleted.asDriver)} label="rides shared" />
            <Big value={me.rating.average ? `★ ${me.rating.average.toFixed(1)}` : '—'} label={`${me.rating.count} ratings`} />
            <Big value={String(data.rides.filter((r) => r.status !== 'CANCELLED').length)} label="coming up" />
          </View>
        </Card>
      ) : null}

      <Card onPress={() => router.push('/publish')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>Publish a ride</Text>
          <Text style={s.small}>One-off or every weekday</Text>
        </View>
        <Icon name="next" size={22} color={colors.muted} />
      </Card>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shield" size={22} color={colors.successText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>Verified driver</Text>
          <Text style={s.small}>{license?.expiresAt ? `License valid to ${new Date(license.expiresAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} · ` : ''}RC checked by HR</Text>
        </View>
      </Card>

      {others.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label light>Your next rides</Label>
          {others.map((r) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/driving/[rideId]', params: { rideId: r.id } })} style={{ backgroundColor: colors.ink2, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.white, fontWeight: '800', fontSize: 15 }}>{fmtWhen(r.departAt)}</Text>
                <Text numberOfLines={1} style={{ color: colors.mutedOnDark, fontSize: 13 }}>{r.originLabel.split(',')[0]} → {r.destinationLabel.split(',')[0]}</Text>
              </View>
              {r.pendingRequests > 0 ? <Badge tone="lime">{`${r.pendingRequests} new`}</Badge> : null}
              <Text style={{ color: colors.mutedOnDark, fontWeight: '800' }}>{r.seatsBooked}/{r.seatsTotal}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {plans.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label light>Your ride plans</Label>
          {plans.map((p) => (
            <View key={p.id} style={{ backgroundColor: colors.ink2, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.white, fontWeight: '800', fontSize: 15 }}>
                  {p.departTime}
                  {p.returnTime ? ` · back ${p.returnTime}` : ''} · {p.oneOffDate ?? daysText(p.daysOfWeek)}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.mutedOnDark, fontSize: 13 }}>
                  {p.originLabel.split(',')[0]} → {p.destinationLabel.split(',')[0]} · {p.seats} seats{p.womenOnly ? ' · women only' : ''}
                </Text>
              </View>
              {p.active ? (
                <Pressable accessibilityRole="button" onPress={() => stopPlan(p)} style={{ paddingHorizontal: 12, height: 36, borderRadius: 12, borderWidth: 1.5, borderColor: colors.mutedOnDark, justifyContent: 'center' }}>
                  <Text style={{ color: colors.white, fontWeight: '800', fontSize: 13 }}>Stop</Text>
                </Pressable>
              ) : (
                <Badge tone="neutral">stopped</Badge>
              )}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const Big = ({ value, label }: { value: string; label: string }) => (
  <View style={{ flex: 1, gap: 2 }}>
    <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{value}</Text>
    <Text style={s.small}>{label}</Text>
  </View>
);

/** "New request · on your route" pop-up with the answer countdown. */
function RequestPopup({ ride, onDone }: { ride: ManagedRide; onDone: () => void }) {
  const now = useNow(1000);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const r = ride.requests[0];
  const left = Math.max(0, Math.ceil((new Date(r.expiresAt).getTime() - now) / 1000));
  const answer = async (action: 'accept' | 'decline') => {
    setBusy(action);
    try {
      await api('POST', `/requests/${r.requestId}/${action}`);
      onDone();
    } catch (e) {
      Alert.alert('That did not work', errText(e));
      onDone();
    } finally {
      setBusy(null);
    }
  };
  const countdown = left >= 120 ? `${Math.round(left / 60)}m` : `${left}s`;
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 96, backgroundColor: colors.white, borderRadius: 26, padding: 16, gap: 12, ...s.lift, elevation: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 3, borderColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: colors.ink }}>{countdown}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.successText, letterSpacing: 0.6 }}>NEW REQUEST · {fmtTime(ride.departAt)} {dayOf(ride.departAt).toUpperCase()}</Text>
          <Text style={s.h2}>
            {shortName(r.name)}
            {r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ''}
          </Text>
          <Text style={s.small}>{[r.department, `${Math.round(r.reliability)}% reliable`, r.matchScore ? `${r.matchScore}% match` : null].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 2, backgroundColor: colors.surface, borderRadius: 14, padding: 10 }}>
          <Text style={s.small}>Pickup</Text>
          <Text numberOfLines={1} style={s.strong}>{r.pickupLabel}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 10 }}>
          <Text style={s.small}>Seats</Text>
          <Text style={s.strong}>{r.seats}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Decline" variant="ghost" style={{ flex: 1 }} loading={busy === 'decline'} disabled={!!busy} onPress={() => answer('decline')} />
        <Button label="Accept" style={{ flex: 1 }} loading={busy === 'accept'} disabled={!!busy} onPress={() => answer('accept')} />
      </View>
    </View>
  );
}

/** Not a verified driver yet: status and the way into driver sign-up (vehicle + documents on the phone). */
function BecomeDriver({ profile }: { profile: DriverProfile | null; onStart: () => void }) {
  const text = !profile
    ? 'Offer your empty seats to colleagues on your route and share the running cost. Add your vehicle and photos of your license and RC; your HR team checks them.'
    : profile.status === 'PENDING'
      ? 'Your HR team is checking your documents. You can publish rides once you are verified. Missing something? Finish it in driver sign-up.'
      : profile.status === 'REJECTED'
        ? 'HR asked you to upload a document again. Open driver sign-up to see the reason and upload a new photo.'
        : 'A document has expired. Upload the renewed one in driver sign-up.';
  return (
    <Card style={{ gap: 12 }}>
      <Badge tone={profile?.status === 'PENDING' ? 'warning' : profile ? 'danger' : 'neutral'}>{!profile ? 'Not a driver yet' : profile.status === 'PENDING' ? 'Waiting for HR' : 'Action needed'}</Badge>
      <Text style={s.h2}>{!profile ? 'Become a driver' : 'Driver verification'}</Text>
      <Text style={s.body}>{text}</Text>
      <Button label={!profile ? 'Start driver sign-up' : 'Open driver sign-up'} variant="lime" onPress={() => router.push('/driver-setup')} />
    </Card>
  );
}
