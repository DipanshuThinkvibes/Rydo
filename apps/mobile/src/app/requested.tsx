import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Alert } from '@/lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { dayWord, firstName, fmtTime, isoDay, shortName } from '@/lib/format';
import { useData, useNow } from '@/lib/hooks';
import { draft } from '@/lib/places';
import type { Booking, RideReq } from '@/lib/types';
import { Icon } from '@/components/icons';
import { Avatar, Button, Card, Loading, Notice, s, Stat } from '@/components/ui';

/** Prototype screen 5: "Rahul accepted" (or waiting for the driver's answer). */
export default function Requested() {
  const { requestId, rideId } = useLocalSearchParams<{ requestId: string; rideId: string }>();
  const now = useNow(1000);
  const { data } = useData(
    async () => {
      const [requests, bookings] = await Promise.all([api<RideReq[]>('GET', '/me/requests'), api<Booking[]>('GET', '/me/bookings')]);
      return { req: requests.find((r) => r.id === requestId) ?? null, booking: bookings.find((b) => b.ride.id === rideId && ['CONFIRMED', 'BOARDED'].includes(b.status)) ?? null };
    },
    [requestId, rideId],
    4000,
  );
  if (!data) return <Loading />;

  const { req, booking } = data;
  const driver = shortName(booking?.ride.driverName ?? req?.ride.driverName ?? 'Your driver');

  if (booking) {
    const v = booking.ride.vehicle;
    // Pickup and drop times come from the match the rider just chose (same ride); otherwise the departure.
    const match = draft.chosen?.rideId === booking.ride.id ? draft.chosen : null;
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <StatusBar style="light" />
        <SafeAreaView style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
          <View style={{ gap: 22, paddingTop: 40 }}>
            <View style={{ alignSelf: 'center', width: 96, height: 96, borderRadius: 26, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={52} />
            </View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: colors.white }}>{firstName(driver)} accepted</Text>
              <Text style={{ fontSize: 15, color: colors.mutedOnDark }}>Your seat is confirmed for {dayWord(isoDay(0, new Date(booking.ride.departAt)))}.</Text>
            </View>
            <Card style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={driver} size={50} />
                <View style={{ flex: 1 }}>
                  <Text style={s.strong}>{driver}{match?.driver.rating ? ` · ★ ${match.driver.rating.toFixed(1)}` : ''}</Text>
                  <Text style={s.small}>{v.color} {v.make} {v.model} · {v.plateNumber}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Stat label="Pickup" value={fmtTime(match?.pickupEta ?? booking.ride.departAt)} />
                {match ? <Stat label="Drop" value={fmtTime(match.dropEta)} /> : <Stat label="Meet at" value={booking.pickupLabel.split(',')[0]} />}
                <Stat label="Seats" value={String(booking.seats)} />
              </View>
              <Text style={s.small}>We&apos;ll remind you before pickup. Your ride PIN is on the pickup details screen; say it only inside the car.</Text>
            </Card>
          </View>
          <View style={{ gap: 12 }}>
            <Button label="View pickup details" variant="lime" onPress={() => router.replace({ pathname: '/trip/[bookingId]', params: { bookingId: booking.id } })} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/chat/[rideId]/[riderId]', params: { rideId: booking.ride.id, riderId: 'me' } })}
              style={({ pressed }) => ({ height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.ink2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: colors.white, fontSize: 16, fontWeight: '800' }}>Message {firstName(driver)}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const pending = req?.status === 'PENDING';
  const left = req ? Math.max(0, new Date(req.expiresAt).getTime() - now) : 0;
  const total = req ? new Date(req.expiresAt).getTime() - new Date(req.createdAt).getTime() : 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, padding: 20, justifyContent: 'space-between' }}>
      <View style={{ gap: 22, paddingTop: 40 }}>
        <View style={{ alignSelf: 'center', width: 96, height: 96, borderRadius: 26, backgroundColor: pending ? colors.ink : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="clock" size={48} color={pending ? colors.lime : colors.ink} />
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text accessibilityRole="header" style={[s.h1, { textAlign: 'center' }]}>
            {pending ? `Request sent to ${firstName(driver)}` : req?.status === 'DECLINED' ? `${firstName(driver)} can't take this ride` : req?.status === 'EXPIRED' ? 'No answer in time' : 'Request closed'}
          </Text>
          <Text style={[s.body, { textAlign: 'center' }]}>
            {pending
              ? `${firstName(driver)} has until ${fmtTime(req!.expiresAt)} to answer. This page updates by itself.`
              : 'If auto-rematch found another driver, the new request is on your Home screen. Or pick another ride.'}
          </Text>
        </View>
        {pending && (
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' }}>
            <View style={{ height: 8, width: `${Math.max(0, Math.min(100, (left / total) * 100))}%`, backgroundColor: colors.ink, borderRadius: 4 }} />
          </View>
        )}
        {req ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={driver} />
            <View style={{ flex: 1 }}>
              <Text style={s.strong}>{driver} · {fmtTime(req.ride.departAt)}</Text>
              <Text style={s.small}>Pickup {req.pickupLabel}{req.matchScore ? ` · ${req.matchScore}% match` : ''}</Text>
            </View>
          </Card>
        ) : (
          <Notice tone="info">We couldn&apos;t find this request any more.</Notice>
        )}
      </View>
      <View style={{ gap: 12 }}>
        {pending ? (
          <Button
            label="Cancel request"
            variant="ghost"
            onPress={() =>
              api('POST', `/requests/${req!.id}/cancel`).then(
                () => router.replace('/'),
                (e) => Alert.alert('Could not cancel', errText(e)),
              )
            }
          />
        ) : (
          <Button label="See other rides" onPress={() => (router.canGoBack() ? router.back() : router.replace('/plan'))} />
        )}
        <Button label="Back to Home" variant="soft" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}
