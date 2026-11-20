import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { Alert } from '@/lib/dialog';
import { api, errText } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { Avatar, BackButton, Card, Empty, Loading, Notice, s } from '@/components/ui';

interface Fav {
  membershipId: string;
  name: string;
  rating: number | null;
  ridesTogether: number;
  available: boolean;
}

/** Drivers you saved with ♥ in Find a ride: their rides show first for you. GET/DELETE /me/preferred-drivers. */
export default function PreferredDrivers() {
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, setData, reload, error } = useData(() => api<Fav[]>('GET', '/me/preferred-drivers'), []);

  const remove = (f: Fav) =>
    Alert.alert(`Remove ${f.name}?`, 'Their rides will no longer show first for you.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(f.membershipId);
          try {
            setData(await api<Fav[]>('DELETE', `/me/preferred-drivers/${f.membershipId}`));
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
          <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>Preferred drivers</Text>
        </View>
        <Text style={s.small}>Colleagues you like riding with. Their rides show first when you look for a ride.</Text>
        {error && !data ? <Notice tone="error">{errText(error)}</Notice> : null}
        {!data && !error ? <Loading /> : null}
        {data?.length === 0 ? <Empty title="None yet">Tap ♡ on a ride in Find a ride. Their rides then show first for you.</Empty> : null}
        {data?.map((f) => (
          <Card key={f.membershipId} style={[s.row, { opacity: busy === f.membershipId ? 0.5 : 1 }]}>
            <Avatar name={f.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.strong}>
                {f.name}
                {f.rating ? <Text style={s.small}> · ★ {f.rating.toFixed(1)}</Text> : null}
              </Text>
              <Text style={s.small}>
                {f.ridesTogether} {f.ridesTogether === 1 ? 'ride' : 'rides'} together{f.available ? '' : ' · not driving now'}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} onPress={() => remove(f)} disabled={!!busy} hitSlop={8}>
              <Icon name="close" size={20} color={colors.danger} />
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
