import { useState } from 'react';
import { Text, View } from 'react-native';
import { colors } from '@rydo/ui-tokens';
import { Alert } from '@/lib/dialog';
import { api, errText, RequestError } from '@/lib/api';
import { dayOf } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { ManageScreen } from '@/components/manage-screen';
import { Select } from '@/components/select';
import { Badge, Button, Card, Empty, Field, Loading, Notice, s } from '@/components/ui';

interface Result {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  audienceSize: number;
  responses: number;
  responseRate: number | null;
  publishedAt: string | null;
  perQuestion?: { id: string; type: string; text: string; answered: number; average?: number | null; distribution?: Record<string, number>; counts?: Record<string, number>; answers?: string[] }[];
}
type Q = { type: 'RATING' | 'CHOICE' | 'TEXT'; text: string; options: string };
const TONE = { DRAFT: 'neutral', PUBLISHED: 'lime', CLOSED: 'ink' } as const;
const AUDIENCE = [
  { value: 'ALL', label: 'Everyone in the company' },
  { value: 'RIDER', label: 'Riders' },
  { value: 'DRIVER', label: 'Drivers' },
];
const TYPES = [
  { value: 'RATING', label: 'Rating 1 to 5' },
  { value: 'CHOICE', label: 'Pick one' },
  { value: 'TEXT', label: 'Written answer' },
];
const blank = (): Q => ({ type: 'RATING', text: '', options: '' });

/** Create, publish, close and read surveys (web Manage → Surveys). Answers are anonymous. */
export default function ManageSurveys() {
  const { data: list, reload, error } = useData(() => api<Result[]>('GET', '/admin/surveys'), []);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [who, setWho] = useState('ALL');
  const [questions, setQuestions] = useState<Q[]>([blank()]);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);
  const setQ = (i: number, patch: Partial<Q>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const create = async () => {
    setBusy(true);
    setMsg(undefined);
    try {
      await api('POST', '/admin/surveys', {
        title: title.trim(),
        description: description.trim() || undefined,
        audience: who === 'ALL' ? {} : { roles: [who] },
        questions: questions.map((q, i) => ({ id: `q${i + 1}`, type: q.type, text: q.text.trim(), ...(q.type === 'CHOICE' ? { options: q.options.split(',').map((o) => o.trim()).filter(Boolean) } : {}) })),
      });
      setTitle('');
      setDescription('');
      setQuestions([blank()]);
      setForm(false);
      setMsg({ tone: 'ok', text: 'Saved as a draft. Publish it when you are ready.' });
      await reload();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof RequestError ? (Object.values(e.fields ?? {})[0] ?? e.message) : errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, what: 'publish' | 'close' | 'delete') => {
    setMsg(undefined);
    try {
      if (what === 'delete') await api('DELETE', `/admin/surveys/${id}`);
      else await api('POST', `/admin/surveys/${id}/${what}`);
      await reload();
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
    }
  };
  const confirm = (sv: Result, what: 'publish' | 'close' | 'delete') =>
    Alert.alert(
      what === 'publish' ? 'Publish this survey?' : what === 'close' ? 'Close this survey?' : 'Delete this draft?',
      what === 'publish' ? 'Everyone in the audience is notified and can answer.' : what === 'close' ? 'No more answers are accepted.' : undefined,
      [{ text: 'Cancel', style: 'cancel' }, { text: what === 'publish' ? 'Publish' : what === 'close' ? 'Close' : 'Delete', style: what === 'delete' ? 'destructive' : 'default', onPress: () => act(sv.id, what) }],
    );

  return (
    <ManageScreen title="Surveys" sub="Ask everyone, or just riders or drivers. Answers are anonymous." roles={['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN']} onRefresh={reload}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {!form ? <Button label="New survey" onPress={() => setForm(true)} /> : null}
      {form ? (
        <Card style={{ gap: 12 }}>
          <Field label="Title" value={title} onChangeText={setTitle} />
          <Field label="Short description (optional)" value={description} onChangeText={setDescription} />
          <Select label="Who gets it" value={who} options={AUDIENCE} onChange={setWho} />
          {questions.map((q, i) => (
            <View key={i} style={{ gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}>
              <Select label={`Question ${i + 1} type`} value={q.type} options={TYPES} onChange={(v) => setQ(i, { type: v as Q['type'] })} />
              <Field label="Question" value={q.text} onChangeText={(text) => setQ(i, { text })} />
              {q.type === 'CHOICE' ? <Field label="Options, separated by commas" value={q.options} onChangeText={(options) => setQ(i, { options })} placeholder="More rides, Better routes" /> : null}
              {questions.length > 1 ? <Button small variant="ghost" label="Remove question" onPress={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} /> : null}
            </View>
          ))}
          {questions.length < 20 ? <Button small variant="ghost" label="Add question" onPress={() => setQuestions([...questions, blank()])} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={() => setForm(false)} />
            <Button small label="Save as draft" style={{ flex: 1 }} loading={busy} disabled={title.trim().length < 3 || questions.some((q) => q.text.trim().length < 3)} onPress={create} />
          </View>
        </Card>
      ) : null}
      {error && !list ? <Notice tone="error">{errText(error)}</Notice> : null}
      {!list && !error ? <Loading /> : null}
      {list?.length === 0 && !form ? <Empty title="No surveys yet">Create one to hear from your employees.</Empty> : null}
      {list?.map((sv) => (
        <Card key={sv.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.strong, { flex: 1 }]}>{sv.title}</Text>
            <Badge tone={TONE[sv.status]}>{sv.status.toLowerCase()}</Badge>
          </View>
          <Text style={s.small}>{sv.status === 'DRAFT' ? 'Not sent yet' : `${sv.responses}/${sv.audienceSize} answered${sv.publishedAt ? ` · sent ${dayOf(sv.publishedAt)}` : ''}`}</Text>
          {sv.description ? <Text style={s.small}>{sv.description}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {sv.status === 'DRAFT' ? <Button small label="Publish" onPress={() => confirm(sv, 'publish')} /> : null}
            {sv.status === 'DRAFT' ? <Button small variant="ghost" label="Delete draft" onPress={() => confirm(sv, 'delete')} /> : null}
            {sv.status === 'PUBLISHED' ? <Button small variant="ghost" label="Close" onPress={() => confirm(sv, 'close')} /> : null}
            {sv.status !== 'DRAFT' ? <Button small variant="ghost" label={open === sv.id ? 'Hide results' : 'See results'} onPress={() => setOpen(open === sv.id ? null : sv.id)} /> : null}
          </View>
          {open === sv.id ? <Results id={sv.id} /> : null}
        </Card>
      ))}
    </ManageScreen>
  );
}

function Results({ id }: { id: string }) {
  const { data: r, error } = useData(() => api<Result>('GET', `/admin/surveys/${id}`), [id]);
  if (error && !r) return <Notice tone="error">{errText(error)}</Notice>;
  if (!r) return <Loading />;
  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      <Text style={s.small}>
        <Text style={s.strong}>{r.responses}</Text> of {r.audienceSize} answered{r.responseRate != null ? ` (${Math.round(r.responseRate * 100)}%)` : ''}. Results are anonymous.
      </Text>
      {r.perQuestion?.map((q) => (
        <View key={q.id} style={{ gap: 4, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
          <Text style={s.strong}>{q.text} <Text style={s.small}>({q.answered} answers)</Text></Text>
          {q.type === 'RATING' ? <Text style={s.small}>Average {q.average ?? '–'} · {Object.entries(q.distribution ?? {}).map(([k, v]) => `${k}★ ${v}`).join('  ')}</Text> : null}
          {q.type === 'CHOICE' ? Object.entries(q.counts ?? {}).map(([o, n]) => <Text key={o} style={s.small}>{o}: <Text style={s.strong}>{n}</Text></Text>) : null}
          {q.type === 'TEXT' ? (q.answers?.length ? q.answers.map((a, i) => <Text key={i} style={s.small}>“{a}”</Text>) : <Text style={s.small}>No written answers.</Text>) : null}
        </View>
      ))}
    </View>
  );
}
