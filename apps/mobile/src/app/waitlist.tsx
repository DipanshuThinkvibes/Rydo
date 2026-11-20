import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { Alert } from '@/lib/dialog';
import { api, errText } from '@/lib/api';
import { dayLabel, fmtClock } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { BackButton, Badge, Button, Card, Empty, Loading, Notice, s } from '@/components/ui';

interface Wait {
  id: string;
  status: 'WAITING' | 'NOTIFIED' | 'MATCHED' | 'EXPIRED';
  criteria: { date: string; fromTime: string; toTime: string; pickup: { label: string }; drop: { label: string } };
  expiresAt: string;
}

const STATUS: Record<Exclude<Wait['status'], 'EXPIRED'>, { label: string; tone: 'success' | 'lime' | 'neutral' }> = {
  MATCHED: { label: 'seat asked', tone: 'success' },
  NOTIFIED: { label: 'seat open', tone: 'lime' },
  WAITING: { label: 'waiting', tone: 'neutral' },
};

/** Days you're waiting for a seat (joined in Find a ride or by the commute planner). GET/DELETE /me/waitlist. */
export default function Waitlist() {
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, reload, error } = useData(() => api<Wait[]>('GET', '/me/waitlist'), [], 30_000);
  const waits = data?.filter((w) => w.status !== 'EXPIRED');

  const leave = (w: Wait) =>
    Alert.alert('Leave the waitlist?', `${dayLabel(w.criteria.date)}, ${fmtClock(w.criteria.fromTime)}–${fmtClock(w.criteria.toTime)}`, [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusy(w.id);
          try {
            await api('DELETE', `/me/waitlist/${w.id}`);
            await reload();
          } catch (e) {
            Alert.alert('That did not work', errText(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>My waitlist</Text>
        </View>
        <Text style={s.small}>When a seat opens on one of these routes, you get it first. If you chose &quot;send the request for me&quot;, RYDO asks the driver for you.</Text>
        {error && !data ? <Notice tone="error">{errText(error)}</Notice> : null}
        {!data && !error ? <Loading /> : null}
        {waits?.length === 0 ? (
          <>
            <Empty title="Nothing waiting">In Find a ride, tap “Join waitlist” when no seat fits.</Empty>
            <Button label="Find a ride" onPress={() => router.push('/plan')} />
          </>
        ) : null}
        {waits?.map((w) => {
          const st = STATUS[w.status as keyof typeof STATUS];
          return (
            <Card key={w.id} style={[s.row, { opacity: busy === w.id ? 0.5 : 1 }]}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="clock" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.strong}>
                  {dayLabel(w.criteria.date)} · {fmtClock(w.criteria.fromTime)}–{fmtClock(w.criteria.toTime)}
                </Text>
                <Text numberOfLines={1} style={s.small}>{w.criteria.pickup.label} → {w.criteria.drop.label}</Text>
                <View style={{ flexDirection: 'row' }}>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </View>
              </View>
              {w.status === 'WAITING' ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Leave waitlist" onPress={() => leave(w)} disabled={!!busy} hitSlop={8}>
                  <Icon name="close" size={20} color={colors.danger} />
                </Pressable>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
