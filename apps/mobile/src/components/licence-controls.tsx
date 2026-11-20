import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { LicenseProduct } from '@rydo/shared';
import { api, RequestError, errText } from '@/lib/api';
import { inDays, type LicenseRow } from '@/lib/platform';
import { colors } from '@/lib/theme';
import { Button, Field, Notice, s } from './ui';

type Mode = 'issue' | 'pause' | 'resume' | 'revoke' | null;
const PRESETS: { label: string; days: number | null }[] = [
  { label: '1 month', days: 30 },
  { label: '3 months', days: 91 },
  { label: '6 months', days: 182 },
  { label: '1 year', days: 365 },
  { label: 'No end date', days: null },
];

/** Issue or renew a licence with an end date, pause, resume, revoke (web components/license-actions.tsx). */
export function LicenceControls({ orgId, product, state, endsOn, onChanged }: { orgId: string; product: LicenseProduct; state: LicenseRow['state']; endsOn?: string | null; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [end, setEnd] = useState<string | null>(endsOn ? endsOn.slice(0, 10) : inDays(365));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const base = `/admin/platform/organizations/${orgId}/licenses/${product}`;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      setMode(null);
      setReason('');
      onChanged();
    } catch (e) {
      setError(e instanceof RequestError && e.fields ? Object.values(e.fields)[0] : errText(e, 'Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  const open = (m: Mode) => {
    setError(undefined);
    setMode(mode === m ? null : m);
  };
  const issued = state !== 'NONE';

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button small variant={issued ? 'ghost' : 'primary'} label={issued ? 'Renew or change dates' : 'Issue licence'} onPress={() => open('issue')} />
        {state === 'ACTIVE' || state === 'SCHEDULED' ? <Button small variant="ghost" label="Pause" onPress={() => open('pause')} /> : null}
        {state === 'SUSPENDED' ? <Button small variant="ghost" label="Resume" onPress={() => open('resume')} /> : null}
        {issued && state !== 'REVOKED' ? <Button small variant="ghost" label="Revoke" onPress={() => open('revoke')} /> : null}
      </View>
      {mode === 'issue' ? (
        <View style={{ gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}>
          <Text style={s.label}>Valid until</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map((p) => {
              const v = p.days === null ? null : inDays(p.days);
              const on = end === v;
              return (
                <Pressable key={p.label} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setEnd(v)} style={{ paddingHorizontal: 12, height: 36, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.ink : colors.lineStrong, backgroundColor: on ? colors.surface2 : colors.white }}>
                  <Text style={{ fontWeight: on ? '800' : '600', color: colors.ink, fontSize: 13 }}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Field label="Or type a date (YYYY-MM-DD)" value={end ?? ''} onChangeText={(v) => setEnd(v.trim() || null)} placeholder={inDays(365)} keyboardType="numbers-and-punctuation" maxLength={10} />
          <Text style={s.small}>{end ? 'The licence works through the end of that day.' : 'The licence has no end date until you change it.'}</Text>
          <Button small label={issued ? 'Save licence' : 'Issue licence'} loading={busy} onPress={() => run(() => api('PUT', base, { expiresAt: end }))} />
        </View>
      ) : null}
      {mode === 'pause' || mode === 'resume' || mode === 'revoke' ? (
        <View style={{ gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}>
          <Text style={s.label}>{mode === 'pause' ? 'Why are you pausing it?' : mode === 'resume' ? 'Why are you resuming it?' : 'Why are you revoking it?'}</Text>
          <TextInput value={reason} onChangeText={setReason} multiline maxLength={300} accessibilityLabel="Reason" style={[s.input, { height: 70, paddingTop: 12, textAlignVertical: 'top' }]} />
          <Text style={s.small}>
            {mode === 'pause' ? 'The company loses this product straight away. You can resume it any time.' : mode === 'resume' ? 'The company gets this product back straight away.' : 'The company loses this product straight away. To bring it back later, issue it again.'}
          </Text>
          <Button
            small
            variant={mode === 'revoke' ? 'danger' : 'primary'}
            label={mode === 'pause' ? 'Pause licence' : mode === 'resume' ? 'Resume licence' : 'Revoke licence'}
            loading={busy}
            disabled={reason.trim().length < 5}
            onPress={() => run(() => api('POST', `${base}/${mode === 'pause' ? 'suspend' : mode}`, { reason }))}
          />
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}
