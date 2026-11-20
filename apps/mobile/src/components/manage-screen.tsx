import { useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OrgRoleName } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { BackButton, Notice, s } from './ui';

/**
 * Frame for the admin screens under /manage (same pages as the web admin): back button, title, pull to refresh,
 * and a role check that mirrors the API's @OrgScoped roles (the API refuses anyway; this just avoids a dead screen).
 */
export function ManageScreen({ title, sub, roles, onRefresh, children }: { title: string; sub?: string; roles?: OrgRoleName[]; onRefresh?: () => Promise<unknown>; children: React.ReactNode }) {
  const session = useSession();
  const [refreshing, setRefreshing] = useState(false);
  if (!session.isAdmin) return <Redirect href="/" />;
  const allowed = !roles || roles.some((r) => session.roles.includes(r));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await onRefresh().catch(() => undefined), setRefreshing(false))} /> : undefined}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BackButton />
            <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]} numberOfLines={1}>{title}</Text>
          </View>
          {sub ? <Text style={s.small}>{sub}</Text> : null}
          {allowed ? children : <Notice tone="error">Your admin role can&apos;t use this screen.</Notice>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A big number with a label, for the report and insight screens. */
export function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, gap: 2 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{value}</Text>
      <Text style={[s.small, { color: colors.ink, fontWeight: '700' }]}>{label}</Text>
      {sub ? <Text style={[s.small, { fontSize: 12 }]}>{sub}</Text> : null}
    </View>
  );
}

/** Simple horizontal bars: width is the value relative to the biggest (same as the web). */
export function Bars({ rows, unit = '' }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[s.small, { color: colors.ink, flex: 1 }]} numberOfLines={1}>{r.label}</Text>
            <Text style={[s.small, { color: colors.ink, fontWeight: '800' }]}>{r.value}{unit}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2 }}>
            <View style={{ width: `${(r.value / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.inkBg }} />
          </View>
        </View>
      ))}
    </View>
  );
}
