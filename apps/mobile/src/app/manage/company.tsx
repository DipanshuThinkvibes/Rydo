import { useEffect, useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import type { OrgSettings } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { Alert } from '@/lib/dialog';
import { api, errText, RequestError } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { appendFile, pick } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { ManageScreen } from '@/components/manage-screen';
import { Button, Card, Field, Label, Loading, Notice, s, Switch } from '@/components/ui';

interface Company {
  id: string;
  name: string;
  emailDomains: string[];
  settings: OrgSettings;
  logoUrl: string | null;
}
type NumberKey = Exclude<keyof OrgSettings, 'womenOnlyEnabled' | 'costPerKmEstimate'>;
const RULES: { key: NumberKey; label: string; unit: string; help: string }[] = [
  { key: 'freeCancelHours', label: 'Free cancellation until', unit: 'hours before', help: "Cancelling later lowers the person's reliability score." },
  { key: 'driverPopupSeconds', label: 'Driver has', unit: 'seconds to answer', help: 'A live request expires after this and goes to the next match.' },
  { key: 'requestTimeoutMinutes', label: 'Scheduled requests expire after', unit: 'minutes', help: 'For rides booked ahead.' },
  { key: 'waitFreeMinutes', label: 'Driver waits for free', unit: 'minutes', help: 'At each pickup.' },
  { key: 'noShowAfterMinutes', label: 'Driver can mark no-show after', unit: 'minutes', help: 'Counted from arriving at the pickup.' },
  { key: 'pickupRadiusMeters', label: 'Pickup can be up to', unit: 'metres from the route', help: 'Used to find matching rides.' },
  { key: 'maxDetourMinutes', label: 'A pickup may add at most', unit: 'minutes', help: "To the driver's trip." },
  { key: 'longStopMinutes', label: 'Ask "Everything OK?" after a stop of', unit: 'minutes', help: 'During a live trip.' },
];

/** Company details, logo and ride rules (web Company page). Org Admins edit; HR and Ops can read. */
export default function CompanySettings() {
  const { roles, reload: reloadSession } = useSession();
  const editable = roles.includes('ORG_ADMIN');
  const { data, setData } = useData(() => api<Company>('GET', '/admin/org'), []);
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [settings, setSettings] = useState<OrgSettings>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setDomains(data.emailDomains.join(', '));
    setSettings(data.settings);
  }, [data]);

  const run = async (fn: () => Promise<Company>, ok: string) => {
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      setData(await fn());
      setMsg({ tone: 'ok', text: ok });
      await reloadSession();
    } catch (e) {
      if (e instanceof RequestError) setFields(e.fields ?? {});
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(() => api<Company>('PATCH', '/admin/org', { name: name.trim(), emailDomains: domains.split(',').map((d) => d.trim()).filter(Boolean), settings }), 'Saved.');

  const uploadLogo = () =>
    Alert.alert('Company logo', 'PNG, JPG or WebP, up to 1 MB.', [
      { text: 'Choose from gallery', onPress: () => logoFrom(false) },
      { text: 'Take a photo', onPress: () => logoFrom(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  const logoFrom = async (camera: boolean) => {
    const file = await pick(camera);
    if (!file) return;
    const form = new FormData();
    await appendFile(form, 'file', file);
    await run(() => api<Company>('POST', '/admin/org/logo', form), 'Logo updated.');
  };

  return (
    <ManageScreen title="Company" sub={editable ? "Your company's details and ride rules. Changes apply to new rides." : 'Only Org Admins can change these.'} roles={['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN']}>
      {!data || !settings ? (
        <Loading />
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <Label>Details</Label>
            <View style={s.row}>
              <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {data.logoUrl ? <Image source={{ uri: data.logoUrl }} accessibilityLabel={`${data.name} logo`} style={{ width: 64, height: 64 }} resizeMode="contain" /> : <Text style={s.small}>No logo</Text>}
              </View>
              {editable ? <Button small variant="ghost" label="Upload logo" disabled={busy} onPress={uploadLogo} /> : null}
            </View>
            <Field label="Company name" value={name} onChangeText={setName} editable={editable} error={fields.name} />
            <Field label="Employee email domains (comma separated)" value={domains} onChangeText={setDomains} editable={editable} autoCapitalize="none" autoCorrect={false} error={fields.emailDomains ?? fields['emailDomains.0']} />
            <Text style={s.small}>Only people with these email domains can sign up for this company.</Text>
          </Card>

          <Card style={{ gap: 14 }}>
            <Label>Ride rules</Label>
            {RULES.map((r) => (
              <View key={r.key} style={{ gap: 6 }}>
                <Text style={s.label}>{r.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TextInput
                    value={String(settings[r.key])}
                    onChangeText={(v) => setSettings({ ...settings, [r.key]: Number(v.replace(/\D/g, '') || 0) })}
                    editable={editable}
                    keyboardType="number-pad"
                    accessibilityLabel={`${r.label} (${r.unit})`}
                    style={[s.input, { width: 100 }]}
                  />
                  <Text style={[s.small, { flex: 1 }]}>{r.unit}</Text>
                </View>
                <Text style={[s.small, fields[`settings.${r.key}`] ? { color: colors.danger } : null]}>{fields[`settings.${r.key}`] ?? r.help}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[s.strong, { flex: 1 }]}>Offer women-only rides</Text>
              <Switch label="Offer women-only rides" value={settings.womenOnlyEnabled} disabled={!editable} onChange={(v) => setSettings({ ...settings, womenOnlyEnabled: v })} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Running cost estimate (₹ per km)</Text>
              <TextInput
                value={settings.costPerKmEstimate == null ? '' : String(settings.costPerKmEstimate)}
                onChangeText={(v) => setSettings({ ...settings, costPerKmEstimate: v.trim() === '' ? null : Number(v.replace(/[^\d.]/g, '')) })}
                editable={editable}
                keyboardType="decimal-pad"
                placeholder="Not set"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Running cost estimate in rupees per km"
                style={[s.input, { width: 140 }]}
              />
              <Text style={s.small}>Leave empty to hide cost estimates from riders.</Text>
            </View>
          </Card>

          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          {editable ? <Button label="Save changes" loading={busy} onPress={save} /> : null}
        </>
      )}
    </ManageScreen>
  );
}
