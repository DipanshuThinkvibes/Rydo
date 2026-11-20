import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { INQUIRY_STATUSES } from '@rydo/shared';
import { api, apiWithMeta, errText } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import { PlatformScreen } from '@/components/platform-screen';
import { Select } from '@/components/select';
import { Badge, Button, Card, Chip, ChipRow, Empty, Field, Loading, Notice, s } from '@/components/ui';

type Status = (typeof INQUIRY_STATUSES)[number];
interface Inquiry {
  id: string;
  companyName: string;
  contactName: string;
  workEmail: string;
  phone: string | null;
  companySize: string;
  city: string | null;
  message: string | null;
  status: Status;
  notes: string | null;
  createdAt: string;
}
interface Meta {
  nextCursor: string | null;
  counts: Record<Status, number>;
}
const TONE = { NEW: 'warning', CONTACTED: 'ink', ONBOARDED: 'success', CLOSED: 'neutral' } as const;

function Row({ i, onChanged }: { i: Inquiry; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(i.status);
  const [notes, setNotes] = useState(i.notes ?? '');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setErr(undefined);
    try {
      await api('PATCH', `/admin/platform/inquiries/${i.id}`, { status, notes: notes.trim() || undefined });
      setOpen(false);
      onChanged();
    } catch (e) {
      setErr(errText(e, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <Text style={[s.strong, { fontSize: 16 }]}>{i.companyName}</Text>
        <Badge tone={TONE[i.status]}>{i.status.toLowerCase()}</Badge>
        <Badge tone="neutral">{`${i.companySize} people`}</Badge>
      </View>
      <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(i.createdAt)}</Text>
      <Text style={s.small}>
        <Text style={{ fontWeight: '800', color: colors.ink }}>{i.contactName}</Text> ·{' '}
        <Text accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${i.workEmail}`)} style={{ color: colors.ink, textDecorationLine: 'underline' }}>{i.workEmail}</Text>
        {i.phone ? ` · ${i.phone}` : ''}
        {i.city ? ` · ${i.city}` : ''}
      </Text>
      {i.message ? <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 21 }}>{i.message}</Text> : null}
      {i.notes ? (
        <Text style={s.small}>
          <Text style={{ fontWeight: '800' }}>Notes:</Text> {i.notes}
        </Text>
      ) : null}
      {!open ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small variant="ghost" label="Update" style={{ flex: 1 }} onPress={() => setOpen(true)} />
          {i.status !== 'ONBOARDED' ? <Button small variant="lime" label="Onboard this company" style={{ flex: 1 }} onPress={() => router.push('/platform/clients/new')} /> : null}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Select label="Status" value={status} options={INQUIRY_STATUSES.map((v) => ({ value: v, label: v.toLowerCase() }))} onChange={(v) => setStatus(v as Status)} />
          <Field label="Notes" multiline value={notes} onChangeText={setNotes} style={{ minHeight: 72, textAlignVertical: 'top' }} />
          {err ? <Notice tone="error">{err}</Notice> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small label="Save" loading={busy} style={{ flex: 1 }} onPress={save} />
            <Button small variant="ghost" label="Cancel" style={{ flex: 1 }} onPress={() => setOpen(false)} />
          </View>
        </View>
      )}
    </Card>
  );
}

/** Web /platform/inquiries: companies that filled in the Contact us form, waiting to be onboarded. */
export default function Inquiries() {
  const [filter, setFilter] = useState<'' | Status>('');
  const [more, setMore] = useState(false);
  const fetchPage = (cursor?: string) => {
    const q = new URLSearchParams({ limit: '20', ...(filter ? { status: filter } : {}), ...(cursor ? { cursor } : {}) });
    return apiWithMeta<Inquiry[], Meta>('GET', `/admin/platform/inquiries?${q}`);
  };
  const { data, setData, reload, error } = useData(() => fetchPage(), [filter]);
  const c = data?.meta.counts;
  const loadMore = async () => {
    if (!data?.meta.nextCursor) return;
    setMore(true);
    try {
      const r = await fetchPage(data.meta.nextCursor);
      setData({ data: [...data.data, ...r.data], meta: r.meta });
    } finally {
      setMore(false);
    }
  };
  const options: { value: '' | Status; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'NEW', label: `New${c ? ` (${c.NEW})` : ''}` },
    { value: 'CONTACTED', label: `Contacted${c ? ` (${c.CONTACTED})` : ''}` },
    { value: 'ONBOARDED', label: 'Onboarded' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  return (
    <PlatformScreen title="Onboarding requests" sub="Companies that asked for RYDO through the Contact us form." onRefresh={reload}>
      <ChipRow>
        {options.map((o) => (
          <Chip key={o.value || 'all'} label={o.label} selected={filter === o.value} onPress={() => setFilter(o.value)} />
        ))}
      </ChipRow>
      {error ? <Notice tone="error">{errText(error, 'Could not load onboarding requests.')}</Notice> : null}
      {!data && !error ? <Loading /> : null}
      {data && data.data.length === 0 ? <Empty title="No requests here">New requests from the website show up here, and you are notified by email.</Empty> : null}
      {data?.data.map((i) => <Row key={`${i.id}-${i.status}-${i.notes ?? ''}`} i={i} onChanged={reload} />)}
      {data?.meta.nextCursor ? <Button variant="ghost" label="Load more" loading={more} onPress={loadMore} /> : null}
    </PlatformScreen>
  );
}
