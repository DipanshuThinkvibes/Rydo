import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { colors } from '@/lib/theme';
import { api, errText, RequestError } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { ManageScreen } from '@/components/manage-screen';
import { Select } from '@/components/select';
import { Badge, Button, Card, Empty, Field, Label, Loading, Notice, s, Switch } from '@/components/ui';

interface Item {
  id: string;
  at: string;
  title: string;
  body: string;
  recipients: number;
  email: boolean;
}
const WHO = [
  { value: 'ALL', label: 'Everyone in the company' },
  { value: 'RIDER', label: 'Riders' },
  { value: 'DRIVER', label: 'Drivers' },
];

/** Send a message to everyone, or riders or drivers only, and see what was sent (web Manage → Announcements). */
export default function Announcements() {
  const { roles } = useSession();
  const canSend = roles.includes('ORG_ADMIN') || roles.includes('HR_ADMIN');
  const { data: items, reload, error } = useData(() => api<Item[]>('GET', '/admin/announcements'), []);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [who, setWho] = useState('ALL');
  const [email, setEmail] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      const r = await api<{ recipients: number }>('POST', '/admin/announcements', { title: title.trim(), body: body.trim(), email, audience: who === 'ALL' ? {} : { roles: [who] } });
      setTitle('');
      setBody('');
      setMsg({ tone: 'ok', text: `Sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}.` });
      await reload();
    } catch (e) {
      if (e instanceof RequestError) setFields(e.fields ?? {});
      setMsg({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ManageScreen title="Announcements" sub="Tell your employees something important. They see it in the app and on their phone." roles={['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN']} onRefresh={reload}>
      {canSend ? (
        <Card style={{ gap: 12 }}>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} error={fields.title} />
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Message</Text>
            <TextInput value={body} onChangeText={setBody} multiline maxLength={1000} accessibilityLabel="Message" style={[s.input, { height: 120, paddingTop: 14, textAlignVertical: 'top' }, fields.body ? { borderColor: colors.danger } : null]} />
            {fields.body ? <Text style={s.error}>{fields.body}</Text> : null}
          </View>
          <Select label="Send to" value={who} options={WHO} onChange={setWho} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={[s.strong, { flex: 1 }]}>Also send by email</Text>
            <Switch label="Also send by email" value={email} onChange={setEmail} />
          </View>
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <Button label="Send announcement" loading={busy} disabled={title.trim().length < 3 || body.trim().length < 3} onPress={send} />
        </Card>
      ) : null}
      <Label>Sent so far</Label>
      {error && !items ? <Notice tone="error">{errText(error)}</Notice> : null}
      {!items && !error ? <Loading /> : null}
      {items?.length === 0 ? <Empty title="Nothing sent yet" /> : null}
      {items?.map((a) => (
        <Card key={a.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[s.strong, { flex: 1 }]}>{a.title}</Text>
            <Badge tone="neutral">{`${a.recipients} people`}</Badge>
            {a.email ? <Badge tone="lime">email</Badge> : null}
          </View>
          <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(a.at)}</Text>
          <Text style={s.body}>{a.body}</Text>
        </Card>
      ))}
    </ManageScreen>
  );
}
