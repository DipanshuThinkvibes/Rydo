import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, errText, RequestError } from '@/lib/api';
import { fmtWhenFriendly } from '@/lib/format';
import { colors } from '@/lib/theme';
import { AccountFrame, Section, useAccount, type Msg } from '@/components/account-hub';
import { Icon } from '@/components/icons';
import { Badge, Button, Field, Loading, Notice, s } from '@/components/ui';

interface SessionRow {
  id: string;
  client: 'WEB' | 'MOBILE';
  userAgent: string | null;
  createdAt: string;
  status: 'ACTIVE' | 'SIGNED_OUT' | 'EXPIRED';
  endedAt: string | null;
  current: boolean;
}

/** "Chrome on Windows" from a browser's user-agent text; the app falls back to "RYDO app" (same as the web). */
function deviceName(x: SessionRow) {
  const ua = x.userAgent ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return x.client === 'MOBILE' ? 'RYDO app' : (browser ?? 'Web browser');
}
const SHOWN_OTHERS = 3;
const SHOWN_EARLIER = 5;

/** Security tab (web /settings/security): password, sign-in checks, and where you are signed in. */
export default function SecurityScreen() {
  return (
    <AccountFrame tab="security">
      <SecurityTab />
    </AccountFrame>
  );
}

function SecurityTab() {
  const { emailState } = useAccount();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [sMsg, setSMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string | null>(null);
  const [allOthers, setAllOthers] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [moreEarlier, setMoreEarlier] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pwMsg, setPwMsg] = useState<Msg>();

  const loadSessions = useCallback(() => api<SessionRow[]>('GET', '/me/sessions').then(setSessions, () => setSessions([])), []);
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const signOut = async (id: string | 'others') => {
    setBusy(id);
    setSMsg(undefined);
    try {
      if (id === 'others') {
        const r = await api<{ signedOut: number }>('POST', '/me/sessions/revoke-others');
        setSMsg({ tone: 'ok', text: r.signedOut ? `Signed out of ${r.signedOut} other ${r.signedOut === 1 ? 'device' : 'devices'}.` : 'No other devices were signed in.' });
      } else {
        await api('DELETE', `/me/sessions/${id}`);
        setSMsg({ tone: 'ok', text: 'That device is signed out.' });
      }
      await loadSessions();
    } catch (e) {
      setSMsg({ tone: 'error', text: errText(e, 'Something went wrong. Try again.') });
    } finally {
      setBusy(null);
    }
  };
  const changePassword = async () => {
    setBusy('pw');
    setFields({});
    setPwMsg(undefined);
    try {
      await api('POST', '/me/password', { currentPassword: current || undefined, newPassword: next });
      setCurrent('');
      setNext('');
      setPwMsg({ tone: 'ok', text: 'Password updated.' });
    } catch (err) {
      if (err instanceof RequestError) setFields(err.fields ?? {});
      setPwMsg({ tone: 'error', text: errText(err) });
    } finally {
      setBusy(null);
    }
  };

  const here = sessions?.find((x) => x.current);
  const others = sessions?.filter((x) => !x.current && x.status === 'ACTIVE') ?? [];
  const earlier = sessions?.filter((x) => x.status !== 'ACTIVE') ?? [];
  const shownOthers = allOthers ? others : others.slice(0, SHOWN_OTHERS);
  const shownEarlier = moreEarlier ? earlier : earlier.slice(0, SHOWN_EARLIER);

  return (
    <>
      <Section icon="shield" title="Password" sub="Use at least 8 characters with a letter and a number.">
        <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" error={fields.currentPassword} />
        <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={fields.newPassword} />
        <Text style={s.small}>Never set a password? Leave the current one empty.</Text>
        {pwMsg ? <Notice tone={pwMsg.tone}>{pwMsg.text}</Notice> : null}
        <Button label="Save password" loading={busy === 'pw'} disabled={!next} onPress={changePassword} />
      </Section>

      <Section icon="check" title="Sign-in checks">
        <Row label="Email verified" tone={emailState?.verified ? 'success' : 'warning'} value={emailState?.verified ? 'Yes' : 'Not yet'} />
        <Row label="Email code sign-in" tone="success" value="On" />
        {!emailState?.verified ? <Text style={s.small}>Verify your email on the Profile tab to complete this.</Text> : null}
      </Section>

      <Section icon="lock" title="Where you are signed in" sub="Your current device, other devices that are signed in, and recent sessions that ended.">
        {sessions === null ? <Loading /> : null}
        {here ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.successBg }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={here.client === 'MOBILE' ? 'chat' : 'building'} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.small, { fontWeight: '800', color: colors.successText }]}>This device</Text>
              <Text style={s.strong}>{deviceName(here)}</Text>
              <Text style={[s.small, { fontSize: 12 }]}>Signed in {fmtWhenFriendly(here.createdAt)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.successText }} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.successText }}>Active now</Text>
            </View>
          </View>
        ) : null}
        {sessions && !here ? <Text style={s.small}>We could not tell which device is yours. Pull down to reload.</Text> : null}

        {sessions ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.strong}>
                Other devices <Text style={s.small}>{others.length}</Text>
              </Text>
              {others.length > 0 ? <Button small variant="ghost" label="Sign out all others" loading={busy === 'others'} onPress={() => signOut('others')} /> : null}
            </View>
            {others.length === 0 ? (
              <Text style={s.small}>✓ No other device is signed in. Only this one.</Text>
            ) : (
              shownOthers.map((x) => (
                <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
                  <Icon name={x.client === 'MOBILE' ? 'chat' : 'building'} size={18} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.strong, { fontSize: 15 }]}>{deviceName(x)}</Text>
                    <Text style={[s.small, { fontSize: 12 }]}>Signed in {fmtWhenFriendly(x.createdAt)}</Text>
                  </View>
                  <Button small variant="ghost" label="Sign out" loading={busy === x.id} onPress={() => signOut(x.id)} />
                </View>
              ))
            )}
            {others.length > SHOWN_OTHERS ? (
              <Pressable accessibilityRole="button" onPress={() => setAllOthers(!allOthers)}>
                <Text style={[s.small, { fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }]}>{allOthers ? 'Show fewer' : `Show all ${others.length}`}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {sMsg ? <Notice tone={sMsg.tone}>{sMsg.text}</Notice> : null}

        {earlier.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showEarlier }} onPress={() => setShowEarlier(!showEarlier)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>
                  Earlier sessions <Text style={s.small}>{earlier.length}</Text>
                </Text>
                <Text style={[s.small, { fontSize: 12 }]}>not signed in any more, last 30 days</Text>
              </View>
              <Icon name="next" size={16} color={colors.muted} />
            </Pressable>
            {showEarlier
              ? shownEarlier.map((x) => (
                  <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.small, { color: colors.ink, fontWeight: '700' }]}>{deviceName(x)}</Text>
                      <Text style={[s.small, { fontSize: 12 }]}>Signed in {fmtWhenFriendly(x.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Badge tone="neutral">{x.status === 'EXPIRED' ? 'Expired' : 'Signed out'}</Badge>
                      {x.endedAt ? <Text style={[s.small, { fontSize: 11 }]}>{fmtWhenFriendly(x.endedAt)}</Text> : null}
                    </View>
                  </View>
                ))
              : null}
            {showEarlier && earlier.length > SHOWN_EARLIER ? (
              <Pressable accessibilityRole="button" onPress={() => setMoreEarlier(!moreEarlier)}>
                <Text style={[s.small, { fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }]}>{moreEarlier ? 'Show fewer' : `Show all ${earlier.length}`}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Text style={s.small}>See a device you do not recognise? Sign it out, then change your password.</Text>
      </Section>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warning' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
      <Text style={[s.strong, { fontSize: 15 }]}>{label}</Text>
      <Badge tone={tone}>{value}</Badge>
    </View>
  );
}
