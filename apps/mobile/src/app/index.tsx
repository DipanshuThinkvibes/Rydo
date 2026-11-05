import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { useSession } from '@/lib/session';
import { Button, s } from '@/components/ui';
import { useState } from 'react';

/** Phase 1 home: who you are and whether HR has approved you. Ride screens arrive in Phase 3. */
export default function Home() {
  const { me, membership, reload, signOut } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  if (!me) return <Redirect href="/sign-in" />;

  const pending = membership?.status === 'PENDING';
  const active = membership?.status === 'ACTIVE';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}
      >
        <Text style={{ color: colors.muted, fontWeight: '600' }}>{membership?.organization.name ?? 'RYDO'}</Text>
        <Text style={s.h1}>Hi, {me.user.name.split(' ')[0]}</Text>

        <View style={{ backgroundColor: pending ? colors.ink : colors.white, borderRadius: 20, padding: 18, gap: 8, borderWidth: pending ? 0 : 1, borderColor: colors.line }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: pending ? colors.white : colors.ink }}>
            {pending ? 'Waiting for HR approval' : active ? "You're approved" : 'No company access'}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: pending ? colors.mutedOnDark : colors.muted }}>
            {pending
              ? "Your HR team will approve your account soon. We'll email you, then pull down here to refresh."
              : active
                ? `Roles: ${membership!.roles.map((r) => r.toLowerCase()).join(', ')}. Finding and offering rides comes in the next build.`
                : 'Ask your HR team to add you to RYDO.'}
          </Text>
        </View>

        <Button label="Sign out" variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}