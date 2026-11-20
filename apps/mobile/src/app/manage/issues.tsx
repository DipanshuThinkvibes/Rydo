import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { ISSUE_STATUSES } from '@rydo/shared';
import { api, apiWithMeta, errText, RequestError } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { ManageScreen } from '@/components/manage-screen';
import { Select } from '@/components/select';
import { Badge, Button, Card, Chip, ChipRow, Empty, Loading, Notice, s } from '@/components/ui';

type Status = (typeof ISSUE_STATUSES)[number];
const TONE = { OPEN: 'warning', IN_PROGRESS: 'ink', RESOLVED: 'success' } as const;
interface Issue {
  id: string;
  categoryLabel: string;
  description: string;
  status: Status;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  ride: { from?: string; to?: string; departAt?: string } | null;
  reporter: { name: string };
  against: { name: string } | null;
  assignedTo: { name: string } | null;
}
interface Meta { nextCursor: string | null; counts?: Record<Status, number> }

/** Web Admin → Issues (/manage/issues): reports from employees, newest first, worked from open to resolved. */
export default function ManageIssues() {
  const [filter, setFilter] = useState<'' | Status>('');
  const [items, setItems] = useState<Issue[] | null>(null);
  const [meta, setMeta] = useState<Meta>();
  const page = (cursor?: string) => apiWithMeta<Issue[], Meta>('GET', `/admin/issues?limit=20${filter ? `&status=${filter}` : ''}${cursor ? `&cursor=${cursor}` : ''}`);
  const { reload, error } = useData(async () => {
    const r = await page();
    setItems(r.data);
    setMeta(r.meta);
    return true;
  }, [filter]);
  const more = async () => {
    if (!meta?.nextCursor) return;
    const r = await page(meta.nextCursor);
    setItems((cur) => [...(cur ?? []), ...r.data]);
    setMeta(r.meta);
  };
  const c = meta?.counts;
  return (
    <ManageScreen title="Issues" sub="Reports from your employees. You are notified of every new one." roles={['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN']} onRefresh={reload}>
      <ChipRow>
        <Chip label="All" selected={filter === ''} onPress={() => setFilter('')} />
        <Chip label={`Open${c ? ` (${c.OPEN})` : ''}`} selected={filter === 'OPEN'} onPress={() => setFilter('OPEN')} />
        <Chip label={`In progress${c ? ` (${c.IN_PROGRESS})` : ''}`} selected={filter === 'IN_PROGRESS'} onPress={() => setFilter('IN_PROGRESS')} />
        <Chip label={`Resolved${c ? ` (${c.RESOLVED})` : ''}`} selected={filter === 'RESOLVED'} onPress={() => setFilter('RESOLVED')} />
      </ChipRow>
      {error && !items ? <Notice tone="error">Could not load issue reports.</Notice> : null}
      {!items && !error ? <Loading /> : null}
      {items?.length === 0 ? <Empty title="No reports here">Nothing to handle in this view.</Empty> : null}
      {items?.map((i) => <IssueCard key={i.id} i={i} onChanged={reload} />)}
      {meta?.nextCursor ? <Button small variant="ghost" label="Load more" onPress={more} /> : null}
    </ManageScreen>
  );
}

function IssueCard({ i, onChanged }: { i: Issue; onChanged: () => Promise<unknown> }) {
  const { platformRole } = useSession();
  const readOnly = platformRole === 'SUPPORT';
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(i.status);
  const [resolution, setResolution] = useState(i.resolution ?? '');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      await api('PATCH', `/admin/issues/${i.id}`, { status, resolution: resolution.trim() || undefined });
      setOpen(false);
      await onChanged();
    } catch (e) {
      setErr(e instanceof RequestError ? (e.fields?.resolution ?? e.message) : errText(e, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[s.strong, { flex: 1 }]}>{i.categoryLabel}</Text>
        <Badge tone={TONE[i.status]}>{i.status.replace('_', ' ').toLowerCase()}</Badge>
      </View>
      <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(i.createdAt)}</Text>
      <Text style={s.body}>{i.description}</Text>
      <Text style={s.small}>
        From <Text style={{ fontWeight: '800', color: colors.ink }}>{i.reporter.name}</Text>
        {i.against ? (
          <>
            {' '}about <Text style={{ fontWeight: '800', color: colors.ink }}>{i.against.name}</Text>
          </>
        ) : null}
        {i.ride?.from ? ` · ride ${i.ride.from} → ${i.ride.to}` : ''}
        {i.assignedTo ? ` · handled by ${i.assignedTo.name}` : ''}
      </Text>
      {i.resolution ? (
        <Text style={s.small}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>Resolution:</Text> {i.resolution}
        </Text>
      ) : null}
      {!readOnly && !open ? <Button small variant="ghost" label="Update" onPress={() => setOpen(true)} /> : null}
      {open ? (
        <View style={{ gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface }}>
          <Select label="Status" value={status} options={ISSUE_STATUSES.map((x) => ({ value: x, label: x.replace('_', ' ').toLowerCase() }))} onChange={(v) => setStatus(v as Status)} />
          <View style={{ gap: 6 }}>
            <Text style={s.label}>How was it resolved? (needed to resolve)</Text>
            <TextInput value={resolution} onChangeText={setResolution} multiline accessibilityLabel="How was it resolved" style={[s.input, { height: 90, paddingTop: 12, textAlignVertical: 'top' }]} />
            <Text style={s.small}>The reporter is notified of every status change.</Text>
          </View>
          {err ? <Notice tone="error">{err}</Notice> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={() => setOpen(false)} />
            <Button small label="Save" style={{ flex: 1 }} loading={busy} onPress={save} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
