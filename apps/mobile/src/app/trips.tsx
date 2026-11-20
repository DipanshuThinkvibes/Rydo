import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errText } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { fmtIn, fmtTime, fmtWhen } from '@/lib/format';
import { useData, useNow } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import type { Booking, RideReq } from '@/lib/types';
import { Icon } from '@/components/icons';
import { Stars } from '@/components/stars';
import { Avatar, BackButton, Badge, Button, Card, Empty, Loading, Notice, PinDigits, Plate, s } from '@/components/ui';

const REQ_LABEL = { PENDING: 'waiting for driver', ACCEPTED: 'accepted', DECLINED: 'declined', EXPIRED: 'no answer', CANCELLED: 'cancelled' } as const;

/** Web /trips: booked rides with their PIN, requests waiting for a driver, and recent trips to rate. */
export default function Trips() {
  const now = useNow(1000);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [rating, setRating] = useState<string | null>(null);
  const { data, reload, error } = useData(async () => {
    const [bookings, requests] = await Promise.all([api<Booking[]>('GET', '/me/bookings'), api<RideReq[]>('GET', '/me/requests')]);
    return { bookings, requests };
  }, [], 20_000);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMsg(undefined);
    try {
      const res = (await fn()) as { late?: boolean } | undefined;
      await reload();
      setMsg({ tone: 'ok', text: res?.late ? `${ok} It was inside the free-cancel window, so your reliability score went down.` : ok });
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  const bookings = data?.bookings ?? [];
  const live = bookings.filter((b) => (b.status === 'CONFIRMED' || b.status === 'BOARDED') && !['COMPLETED', 'CANCELLED'].includes(b.ride.status));
  const past = bookings.filter((b) => !live.includes(b));
  const pending = (data?.requests ?? []).filter((r) => r.status === 'PENDING');
  const recent = (data?.requests ?? []).filter((r) => r.status !== 'PENDING' && r.status !== 'ACCEPTED').slice(0, 6);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={s.h1}>My trips</Text>
            <Text style={s.small}>Your booked rides with their PIN, and requests waiting for a driver.</Text>
          </View>
        </View>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        {error && !data ? <Notice tone="error">Could not load your trips.</Notice> : null}
        {!data && !error ? <Loading /> : null}

        {data ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.h2}>Booked</Text>
              <Badge tone="neutral">{String(live.length)}</Badge>
            </View>
            {live.length === 0 ? (
              <Empty title="No booked rides">Find a ride and your PIN will show up here.</Empty>
            ) : null}
            {live.length === 0 ? <Button small label="Find a ride" onPress={() => router.push('/plan')} /> : null}
            {live.map((b) => {
              const until = new Date(b.ride.departAt).getTime() - now;
              return (
                <Card key={b.id} onPress={() => router.push({ pathname: '/trip/[bookingId]', params: { bookingId: b.id } })} style={{ gap: 12 }}>
                  <View style={{ gap: 6 }}>
                    <Text style={s.small}>{fmtWhen(b.ride.departAt)}</Text>
                    <Text style={[s.strong, { fontSize: 17 }]}>{b.ride.from} → {b.ride.to}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Badge tone="success">{b.status === 'BOARDED' ? 'on board' : b.ride.status === 'IN_PROGRESS' ? 'driver on the way' : 'confirmed'}</Badge>
                      {until > 0 ? <Badge tone={until < 3_600_000 ? 'lime' : 'neutral'}>{`leaves ${fmtIn(until)}`}</Badge> : null}
                    </View>
                  </View>
                  <View style={s.row}>
                    <Avatar name={b.ride.driverName} size={40} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.strong}>{b.ride.driverName}</Text>
                      <Text style={s.small}>{b.ride.vehicle.color} {b.ride.vehicle.make} {b.ride.vehicle.model}</Text>
                    </View>
                    <Plate plate={b.ride.vehicle.plateNumber} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Icon name="pin" size={16} />
                    <Text style={[s.small, { flex: 1 }]}>
                      Meet at <Text style={{ fontWeight: '800', color: colors.ink }}>{b.pickupLabel}</Text>
                    </Text>
                    {b.costShareEstimate ? <Badge tone="neutral">{`est. share ₹${Math.round(b.costShareEstimate)}`}</Badge> : null}
                  </View>
                  {b.pin && b.status === 'CONFIRMED' ? (
                    <View style={{ gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}>
                      <PinDigits pin={b.pin} />
                      <Text style={s.small}>Tell this PIN to the driver only inside the car. The ride starts only with it.</Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button small variant="ghost" label="Message driver" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/chat/[rideId]/[riderId]', params: { rideId: b.ride.id, riderId: 'me' } })} />
                    {b.status === 'CONFIRMED' ? (
                      <Button
                        small
                        variant="ghost"
                        label="Cancel booking"
                        style={{ flex: 1 }}
                        loading={busy === b.id}
                        disabled={!!busy}
                        onPress={() =>
                          Alert.alert('Cancel this ride?', 'Cancelling close to departure lowers your reliability score.', [
                            { text: 'Keep it', style: 'cancel' },
                            { text: 'Cancel ride', style: 'destructive', onPress: () => act(b.id, () => api('POST', `/bookings/${b.id}/cancel`, {}), 'Cancelled.') },
                          ])
                        }
                      />
                    ) : null}
                  </View>
                </Card>
              );
            })}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text style={s.h2}>Waiting for a driver</Text>
              <Badge tone={pending.length ? 'warning' : 'neutral'}>{String(pending.length)}</Badge>
            </View>
            {pending.length === 0 ? <Text style={s.small}>No open requests.</Text> : null}
            {pending.map((r) => {
              const total = new Date(r.expiresAt).getTime() - new Date(r.createdAt).getTime();
              const left = Math.max(0, new Date(r.expiresAt).getTime() - now);
              return (
                <Card key={r.id} style={{ gap: 10 }}>
                  <View style={s.row}>
                    <Avatar name={r.ride.driverName} size={40} tone="pink" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.strong}>{r.ride.driverName} · {fmtWhen(r.ride.departAt)}</Text>
                      <Text style={s.small}>Pickup {r.pickupLabel}{r.matchScore ? ` · ${r.matchScore}% match` : ''}</Text>
                    </View>
                    <Badge tone="warning">waiting</Badge>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2 }}>
                    <View style={{ width: `${total > 0 ? (left / total) * 100 : 0}%`, height: 6, borderRadius: 3, backgroundColor: colors.warningText }} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[s.small, { flex: 1 }]}>answer due by {fmtTime(r.expiresAt)}</Text>
                    <Button small variant="ghost" label="Cancel" loading={busy === r.id} disabled={!!busy} onPress={() => act(r.id, () => api('POST', `/requests/${r.id}/cancel`), 'Request cancelled.')} />
                  </View>
                </Card>
              );
            })}

            {recent.length > 0 || past.length > 0 ? (
              <>
                <Text style={[s.h2, { marginTop: 6 }]}>Recent</Text>
                <Card style={{ gap: 0, paddingVertical: 4 }}>
                  {past.map((b, i) => (
                    <View key={b.id} style={{ paddingVertical: 10, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Icon name="ticket" size={16} />
                        <Text style={[s.small, { flex: 1, color: colors.ink }]} numberOfLines={1}>{fmtWhen(b.ride.departAt)} · {b.ride.driverName}</Text>
                        {b.status === 'COMPLETED' && !b.ride.ratedDriver && rating !== b.id ? <Button small variant="soft" label="★ Rate" onPress={() => setRating(b.id)} /> : null}
                        <Badge tone={b.status === 'COMPLETED' ? 'success' : 'neutral'}>{`${b.status.toLowerCase().replace(/_/g, ' ')}${b.lateCancel ? ' (late)' : ''}`}</Badge>
                      </View>
                      {rating === b.id ? (
                        <Stars
                          busy={busy === `rate${b.id}`}
                          onRate={(stars, tags) => act(`rate${b.id}`, () => api('POST', `/rides/${b.ride.id}/ratings`, { rateeMembershipId: b.ride.driverMembershipId, stars, tags }), 'Thanks for rating.').then(() => setRating(null))}
                        />
                      ) : null}
                    </View>
                  ))}
                  {recent.map((r) => (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                      <Icon name="clock" size={16} />
                      <Text style={[s.small, { flex: 1, color: colors.ink }]} numberOfLines={1}>Request · {fmtWhen(r.ride.departAt)} · {r.ride.driverName}</Text>
                      <Badge tone="neutral">{REQ_LABEL[r.status]}</Badge>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
