import { useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { BackButton, Notice, s } from './ui';

/** Frame for the RYDO owner console screens (web /platform/*): RYDO staff only, back button, title, pull to refresh. */
export function PlatformScreen({ title, sub, onRefresh, children, header }: { title: string; sub?: string; onRefresh?: () => Promise<unknown>; children: React.ReactNode; header?: React.ReactNode }) {
  const { isPlatformAdmin } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await onRefresh().catch(() => undefined), setRefreshing(false))} /> : undefined}
        >
          {header ?? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <BackButton />
                <View style={{ flex: 1 }}>
                  <Text style={[s.small, { fontWeight: '800', letterSpacing: 1, color: colors.muted }]}>RYDO OWNER</Text>
                  <Text accessibilityRole="header" style={s.h1} numberOfLines={2}>{title}</Text>
                </View>
              </View>
              {sub ? <Text style={s.small}>{sub}</Text> : null}
            </>
          )}
          {isPlatformAdmin ? children : <Notice tone="error">RYDO owner team only.</Notice>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Small number tile used across the owner console. */
export function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <View style={[s.card, { flexBasis: '47%', flexGrow: 1, gap: 4 }]}>
      {tone ? <View style={{ width: 28, height: 6, borderRadius: 3, backgroundColor: tone }} /> : null}
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>{value}</Text>
      <Text style={[s.small, { color: colors.ink, fontWeight: '700' }]}>{label}</Text>
      {sub ? <Text style={[s.small, { fontSize: 12 }]}>{sub}</Text> : null}
    </View>
  );
}
