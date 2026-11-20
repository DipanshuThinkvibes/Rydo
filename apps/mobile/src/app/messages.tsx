import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { api, errText } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import type { Booking, ChatThread, DrivingRide } from '@/lib/types';
import { Icon } from '@/components/icons';
import { Avatar, BackButton, Badge, Card, Empty, Loading, Notice, s } from '@/components/ui';

interface Unread {
  total: number;
  threads: { rideId: string; count: number }[];
}
type Row = { rideId: string; role: 'Rider' | 'Driver'; title: string; sub: string; when: string; unread: number };

const LIVE = ['SCHEDULED', 'FULL', 'IN_PROGRESS'];

/**
 * Every ride where you can chat (same as the web Messages page): your confirmed seats as a rider, and your rides with
 * riders as a driver. 3 calls for the list; a driver's ride opens its rider threads (GET /rides/:id/chat) when tapped.
 */
export default function Messages() {
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ChatThread[] | 'loading' | { error: string }>>({});
  const { data: rows, reload, error } = useData<Row[]>(async () => {
    const [bookings, driving, unread] = await Promise.all([
      api<Booking[]>('GET', '/me/bookings'),
      api<DrivingRide[]>('GET', '/rides/driving').catch(() => [] as DrivingRide[]),
      api<Unread>('GET', '/me/chat/unread').catch(() => ({ total: 0, threads: [] }) as Unread),
    ]);
    const count = (id: string) => unread.threads.filter((t) => t.rideId === id).reduce((n, t) => n + t.count, 0);
    const asRider: Row[] = bookings
      .filter((b) => ['CONFIRMED', 'BOARDED'].includes(b.status) && LIVE.includes(b.ride.status))
      .map((b) => ({ rideId: b.ride.id, role: 'Rider', title: `${b.ride.from} → ${b.ride.to}`, sub: `Driver ${b.ride.driverName}`, when: b.ride.departAt, unread: count(b.ride.id) }));
    const asDriver: Row[] = driving
      .filter((r) => r.seatsBooked > 0 && LIVE.includes(r.status))
      .map((r) => ({ rideId: r.id, role: 'Driver', title: `${r.originLabel} → ${r.destinationLabel}`, sub: `${r.seatsBooked} ${r.seatsBooked === 1 ? 'rider' : 'riders'}`, when: r.departAt, unread: count(r.id) }));
    return [...asRider, ...asDriver].sort((a, b) => a.when.localeCompare(b.when));
  }, [], 20_000);

  const tap = async (r: Row) => {
    if (r.role === 'Rider') return router.push({ pathname: '/chat/[rideId]/[riderId]', params: { rideId: r.rideId, riderId: 'me' } });
    if (open === r.rideId) return setOpen(null);
    setOpen(r.rideId);
    setThreads((t) => ({ ...t, [r.rideId]: 'loading' }));
    try {
      const list = await api<ChatThread[]>('GET', `/rides/${r.rideId}/chat`);
      if (list.length === 1) {
        setOpen(null);
        router.push({ pathname: '/chat/[rideId]/[riderId]', params: { rideId: r.rideId, riderId: list[0].riderMembershipId } });
      }
      setThreads((t) => ({ ...t, [r.rideId]: list }));
    } catch (e) {
      setThreads((t) => ({ ...t, [r.rideId]: { error: errText(e) } }));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>Messages</Text>
        </View>
        <Text style={s.small}>Chat opens when a seat is confirmed, between the driver and that rider only. It closes when the ride ends.</Text>
        {error && !rows ? <Notice tone="error">Could not load your messages. {errText(error)}</Notice> : null}
        {!rows && !error ? <Loading /> : null}
        {rows?.length === 0 ? <Empty title="No chats yet">Once a driver accepts your seat, or a rider books your ride, you can message each other here.</Empty> : null}
        {rows?.map((r) => {
          const t = threads[r.rideId];
          return (
            <Card key={`${r.role}-${r.rideId}`} onPress={() => tap(r)} style={{ gap: 10 }}>
              <View style={s.row}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="chat" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={s.strong}>{r.title}</Text>
                  <Text style={s.small}>{fmtWhen(r.when)} · {r.sub}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge tone="neutral">{r.role}</Badge>
                  {r.unread > 0 ? <Badge tone="lime">{`${r.unread} new`}</Badge> : null}
                </View>
              </View>
              {open === r.rideId ? (
                t === 'loading' ? (
                  <ActivityIndicator color={colors.ink} />
                ) : t && 'error' in t ? (
                  <Notice tone="error">{t.error}</Notice>
                ) : Array.isArray(t) ? (
                  t.map((th) => (
                    <Pressable
                      key={th.riderMembershipId}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/chat/[rideId]/[riderId]', params: { rideId: r.rideId, riderId: th.riderMembershipId } })}
                      style={[s.row, { padding: 10, borderRadius: 14, backgroundColor: colors.surface }]}
                    >
                      <Avatar name={th.with.name} size={36} tone="pink" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.strong}>{th.with.name}</Text>
                        <Text numberOfLines={1} style={s.small}>{th.lastMessage?.body ?? 'No messages yet'}</Text>
                      </View>
                      {th.unread ? <Badge tone="lime">{`${th.unread}`}</Badge> : null}
                    </Pressable>
                  ))
                ) : null
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
