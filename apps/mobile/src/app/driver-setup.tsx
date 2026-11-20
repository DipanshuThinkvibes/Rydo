import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DriverStep } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { api, errText } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { STATUS_LOOK, STEP_INFO, type DriverSignup } from '@/lib/driver-signup';
import { useData } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { BackButton, Badge, Button, Card, Chip, Label, Loading, Notice, s } from '@/components/ui';

type Prefs = { noSmoking: boolean; quiet: boolean; musicOk: boolean; womenRidersOnly: boolean };
const PREFS: [keyof Prefs, string][] = [
  ['noSmoking', 'No smoking'],
  ['quiet', 'Quiet rides'],
  ['musicOk', 'Music is fine'],
  ['womenRidersOnly', 'Women riders only'],
];

/**
 * Become a driver, like the Uber driver app: a checklist of steps, each with its own status, done in any order.
 * The API works the checklist out (GET /driver/profile → checklist); HR verifies once everything is in.
 */
export default function DriverSetup() {
  const [refreshing, setRefreshing] = useState(false);
  const started = useRef(false);
  const { data, reload, error } = useData(() => api<DriverSignup | null>('GET', '/driver/profile'), [], 20_000);

  // The first visit starts the driver profile, so the checklist can show straight away.
  useEffect(() => {
    if (data !== null || started.current) return;
    started.current = true;
    api('POST', '/driver/profile', { preferences: { ac: true, noSmoking: true, musicOk: true } }).then(reload, (e) => Alert.alert('Could not start', errText(e)));
  }, [data, reload]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>Become a driver</Text>
        </View>
        {error && !data ? <Notice tone="error">{errText(error)}</Notice> : null}
        {!data ? <Loading /> : <Checklist profile={data} onChanged={reload} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Checklist({ profile, onChanged }: { profile: DriverSignup; onChanged: () => Promise<unknown> }) {
  const steps = profile.checklist;
  const done = steps.filter((x) => x.status === 'DONE' || x.status === 'IN_REVIEW').length;
  const attention = steps.filter((x) => x.status === 'NEEDS_ATTENTION').length;
  const allIn = steps.every((x) => x.status === 'DONE' || x.status === 'IN_REVIEW');

  const banner =
    profile.status === 'VERIFIED'
      ? { tone: 'success' as const, title: "You're a verified driver", text: 'You can publish rides now. Keep your licence, RC and insurance up to date.' }
      : profile.status === 'EXPIRED'
        ? { tone: 'danger' as const, title: 'A document has expired', text: 'Upload the renewed one to drive again.' }
        : attention
          ? { tone: 'danger' as const, title: `${attention} ${attention === 1 ? 'step needs' : 'steps need'} your attention`, text: 'Open it to see why and upload again.' }
          : allIn
            ? { tone: 'warning' as const, title: 'Waiting for HR', text: 'Everything is in. Your HR team checks it, usually within a working day. We will email you.' }
            : { tone: 'neutral' as const, title: 'Offer your empty seats', text: 'Drive colleagues who live on your route. Finish these steps in any order; HR checks them before your first ride.' };

  return (
    <>
      <Card dark style={{ gap: 10 }}>
        <Badge tone={banner.tone === 'neutral' ? 'lime' : banner.tone}>{`${done} of ${steps.length} steps in`}</Badge>
        <Text style={{ color: colors.onPanel, fontSize: 20, fontWeight: '800' }}>{banner.title}</Text>
        <Text style={{ color: colors.panelMuted, fontSize: 14, lineHeight: 20 }}>{banner.text}</Text>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
          {steps.map((x) => (
            <View key={x.key} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: x.status === 'DONE' ? colors.lime : x.status === 'IN_REVIEW' ? '#FCD34D' : x.status === 'NEEDS_ATTENTION' ? colors.danger : colors.panel2 }} />
          ))}
        </View>
      </Card>

      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {steps.map((x, i) => (
          <StepRow key={x.key} step={x} first={i === 0} />
        ))}
      </Card>

      {profile.status === 'VERIFIED' ? <Button label="Go to Drive" variant="lime" onPress={() => router.replace('/drive')} /> : null}
      <Preferences profile={profile} onChanged={onChanged} />
    </>
  );
}

function StepRow({ step, first }: { step: DriverStep; first: boolean }) {
  const info = STEP_INFO[step.key];
  const look = STATUS_LOOK[step.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${info.title}, ${look.label}`}
      onPress={() => router.push({ pathname: '/driver-step/[step]', params: { step: step.key } })}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, opacity: pressed ? 0.6 : 1, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }]}
    >
      <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: step.status === 'DONE' ? colors.lime : step.status === 'NEEDS_ATTENTION' ? colors.dangerBg : colors.surface2 }}>
        {step.status === 'DONE' ? <Icon name="check" size={20} color={colors.onLime} /> : <Icon name={info.icon} size={20} color={step.status === 'NEEDS_ATTENTION' ? colors.danger : colors.ink} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.strong}>{info.title}</Text>
        <Text style={[s.small, step.status === 'NEEDS_ATTENTION' && { color: colors.danger }]} numberOfLines={2}>{step.note ?? info.sub}</Text>
      </View>
      <Badge tone={look.tone}>{look.label}</Badge>
    </Pressable>
  );
}

/** Ride rules riders see before they request (PATCH /driver/profile). */
function Preferences({ profile, onChanged }: { profile: DriverSignup; onChanged: () => Promise<unknown> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (k: keyof Prefs) => {
    setBusy(k);
    try {
      await api('PATCH', '/driver/profile', { preferences: { [k]: !profile.preferences[k] } });
      await onChanged();
    } catch (e) {
      Alert.alert('Could not save', errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Label>Your ride rules</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PREFS.map(([k, l]) => (
          <Chip key={k} tone="lime" label={l} selected={!!profile.preferences[k]} disabled={busy === k} onPress={() => toggle(k)} />
        ))}
      </View>
      <Text style={s.small}>Riders see these before they request. Change them any time.</Text>
    </Card>
  );
}
