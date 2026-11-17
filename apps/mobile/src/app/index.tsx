import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@rydo/ui-tokens';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Logo, s } from '@/components/ui';

/** Phase 1 home: who you are and whether HR has approved you. Ride screens arrive in Phase 3. */
export default function Home() {
  const { me, membership, reload, signOut } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  if (!me) return <Redirect href="/sign-in" />;

  const pending = membership?.status === 'PENDING';
  const active = membership?.status === 'ACTIVE';
  const company = membership?.organization.name;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 18 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}
      >
        <Logo />

        <View style={{ gap: 4 }}>
          {company ? <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 14 }}>{company}</Text> : null}
          <Text style={s.h1}>Hi, {me.user.name.split(' ')[0]}</Text>
        </View>

        {/* Same wording as the web "Waiting for HR approval" screen */}
        <Card dark={pending}>
          <Badge tone={pending ? 'lime' : active ? 'success' : 'neutral'}>{pending ? 'Pending' : active ? 'Approved' : 'No access'}</Badge>
          <Text style={{ fontSize: 20, fontWeight: '800', color: pending ? colors.white : colors.ink, marginTop: 6 }}>
            {pending ? 'Waiting for HR approval' : active ? "You're approved" : 'No company access yet'}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: pending ? colors.mutedOnDark : colors.muted }}>
            {pending
              ? `${company ?? 'Your company'}'s HR team will approve your account soon. We'll email you; then pull down here to refresh.`
              : active
                ? `Roles: ${membership!.roles.map((r) => r.toLowerCase()).join(', ')}. Finding and offering rides comes in the next build.`
                : 'Sign up with your work email, or ask your HR team to add you to RYDO.'}
          </Text>
        </Card>

        <Button label="Sign out" variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
