import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { api, apiWithMeta, errText } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { BackButton, Badge, Button, Card, Empty, Loading, Notice, s } from '@/components/ui';

interface Item {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { rideId?: string; issueId?: string; surveyId?: string } | null;
  read: boolean;
  createdAt: string;
}

/** Where a notification leads on the phone, when it points somewhere (same rules as the web inbox). */
function target(n: Item, isAdmin: boolean): Href | null {
  if (n.type === 'CHAT_MESSAGE') return '/messages';
  if (n.type === 'SURVEY') return n.data?.surveyId ? { pathname: '/survey/[id]', params: { id: n.data.surveyId } } : '/account';
  if (n.type === 'ISSUE_UPDATE') return '/account';
  if (n.type === 'ISSUE_REPORTED' && isAdmin) return '/admin';
  return null;
}

/** The full notifications inbox (the bell on Home only shows a dot). GET /me/notifications, POST /me/notifications/read. */
export default function Notifications() {
  const { isAdmin } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, reload, error } = useData(() => apiWithMeta<Item[], { unread?: number }>('GET', '/me/notifications'), [], 30_000);

  const markAll = async () => {
    setBusy(true);
    try {
      await api('POST', '/me/notifications/read');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const unread = data?.meta.unread ?? 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={s.h1}>Notifications</Text>
            <Text style={s.small}>{unread ? `${unread} unread` : 'You are all caught up'}</Text>
          </View>
          {unread ? <Button small variant="ghost" label="Mark all read" loading={busy} onPress={markAll} /> : null}
        </View>
        {error && !data ? <Notice tone="error">{errText(error)}</Notice> : null}
        {!data && !error ? <Loading /> : null}
        {data?.data.length === 0 ? <Empty title="Nothing here yet">Ride requests, chat messages, issue updates and announcements show up here.</Empty> : null}
        {data?.data.map((n) => {
          const to = target(n, isAdmin);
          return (
            <Card key={n.id} onPress={to ? () => router.push(to) : undefined} style={[{ gap: 4 }, !n.read && { borderLeftWidth: 4, borderLeftColor: colors.lime }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.strong, { flex: 1 }]} numberOfLines={2}>{n.title}</Text>
                {!n.read ? <Badge tone="lime">new</Badge> : null}
              </View>
              <Text style={s.small}>{n.body}</Text>
              <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(n.createdAt)}</Text>
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
