import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { Place } from '@rydo/shared';
import { colors } from '@/lib/theme';
import { Alert } from '@/lib/dialog';
import { api, errText, RequestError } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { ManageScreen } from '@/components/manage-screen';
import { PlacePicker } from '@/components/place-picker';
import { Badge, Button, Card, Field, Label, Loading, Notice, s, Switch } from '@/components/ui';

interface Office {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}
interface Department {
  id: string;
  name: string;
  members: number;
}

/** Offices (Org Admin) and departments (Org Admin, HR), same as the web "Offices & teams" page. */
export default function Structure() {
  const { roles } = useSession();
  const editOffices = roles.includes('ORG_ADMIN');
  const editDepts = roles.includes('ORG_ADMIN') || roles.includes('HR_ADMIN');
  const { data, reload } = useData(async () => {
    const [offices, departments] = await Promise.all([api<Office[]>('GET', '/admin/offices'), api<Department[]>('GET', '/admin/departments')]);
    return { offices, departments };
  }, []);
  const [office, setOffice] = useState<{ name: string; address: string; place: Place | null; isDefault: boolean }>({ name: '', address: '', place: null, isDefault: false });
  const [picking, setPicking] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      await fn();
      await reload();
      setMsg({ tone: 'ok', text: ok });
      return true;
    } catch (e) {
      if (e instanceof RequestError) setFields(e.fields ?? {});
      setMsg({ tone: 'error', text: errText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addOffice = async () => {
    if (!office.place) return setFields({ place: 'Find the office on the map first' });
    const ok = await run(() => api('POST', '/admin/offices', { name: office.name.trim(), address: office.address.trim(), isDefault: office.isDefault, lat: office.place!.lat, lng: office.place!.lng }), 'Office added.');
    if (ok) setOffice({ name: '', address: '', place: null, isDefault: false });
  };
  const confirmDelete = (title: string, text: string, fn: () => void) => Alert.alert(title, text, [{ text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: fn }]);

  return (
    <ManageScreen title="Offices & teams" sub="Offices are where rides start or end. Departments group employees for reports and auto-accept." roles={['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN']} onRefresh={reload}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {!data ? (
        <Loading />
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <Label>Offices</Label>
            {data.offices.length === 0 ? <Text style={s.small}>No offices yet.</Text> : null}
            {data.offices.map((o) => (
              <View key={o.id} style={{ gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.strong, { flex: 1 }]}>{o.name}</Text>
                  {o.isDefault ? <Badge tone="success">default</Badge> : null}
                </View>
                <Text style={s.small}>{o.address}</Text>
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${o.lat},${o.lng}`)}>
                  <Text style={[s.small, { textDecorationLine: 'underline' }]}>{o.lat.toFixed(4)}, {o.lng.toFixed(4)} · open in Maps</Text>
                </Pressable>
                {editOffices ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {!o.isDefault ? <Button small variant="ghost" label="Make default" disabled={busy} style={{ flex: 1 }} onPress={() => run(() => api('PATCH', `/admin/offices/${o.id}`, { name: o.name, address: o.address, lat: o.lat, lng: o.lng, isDefault: true }), `${o.name} is now the default office.`)} /> : null}
                    <Button small variant="ghost" label="Delete" disabled={busy} style={{ flex: 1 }} onPress={() => confirmDelete(`Delete ${o.name}?`, 'Rides already planned keep their places.', () => run(() => api('DELETE', `/admin/offices/${o.id}`), 'Office deleted.'))} />
                  </View>
                ) : null}
              </View>
            ))}
            {editOffices ? (
              <View style={{ gap: 10, paddingTop: 4 }}>
                <Text style={s.strong}>Add an office</Text>
                <Button small variant="soft" label={office.place ? `Map point: ${office.place.label}` : 'Find the office on the map'} onPress={() => setPicking(true)} />
                {fields.place || fields.lat ? <Text style={s.error}>{fields.place ?? fields.lat}</Text> : null}
                <Field label="Office name" value={office.name} onChangeText={(name) => setOffice({ ...office, name })} error={fields.name} />
                <Field label="Address" value={office.address} onChangeText={(address) => setOffice({ ...office, address })} error={fields.address} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={[s.strong, { flex: 1 }]}>Default office</Text>
                  <Switch label="Default office" value={office.isDefault} onChange={(isDefault) => setOffice({ ...office, isDefault })} />
                </View>
                <Button small label="Add office" loading={busy} disabled={!office.name.trim() || !office.address.trim()} onPress={addOffice} />
              </View>
            ) : null}
          </Card>

          <Card style={{ gap: 12 }}>
            <Label>Departments</Label>
            {data.departments.length === 0 ? <Text style={s.small}>No departments yet.</Text> : null}
            {data.departments.map((d) =>
              renaming?.id === d.id ? (
                <View key={d.id} style={{ gap: 8 }}>
                  <Field label="New name" value={renaming.name} onChangeText={(name) => setRenaming({ id: d.id, name })} autoFocus error={fields.name} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={() => setRenaming(null)} />
                    <Button small label="Save" style={{ flex: 1 }} loading={busy} onPress={async () => (await run(() => api('PATCH', `/admin/departments/${d.id}`, { name: renaming.name.trim() }), 'Department renamed.')) && setRenaming(null)} />
                  </View>
                </View>
              ) : (
                <View key={d.id} style={[s.row, { paddingVertical: 4 }]}>
                  <Text style={[s.strong, { flex: 1 }]}>
                    {d.name} <Text style={s.small}>· {d.members} {d.members === 1 ? 'person' : 'people'}</Text>
                  </Text>
                  {editDepts ? (
                    <>
                      <Pressable accessibilityRole="button" onPress={() => setRenaming({ id: d.id, name: d.name })} hitSlop={6}>
                        <Text style={{ fontWeight: '800', color: colors.ink }}>Rename</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => confirmDelete(`Delete ${d.name}?`, 'Its people will have no department.', () => run(() => api('DELETE', `/admin/departments/${d.id}`), 'Department deleted.'))} hitSlop={6}>
                        <Text style={{ fontWeight: '800', color: colors.danger }}>Delete</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ),
            )}
            {editDepts ? (
              <View style={{ gap: 8 }}>
                <Field label="New department" value={deptName} onChangeText={setDeptName} error={renaming ? undefined : fields.name} />
                <Button small label="Add department" loading={busy} disabled={deptName.trim().length < 2} onPress={async () => (await run(() => api('POST', '/admin/departments', { name: deptName.trim() }), 'Department added.')) && setDeptName('')} />
              </View>
            ) : null}
          </Card>
        </>
      )}
      <PlacePicker
        visible={picking}
        title="Find the office"
        saved={[]}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          setOffice((o) => ({ ...o, place: p, name: o.name || p.label.split(',')[0], address: o.address || p.label }));
        }}
      />
    </ManageScreen>
  );
}
