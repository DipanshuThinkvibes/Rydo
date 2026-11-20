import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, apiWithMeta } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { Icon, type IconName } from '@/components/icons';
import { LicenceBanner } from '@/components/licence-banner';
import { BackButton, Badge, Button, Card, Loading, Notice, s } from '@/components/ui';

interface Booking { id: string; status: string; ride: { id: string; departAt: string; status: string; from: string; to: string; driverName: string } }
interface Driving { id: string; originLabel: string; destinationLabel: string; departAt: string; seatsBooked: number; seatsTotal: number; status: string; pendingRequests: number }
const LIVE = ['SCHEDULED', 'FULL', 'IN_PROGRESS'];

/** Web /dashboard: your next ride, what needs attention, and the usual things to do. */
export default function Dashboard() {
  const { me, membership, isAdmin, features } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const { data, reload, error } = useData(async () => {
    const [bookings, driving, chat, notices, surveys] = await Promise.all([
      api<Booking[]>('GET', '/me/bookings').catch(() => [] as Booking[]),
      api<Driving[]>('GET', '/rides/driving').catch(() => [] as Driving[]),
      api<{ total: number }>('GET', '/me/chat/unread').catch(() => ({ total: 0 })),
      apiWithMeta<unknown[], { unread?: number }>('GET', '/me/notifications').catch(() => ({ data: [], meta: { unread: 0 } })),
      api<{ answered: boolean }[]>('GET', '/me/surveys').catch(() => []),
    ]);
    return { bookings, driving, unreadChat: chat.total, unreadNotices: notices.meta.unread ?? 0, openSurveys: surveys.filter((x) => !x.answered).length };
  }, [], 30_000);

  const share = features.share !== false;
  const first = (me?.user.name ?? '').split(' ')[0];
  const upcoming = data
    ? [
        ...data.bookings
          .filter((b) => ['CONFIRMED', 'BOARDED'].includes(b.status) && LIVE.includes(b.ride.status))
          .map((b) => ({ key: b.id, rideId: b.ride.id, role: 'Rider' as const, from: b.ride.from, to: b.ride.to, at: b.ride.departAt, status: b.ride.status, sub: `Driver ${b.ride.driverName}`, href: { pathname: '/trip/[bookingId]', params: { bookingId: b.id } } as Href, chat: { pathname: '/chat/[rideId]/[riderId]', params: { rideId: b.ride.id, riderId: 'me' } } as Href })),
        ...data.driving
          .filter((r) => LIVE.includes(r.status))
          .map((r) => ({ key: r.id, rideId: r.id, role: 'Driver' as const, from: r.originLabel, to: r.destinationLabel, at: r.departAt, status: r.status, sub: `${r.seatsBooked}/${r.seatsTotal} seats booked`, href: { pathname: '/driving/[rideId]', params: { rideId: r.id } } as Href, chat: '/messages' as Href })),
      ].sort((a, b) => a.at.localeCompare(b.at))
    : [];
  const next = upcoming[0];
  const pendingRequests = data?.driving.reduce((n, r) => n + (LIVE.includes(r.status) ? r.pendingRequests : 0), 0) ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={s.h1}>{first ? `Hi, ${first}` : 'Dashboard'}</Text>
            {membership ? <Text style={s.small}>{membership.organization.name} · here is what needs your attention</Text> : null}
          </View>
        </View>
        <LicenceBanner />
        {error && !data ? <Notice tone="error">Could not load your dashboard. Try again in a moment.</Notice> : null}
        {!data && !error ? <Loading /> : null}
        {data ? (
          <>
            {next ? (
              <Card dark style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <Badge tone="lime">Next ride</Badge>
                  <Badge tone="neutral">{next.role}</Badge>
                  {next.status === 'IN_PROGRESS' ? <Badge tone="success">live now</Badge> : null}
                  <Text style={{ color: colors.panelMuted, fontSize: 13, marginLeft: 'auto' }}>{fmtWhen(next.at)}</Text>
                </View>
                <Text style={{ color: colors.onPanel, fontSize: 20, fontWeight: '800' }}>{next.from} → {next.to}</Text>
                <Text style={{ color: colors.panelMuted }}>{next.sub}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button small variant="lime" label={next.status === 'IN_PROGRESS' ? 'Open live trip' : 'View ride'} style={{ flex: 1 }} onPress={() => router.push(next.href)} />
                  <Button small variant="ghost" label="Messages" style={{ flex: 1 }} onPress={() => router.push(next.chat)} />
                </View>
              </Card>
            ) : (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="car" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.strong}>No ride planned yet</Text>
                  <Text style={s.small}>Find a colleague going your way, or offer your own seats.</Text>
                </View>
                {share ? <Button small label="Find a ride" onPress={() => router.push('/plan')} /> : null}
              </Card>
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Tile href="/messages" icon="chat" label="Unread messages" value={data.unreadChat} />
              <Tile href="/notifications" icon="bell" label="New notifications" value={data.unreadNotices} />
              <Tile href="/surveys" icon="clipboard" label="Surveys to answer" value={data.openSurveys} />
              <Tile href="/drive" icon="wheel" label="Seat requests" value={pendingRequests} hint="waiting for your answer" />
            </View>

            {upcoming.length > 1 ? (
              <View style={{ gap: 8 }}>
                <Text style={s.h2}>Coming up</Text>
                {upcoming.slice(1, 5).map((u) => (
                  <Card key={u.key} onPress={() => router.push(u.href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Badge tone="neutral">{u.role}</Badge>
                    <Text style={[s.strong, { flex: 1, fontSize: 15 }]} numberOfLines={1}>{u.from} → {u.to}</Text>
                    <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(u.at)}</Text>
                  </Card>
                ))}
              </View>
            ) : null}

            <View style={{ gap: 8 }}>
              <Text style={s.h2}>Quick actions</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {share ? (
                  <>
                    <Quick href="/plan" icon="search" label="Find a ride" />
                    <Quick href="/publish" icon="wheel" label="Offer a ride" />
                    <Quick href="/commute" icon="calendar" label="Plan my week" />
                  </>
                ) : null}
                <Quick href="/safety" icon="shield" label="Safety" />
                <Quick href="/issues" icon="flag" label="Report an issue" />
                {isAdmin ? <Quick href="/admin" icon="route" label="Admin: today's rides" /> : null}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ href, icon, label, value, hint }: { href: Href; icon: IconName; label: string; value: number | string; hint?: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={({ pressed }) => [s.card, { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.8 : 1 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>{value}</Text>
        <Text style={[s.small, { fontSize: 12 }]}>{label}</Text>
        {hint ? <Text style={[s.small, { fontSize: 11 }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

function Quick({ href, icon, label }: { href: Href; icon: IconName; label: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.white, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={16} />
      <Text style={{ fontWeight: '700', color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}
