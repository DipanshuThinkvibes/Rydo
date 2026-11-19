import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CommuteDayView, Place, SavedPlace } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, apiWithMeta } from '@/lib/api';
import { fmtClock, fmtTime, dayOf, firstName, greeting, shortName, toPath } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useCurrentLocation } from '@/lib/location';
import { commuteEnds, getOffices, getPlaces, updateDraft } from '@/lib/places';
import { useSession } from '@/lib/session';
import type { Booking, Office, OpenSurvey, RideReq } from '@/lib/types';
import { Icon } from '@/components/icons';
import { RouteMap, type MapMarker } from '@/components/route-map';
import { TabBar } from '@/components/tab-bar';
import { Avatar, Badge, Button, Card, Logo, RoundButton, s, Sheet } from '@/components/ui';
import { AccountButton } from '@/components/account-button';
import { ModeSwitch } from '@/components/mode-switch';

interface HomeData {
  bookings: Booking[];
  requests: RideReq[];
  offices: Office[];
  places: SavedPlace[];
  week: CommuteDayView[];
  unread: number;
  chatUnread: { total: number; threads: { rideId: string; count: number }[] };
  surveys: OpenSurvey[];
}

/** Prototype screen 2: map with the "Where to?" sheet, shortcuts and the next ride. */
export default function Home() {
  const { me, membership, active, reload: reloadSession, signOut } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const here = useCurrentLocation(!!me && active);
  const { data, reload } = useData<HomeData>(
    async () => {
      const [bookings, requests, offices, places, week, notes, chatUnread, surveys] = await Promise.all([
        api<Booking[]>('GET', '/me/bookings'),
        api<RideReq[]>('GET', '/me/requests'),
        getOffices().catch(() => [] as Office[]),
        getPlaces().catch(() => [] as SavedPlace[]),
        api<CommuteDayView[]>('GET', '/me/commute?days=7').catch(() => [] as CommuteDayView[]),
        apiWithMeta<unknown[], { unread?: number }>('GET', '/me/notifications').catch(() => ({ meta: { unread: 0 } })),
        api<HomeData['chatUnread']>('GET', '/me/chat/unread').catch(() => ({ total: 0, threads: [] })),
        api<OpenSurvey[]>('GET', '/me/surveys').catch(() => [] as OpenSurvey[]),
      ]);
      return { bookings, requests, offices, places, week, unread: notes.meta.unread ?? 0, chatUnread, surveys };
    },
    [active],
    30_000,
  );

  if (!me) return <Redirect href="/welcome" />;
  if (!active) return <Waiting company={membership?.organization.name} status={membership?.status} onRefresh={reloadSession} signOut={signOut} />;

  const { home, office } = commuteEnds(data?.places, data?.offices);
  const current: Place | null = here.coords ? { label: 'Current location', ...here.coords } : null;
  const next = data?.bookings.find((b) => ['CONFIRMED', 'BOARDED'].includes(b.status) && !['COMPLETED', 'CANCELLED'].includes(b.ride.status));
  const waiting = data?.requests.find((r) => r.status === 'PENDING');
  const usual = data?.week.find((d) => d.status === 'OFFICE');
  const nextUnread = next ? (data?.chatUnread.threads.find((x) => x.rideId === next.ride.id)?.count ?? 0) : 0;
  const survey = data?.surveys.find((x) => !x.answered);

  const go = (pickup: Place | null, drop: Place | null) => {
    updateDraft({ pickup, drop });
    router.push('/plan');
  };

  const markers: MapMarker[] = [];
  if (next?.pickup) markers.push({ id: 'p', at: next.pickup, kind: 'start' });
  if (next?.drop) markers.push({ id: 'd', at: next.drop, kind: 'end', label: shortName(next.dropLabel) });
  if (here.coords) markers.push({ id: 'me', at: here.coords, kind: 'me' });
  else if (!next && home) markers.push({ id: 'home', at: home, kind: 'start' });
  if (!next && office) markers.push({ id: 'o', at: office, kind: 'end', label: office.label });

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <RouteMap style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '58%' }} routes={next ? [{ id: 'r', path: toPath(next.route), active: true }] : []} markers={markers} inset={{ top: 110, bottom: 60 }} />
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AccountButton size={48} />
          <ModeSwitch mode="ride" />
          <RoundButton icon="bell" label={data?.unread ? `${data.unread} unread notifications` : 'Notifications'} dot={!!data?.unread} onPress={() => api('POST', '/me/notifications/read').then(reload, () => undefined)} />
        </View>
        <View style={s.pillDark}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime }} />
          <Text style={{ color: colors.white, fontSize: 13, fontWeight: '700' }}>{membership?.organization.name} · verified colleagues only</Text>
        </View>
      </SafeAreaView>

      <View style={{ flex: 1 }} />
      <Sheet style={{ maxHeight: '58%', paddingBottom: 0 }}>
        <ScrollView
          contentContainerStyle={{ gap: 14, paddingBottom: 18 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}
        >
          <Text accessibilityRole="header" style={s.h2}>{greeting()}, {firstName(me.user.name)}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 18, backgroundColor: colors.surface, paddingLeft: 16, paddingRight: 6, gap: 12 }}>
            <Pressable accessibilityRole="search" accessibilityLabel="Search rides: where to?" onPress={() => (updateDraft({ leaveNow: true }), go(current ?? home, null))} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, height: '100%' }}>
              <Icon name="search" size={22} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>Where to?</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>Search rides{current ? ' from your current location' : ''}</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Schedule for later" onPress={() => (updateDraft({ leaveNow: false }), go(current ?? home, null))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.white }}>
              <Icon name="clock" size={18} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.ink }}>Later</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <RideShortcut
              icon="building"
              title="To office"
              sub={office ? `${office.label}${usual?.toOfficeTime ? ` · usually ${fmtClock(usual.toOfficeTime)}` : ''}` : 'Set your office address'}
              dark
              onPress={() => router.push({ pathname: '/to/[kind]', params: { kind: 'office' } })}
            />
            <RideShortcut
              icon="house"
              title="To home"
              sub={home ? `${home.label}${usual?.toHomeTime ? ` · usually ${fmtClock(usual.toHomeTime)}` : ''}` : 'Set your home address'}
              onPress={() => router.push({ pathname: '/to/[kind]', params: { kind: 'home' } })}
            />
          </View>

          {next ? (
            <Card onPress={() => router.push({ pathname: '/trip/[bookingId]', params: { bookingId: next.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={next.ride.driverName} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.successText, letterSpacing: 0.6 }}>
                  {next.status === 'BOARDED' ? 'ON BOARD' : next.ride.status === 'IN_PROGRESS' ? 'DRIVER ON THE WAY' : 'CONFIRMED'} · {dayOf(next.ride.departAt).toUpperCase()}
                </Text>
                <Text style={s.strong}>{fmtTime(next.ride.departAt)} with {shortName(next.ride.driverName)}</Text>
                <Text numberOfLines={1} style={s.small}>{next.ride.vehicle.color} {next.ride.vehicle.make} {next.ride.vehicle.model} · pickup {next.pickupLabel}</Text>
              </View>
              {nextUnread > 0 ? <Badge tone="lime">{`${nextUnread} new`}</Badge> : null}
              <Icon name="next" size={22} color={colors.muted} />
            </Card>
          ) : null}

          {waiting ? (
            <Card onPress={() => router.push({ pathname: '/requested', params: { requestId: waiting.id, rideId: waiting.ride.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={waiting.ride.driverName} tone="pink" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.warningText, letterSpacing: 0.6 }}>WAITING FOR DRIVER · {dayOf(waiting.ride.departAt).toUpperCase()}</Text>
                <Text style={s.strong}>{fmtTime(waiting.ride.departAt)} with {shortName(waiting.ride.driverName)}</Text>
                <Text numberOfLines={1} style={s.small}>Pickup {waiting.pickupLabel}</Text>
              </View>
            </Card>
          ) : null}

          {survey ? (
            <Card onPress={() => router.push({ pathname: '/survey/[id]', params: { id: survey.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: colors.lime, borderWidth: 2 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="star" size={20} color={colors.lime} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.strong}>{survey.title}</Text>
                <Text style={s.small}>{survey.questions.length} quick questions · anonymous</Text>
              </View>
            </Card>
          ) : null}

          <Card onPress={() => router.replace('/commute')} style={{ backgroundColor: colors.surface, borderWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="calendar" size={22} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.strong}>Plan your whole week</Text>
              <Text style={s.small}>Mark WFH days once. RYDO books your best match on office days.</Text>
            </View>
          </Card>
        </ScrollView>
      </Sheet>
      <TabBar active="home" />
    </View>
  );
}

/** One-tap ride search between the default home and default office. */
/** To office / To home: opens the screen to search and set that address and find rides to it. */
function RideShortcut({ icon, title, sub, onPress, dark }: { icon: 'building' | 'house'; title: string; sub: string; onPress: () => void; dark?: boolean }) {
  return (
    <Card onPress={onPress} style={{ flex: 1, gap: 6, padding: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: dark ? colors.ink : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={dark ? colors.lime : colors.ink} />
      </View>
      <Text style={s.strong}>{title}</Text>
      <Text numberOfLines={2} style={s.small}>{sub}</Text>
    </Card>
  );
}

/** Not approved yet: same wording as the web "Waiting for HR approval" screen. */
function Waiting({ company, status, onRefresh, signOut }: { company?: string; status?: string; onRefresh: () => Promise<void>; signOut: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const pending = status === 'PENDING';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await onRefresh(), setRefreshing(false))} />}>
        <Logo />
        <Card dark={pending}>
          <Badge tone={pending ? 'lime' : 'neutral'}>{pending ? 'Pending' : 'No access'}</Badge>
          <Text style={{ fontSize: 20, fontWeight: '800', color: pending ? colors.white : colors.ink, marginTop: 6 }}>{pending ? 'Waiting for HR approval' : 'No company access yet'}</Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: pending ? colors.mutedOnDark : colors.muted }}>
            {pending
              ? `${company ?? 'Your company'}'s HR team will approve your account soon. We'll email you; then pull down here to refresh.`
              : 'Sign up with your work email, or ask your HR team to add you to RYDO.'}
          </Text>
        </Card>
        <Button label="Sign out" variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
