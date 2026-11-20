import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, errText } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, type ThemeMode } from '@/lib/theme';
import { useTheme } from '@/lib/theme-context';
import { AccountFrame, Section, usePersonas, type Msg } from '@/components/account-hub';
import { Icon, type IconName } from '@/components/icons';
import { Loading, Notice, s, Switch } from '@/components/ui';

interface Prefs {
  emailUpdates: boolean;
  pushUpdates: boolean;
}

/** Preferences tab (web /settings): how RYDO looks and how it talks to you. */
export default function PreferencesScreen() {
  return (
    <AccountFrame tab="preferences">
      <PreferencesTab />
    </AccountFrame>
  );
}

const THEMES: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: 'light', label: 'Light', icon: 'sun' },
  { mode: 'dark', label: 'Dark', icon: 'moon' },
  { mode: 'system', label: 'Match device', icon: 'settings' },
];

function PreferencesTab() {
  const { active } = useSession();
  const personas = usePersonas();
  const { mode, setMode } = useTheme();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [msg, setMsg] = useState<Msg>();
  const isAdmin = personas.some((p) => p === 'ORG_ADMIN' || p === 'HR_ADMIN' || p === 'OPS_ADMIN');

  useEffect(() => {
    api<{ notifications: Prefs }>('GET', '/me/settings').then((r) => setPrefs(r.notifications), () => undefined);
  }, []);

  const save = async (patch: Partial<Prefs>) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    setMsg(undefined);
    try {
      const r = await api<{ notifications: Prefs }>('PATCH', '/me/settings', { notifications: patch });
      setPrefs(r.notifications);
      setMsg({ tone: 'ok', text: 'Saved.' });
    } catch (e) {
      setPrefs(before);
      setMsg({ tone: 'error', text: errText(e, 'Could not save. Try again.') });
    }
  };

  return (
    <>
      <Section icon="sparkle" title="Appearance" sub="Choose how RYDO looks on this device. Match device follows your phone.">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {THEMES.map((t) => {
            const on = mode === t.mode;
            return (
              <Pressable key={t.mode} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setMode(t.mode)} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 16, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.surface2 : colors.white }}>
                <Icon name={t.icon} size={20} />
                <Text style={{ fontWeight: on ? '800' : '600', color: colors.ink, fontSize: 13 }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section icon="bell" title="Notifications" sub="Everything still lands in your RYDO inbox. Choose how else you hear about it.">
        {!prefs ? (
          <Loading />
        ) : (
          <View style={{ gap: 12 }}>
            <Toggle label="Email me updates" hint={active ? 'Ride requests, changes and announcements, sent to your work email' : 'Updates sent to your email'} value={prefs.emailUpdates} onChange={(v) => save({ emailUpdates: v })} />
            <Toggle label="Phone notifications" hint="Push alerts on the RYDO app" value={prefs.pushUpdates} onChange={(v) => save({ pushUpdates: v })} />
          </View>
        )}
        <Text style={s.small}>Safety alerts, such as an SOS on a ride, and account notices, such as a paused account, are always sent.</Text>
        {isAdmin ? <Text style={s.small}>As an admin, approval requests and safety alerts for your company always show in your inbox, whatever you choose here.</Text> : null}
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      </Section>
    </>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.strong, { fontSize: 15 }]}>{label}</Text>
        <Text style={[s.small, { fontSize: 12 }]}>{hint}</Text>
      </View>
      <Switch label={label} value={value} onChange={onChange} />
    </View>
  );
}
