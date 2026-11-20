import { useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ISSUE_CATEGORIES } from '@rydo/shared';
import { api, errText, RequestError } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import { Select } from '@/components/select';
import { BackButton, Badge, Button, Card, Empty, Loading, Notice, s } from '@/components/ui';

const LABEL: Record<string, string> = {
  UNSAFE_DRIVING: 'Unsafe driving',
  HARASSMENT: 'Harassment or conduct',
  LATE_OR_NO_SHOW: 'Late or no-show',
  ROUTE: 'Route problem',
  COST: 'Cost or payment question',
  APP_BUG: 'App problem',
  OTHER: 'Other',
};
const TONE = { OPEN: 'warning', IN_PROGRESS: 'ink', RESOLVED: 'success' } as const;
interface Issue { id: string; category: string; categoryLabel: string; description: string; status: keyof typeof TONE; resolution: string | null; ride: { from?: string; to?: string; departAt?: string } | null; createdAt: string }

/** Web /issues: report a problem to your company's admins and follow it until it is resolved. */
export default function Issues() {
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('APP_BUG');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);
  const { data: items, reload } = useData(() => api<Issue[]>('GET', '/me/issues').catch(() => [] as Issue[]), []);

  const submit = async () => {
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      await api('POST', '/me/issues', { category, description });
      setDescription('');
      setMsg({ tone: 'ok', text: "Thank you. Your company's admins have been told and will look into it." });
      await reload();
    } catch (err) {
      if (err instanceof RequestError) setFields(err.fields ?? {});
      setMsg({ tone: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BackButton />
            <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>Report an issue</Text>
          </View>
          <Text style={s.small}>Unsafe driving, conduct, a late driver, a wrong route or an app problem. In an emergency during a ride, use SOS on the trip screen.</Text>
          <Card style={{ gap: 12 }}>
            <Select label="What happened?" value={category} options={ISSUE_CATEGORIES.map((c) => ({ value: c, label: LABEL[c] }))} onChange={setCategory} />
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Tell us more</Text>
              <TextInput value={description} onChangeText={setDescription} multiline maxLength={2000} accessibilityLabel="Tell us more" style={[s.input, { height: 130, paddingTop: 14, textAlignVertical: 'top' }, fields.description ? { borderColor: colors.danger } : null]} />
              {fields.description ? <Text style={s.error}>{fields.description}</Text> : <Text style={s.small}>At least 10 characters. Do not include passwords.</Text>}
            </View>
            {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
            <Button label="Send report" loading={busy} disabled={description.trim().length < 10} onPress={submit} />
          </Card>
          <Text style={s.h2}>My reports</Text>
          {!items ? <Loading /> : null}
          {items?.length === 0 ? <Empty title="No reports yet">Anything you report shows up here with its status.</Empty> : null}
          {items?.map((i) => (
            <Card key={i.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.strong, { flex: 1 }]}>{i.categoryLabel}</Text>
                <Badge tone={TONE[i.status]}>{i.status.replace('_', ' ').toLowerCase()}</Badge>
              </View>
              <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(i.createdAt)}</Text>
              <Text style={s.body}>{i.description}</Text>
              {i.ride?.from ? <Text style={s.small}>Ride: {i.ride.from} → {i.ride.to}</Text> : null}
              {i.resolution ? (
                <Text style={s.small}>
                  <Text style={{ fontWeight: '800', color: colors.ink }}>Resolved:</Text> {i.resolution}
                </Text>
              ) : null}
            </Card>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
