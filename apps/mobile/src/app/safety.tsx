import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_EMERGENCY_CONTACTS } from '@rydo/shared';
import { api, errText, RequestError } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import { Icon } from '@/components/icons';
import { Select } from '@/components/select';
import { Avatar, BackButton, Badge, Button, Card, Empty, Field, Label, Loading, Notice, s } from '@/components/ui';

interface Contact { id: string; name: string; phone: string; email: string | null; relation: string | null }
interface Block { membershipId: string; name: string; blockedAt: string }
interface Booking { id: string; status: string; ride: { id: string; departAt: string; status: string; from: string; to: string } }
type Msg = { tone: 'ok' | 'error'; text: string } | undefined;
const blank = { name: '', phone: '', email: '', relation: '' };

/** Web /safety: people to tell, sharing a live trip with them, and people you would rather not ride with. */
export default function Safety() {
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>();
  const [shareMsg, setShareMsg] = useState<Msg>();
  const [ride, setRide] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data, reload, error } = useData(async () => {
    const [contacts, blocks, bookings] = await Promise.all([api<Contact[]>('GET', '/me/emergency-contacts'), api<Block[]>('GET', '/me/blocks'), api<Booking[]>('GET', '/me/bookings').catch(() => [] as Booking[])]);
    const live = bookings.filter((x) => ['CONFIRMED', 'BOARDED'].includes(x.status) && ['SCHEDULED', 'FULL', 'IN_PROGRESS'].includes(x.ride.status));
    return { contacts, blocks, live };
  }, []);
  const contacts = data?.contacts ?? [];
  const chosenRide = ride || data?.live[0]?.ride.id || '';

  const save = async () => {
    setBusy(true);
    setFields({});
    setMsg(undefined);
    const body = { name: form.name, phone: form.phone, email: form.email || undefined, relation: form.relation || undefined };
    try {
      if (editing) await api('PATCH', `/me/emergency-contacts/${editing}`, body);
      else await api('POST', '/me/emergency-contacts', body);
      setForm(blank);
      setEditing(null);
      await reload();
    } catch (err) {
      if (err instanceof RequestError) setFields(err.fields ?? {});
      setMsg({ tone: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  };
  const remove = (c: Contact) =>
    Alert.alert(`Remove ${c.name}?`, undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await api('DELETE', `/me/emergency-contacts/${c.id}`);
          setPicked((p) => p.filter((x) => x !== c.id));
          reload();
        },
      },
    ]);
  const share = async () => {
    setBusy(true);
    setShareMsg(undefined);
    try {
      const r = await api<{ sentTo: { name: string }[]; skippedNoEmail: { name: string }[] }>('POST', `/rides/${chosenRide}/share/contacts`, { contactIds: picked });
      setShareMsg({ tone: 'ok', text: `Live trip link emailed to ${r.sentTo.map((c) => c.name).join(', ')}.${r.skippedNoEmail.length ? ` No email for ${r.skippedNoEmail.map((c) => c.name).join(', ')}.` : ''}` });
    } catch (err) {
      setShareMsg({ tone: 'error', text: errText(err, 'Could not share the trip.') });
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
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={s.h1}>Safety</Text>
              <Text style={s.small}>Emergency contacts, sharing a trip with them, and people you would rather not ride with.</Text>
            </View>
          </View>
          {error && !data ? <Notice tone="error">Could not load your safety settings.</Notice> : null}
          {!data && !error ? <Loading /> : null}
          {data ? (
            <>
              <Card style={{ gap: 12 }}>
                <Text style={s.h2}>
                  Emergency contacts <Text style={s.small}>({contacts.length}/{MAX_EMERGENCY_CONTACTS})</Text>
                </Text>
                {contacts.length === 0 ? <Empty title="No contacts yet">Add someone who should know when you travel.</Empty> : null}
                {contacts.map((c) => (
                  <View key={c.id} style={[s.row, { paddingVertical: 4 }]}>
                    <Avatar name={c.name} size={40} tone="pink" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.strong}>
                        {c.name} {c.relation ? <Text style={s.small}>· {c.relation}</Text> : null}
                      </Text>
                      <Text style={s.small}>{c.phone}{c.email ? ` · ${c.email}` : ' · no email (needed to share trips)'}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${c.name}`} onPress={() => (setEditing(c.id), setForm({ name: c.name, phone: c.phone, email: c.email ?? '', relation: c.relation ?? '' }))} hitSlop={6}>
                      <Text style={{ fontWeight: '800', color: colors.ink }}>Edit</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`} onPress={() => remove(c)} hitSlop={6}>
                      <Icon name="close" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
                {editing || contacts.length < MAX_EMERGENCY_CONTACTS ? (
                  <View style={{ gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}>
                    <Label>{editing ? 'Edit contact' : 'Add a contact'}</Label>
                    <Field label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} error={fields.name} />
                    <Field label="Phone" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="+91 98765 43210" keyboardType="phone-pad" error={fields.phone} />
                    <Field label="Email (to send live trips)" value={form.email} onChangeText={(email) => setForm({ ...form, email })} keyboardType="email-address" autoCapitalize="none" error={fields.email} />
                    <Field label="Relation" value={form.relation} onChangeText={(relation) => setForm({ ...form, relation })} placeholder="Mother, friend…" />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {editing ? <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={() => (setEditing(null), setForm(blank))} /> : null}
                      <Button small label={editing ? 'Save contact' : 'Add contact'} style={{ flex: 1 }} loading={busy} disabled={!form.name.trim() || form.phone.trim().length < 7} onPress={save} />
                    </View>
                  </View>
                ) : null}
                {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
              </Card>

              <Card style={{ gap: 12 }}>
                <Text style={s.h2}>Share a live trip</Text>
                <Text style={s.small}>Email the live link of your ride to chosen contacts. The link shows the route, vehicle and position, never phone numbers.</Text>
                {data.live.length === 0 ? (
                  <Text style={s.small}>You have no confirmed upcoming ride to share.</Text>
                ) : contacts.length === 0 ? (
                  <Text style={s.small}>Add a contact with an email first.</Text>
                ) : (
                  <>
                    <Select label="Ride" value={chosenRide} options={data.live.map((b) => ({ value: b.ride.id, label: `${fmtWhen(b.ride.departAt)} · ${b.ride.from} → ${b.ride.to}` }))} onChange={setRide} />
                    {contacts.map((c) => {
                      const on = picked.includes(c.id);
                      return (
                        <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: on ? colors.inkBg : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                            {on ? <Icon name="check" size={14} color={colors.lime} /> : null}
                          </View>
                          <Text style={[s.strong, { flex: 1, fontSize: 15 }]}>{c.name}</Text>
                          {!c.email ? <Badge tone="warning">no email</Badge> : null}
                        </Pressable>
                      );
                    })}
                    {shareMsg ? <Notice tone={shareMsg.tone}>{shareMsg.text}</Notice> : null}
                    <Button label="Send live link" loading={busy} disabled={!picked.length || !chosenRide} onPress={share} />
                  </>
                )}
              </Card>

              <Card style={{ gap: 12 }}>
                <Text style={s.h2}>Blocked people</Text>
                <Text style={s.small}>Blocked colleagues do not appear in your ride search, and you do not appear in theirs. You can also block someone from a chat.</Text>
                {data.blocks.length === 0 ? <Text style={s.small}>You have not blocked anyone.</Text> : null}
                {data.blocks.map((b) => (
                  <View key={b.membershipId} style={s.row}>
                    <Avatar name={b.name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.strong}>{b.name}</Text>
                      <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(b.blockedAt)}</Text>
                    </View>
                    <Button small variant="ghost" label="Unblock" onPress={async () => (await api('DELETE', `/me/blocks/${b.membershipId}`), reload())} />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
