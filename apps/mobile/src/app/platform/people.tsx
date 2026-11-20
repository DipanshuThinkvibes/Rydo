import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api, errText, RequestError } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import type { Client } from '@/lib/platform';
import { colors } from '@/lib/theme';
import { PlatformScreen } from '@/components/platform-screen';
import { Select } from '@/components/select';
import { Avatar, Badge, Button, Card, Empty, Field, Loading, Notice, s } from '@/components/ui';

interface Person {
  id: string;
  name: string;
  email: string;
  organization: { id: string; name: string };
  roles: string[];
  department: string | null;
  status: string;
  blocked: boolean;
  blockedAt: string | null;
  blockReason: string | null;
  reportsAgainst: number;
  recentReportsAgainst: number;
  flagged: boolean;
}
interface PeopleResult {
  total: number;
  page: number;
  pageSize: number;
  rows: Person[];
}
interface Detail extends Person {
  reports: { id: string; category: string; status: string; description: string; createdAt: string }[];
  history: { action: string; createdAt: string; after: { reason?: string } | null }[];
}
const label = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');

/** Web /platform/people: everyone on every client, shortened and masked. The super admin can block or unblock a person; nothing private is shown. */
export default function People() {
  const params = useLocalSearchParams<{ org?: string; q?: string; filter?: string }>();
  const [org, setOrg] = useState(params.org ?? '');
  const [text, setText] = useState(params.q ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const [filter, setFilter] = useState(params.filter ?? '');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();

  const fetchPeople = () => {
    const p = new URLSearchParams({ page: String(page) });
    if (org) p.set('orgId', org);
    if (q) p.set('q', q);
    if (filter === 'blocked') p.set('blocked', 'true');
    if (filter === 'flagged') p.set('flagged', 'true');
    return api<PeopleResult>('GET', `/admin/platform/people?${p}`);
  };
  const { data: clients } = useData(() => api<Client[]>('GET', '/admin/platform/organizations').catch(() => [] as Client[]), []);
  const { data, setData, reload, error } = useData(fetchPeople, [org, q, filter, page]);

  const reset = (fn: () => void) => {
    setData(undefined);
    setPage(1);
    fn();
  };
  function toggle(p: Person) {
    setMsg(undefined);
    setReason('');
    if (open === p.id) return setOpen(null);
    setOpen(p.id);
    setDetail(null);
    api<Detail>('GET', `/admin/platform/people/${p.id}`).then(setDetail, () => undefined);
  }
  async function act(p: Person, kind: 'block' | 'unblock') {
    setBusy(true);
    setMsg(undefined);
    try {
      await api('POST', `/admin/platform/people/${p.id}/${kind}`, { reason });
      setMsg({ tone: 'ok', text: kind === 'block' ? `${p.name} is blocked in ${p.organization.name}. They were told, and only RYDO can lift it.` : `${p.name} can use ${p.organization.name} again.` });
      setReason('');
      const [list, one] = await Promise.all([fetchPeople(), api<Detail>('GET', `/admin/platform/people/${p.id}`)]);
      setData(list);
      setDetail(one);
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof RequestError ? (e.fields?.reason ?? e.message) : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <PlatformScreen title="People" sub="Employees of every client. Names and emails are shortened, and phone numbers, ID proofs and trips are never shown here." onRefresh={reload}>
      {error ? <Notice tone="error">{errText(error, 'Could not load.')}</Notice> : null}
      <Select label="Client" value={org} options={[{ value: '', label: 'All clients' }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]} onChange={(v) => reset(() => setOrg(v))} />
      <Field label="Search name or email" placeholder="Start typing, then press Search" autoCapitalize="none" returnKeyType="search" value={text} onChangeText={setText} onSubmitEditing={() => reset(() => setQ(text.trim()))} />
      <Select
        label="Show"
        value={filter}
        options={[
          { value: '', label: 'Everyone' },
          { value: 'blocked', label: 'Blocked by RYDO' },
          { value: 'flagged', label: 'Reported more than once' },
        ]}
        onChange={(v) => reset(() => setFilter(v))}
      />

      {!data && !error ? <Loading /> : null}
      {data && data.rows.length === 0 ? <Empty title="Nobody found">Try another client, search or filter.</Empty> : null}
      {data?.rows.map((p) => (
        <Card key={p.id} style={{ gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === p.id }} onPress={() => toggle(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={p.name} size={40} tone={p.blocked ? 'pink' : 'blue'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.strong, { fontSize: 15 }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[s.small, { fontSize: 12 }]} numberOfLines={1}>{p.email}</Text>
              <Text style={[s.small, { fontSize: 12 }]} numberOfLines={2}>{p.organization.name} · {p.roles.map(label).join(', ')}{p.department ? ` · ${p.department}` : ''}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                {p.flagged ? <Badge tone="warning">{`reported ${p.recentReportsAgainst}×`}</Badge> : null}
                {p.blocked ? <Badge tone="warning">Blocked by RYDO</Badge> : <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{label(p.status)}</Badge>}
              </View>
            </View>
          </Pressable>
          {open === p.id ? (
            !detail ? (
              <Loading />
            ) : (
              <View style={{ gap: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.line }}>
                <Text style={[s.strong, { fontSize: 15, marginTop: 8 }]}>Reports against them</Text>
                {detail.reports.length === 0 ? <Text style={s.small}>None.</Text> : null}
                {detail.reports.map((r) => (
                  <View key={r.id} style={{ gap: 2 }}>
                    <Text style={[s.small, { color: colors.ink }]}>
                      <Text style={{ fontWeight: '700' }}>{label(r.category)}</Text> · {label(r.status)} · {fmtWhen(r.createdAt)}
                    </Text>
                    <Text style={s.small}>{r.description}</Text>
                  </View>
                ))}
                <Text style={[s.strong, { fontSize: 15 }]}>Block history</Text>
                {detail.history.length === 0 ? <Text style={s.small}>Never blocked.</Text> : null}
                {detail.history.map((h, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <Text style={[s.small, { color: colors.ink }]}>
                      <Text style={{ fontWeight: '700' }}>{h.action === 'PLATFORM_MEMBER_BLOCKED' ? 'Blocked' : 'Unblocked'}</Text> · {fmtWhen(h.createdAt)}
                    </Text>
                    {h.after?.reason ? <Text style={s.small}>{h.after.reason}</Text> : null}
                  </View>
                ))}
                {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
                {p.blocked || p.status === 'ACTIVE' || p.status === 'SUSPENDED' ? (
                  <View style={{ gap: 8 }}>
                    <Field
                      label={p.blocked ? 'Why are you unblocking? (kept in the activity log)' : 'Why are you blocking? (kept in the activity log)'}
                      multiline
                      maxLength={300}
                      value={reason}
                      onChangeText={setReason}
                      style={{ minHeight: 64, textAlignVertical: 'top' }}
                    />
                    <Text style={[s.small, { fontSize: 12 }]}>{p.blocked ? 'They get their access back and are told.' : 'They lose access to this company at once and are told. The company admin cannot undo it; only you can.'}</Text>
                    <Button variant={p.blocked ? 'primary' : 'danger'} loading={busy} disabled={reason.trim().length < 5} label={`${p.blocked ? 'Unblock' : 'Block'} ${p.name}`} onPress={() => act(p, p.blocked ? 'unblock' : 'block')} />
                  </View>
                ) : null}
              </View>
            )
          ) : null}
        </Card>
      ))}

      {data && data.total > data.pageSize ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Button small variant="ghost" label="Previous" disabled={page <= 1} style={{ flex: 1 }} onPress={() => (setData(undefined), setPage(page - 1))} />
          <Text style={s.small}>Page {page} of {pages}</Text>
          <Button small variant="ghost" label="Next" disabled={page >= pages} style={{ flex: 1 }} onPress={() => (setData(undefined), setPage(page + 1))} />
        </View>
      ) : null}
    </PlatformScreen>
  );
}
