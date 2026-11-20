import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, apiWithMeta, errText } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { Bars, ManageScreen, StatTile } from '@/components/manage-screen';
import { Badge, Button, Card, Chip, ChipRow, Empty, Label, Loading, Notice, s } from '@/components/ui';

interface Insights {
  rides: { averageRating: number | null; ratings: number; trend: { week: string; avg: number; count: number }[] };
  feedback: { total: number; byCategory: { category: string; label: string; count: number }[]; byStatus: Record<string, number> };
  issues: { open: number; inProgress: number; resolved: number; avgHours: number | null; byCategory: { category: string; total: number }[]; resolutionTrend: { week: string; avgHours: number }[] };
  surveys: { published: number; avgResponseRate: number | null };
  themes: { word: string; mentions: number }[];
}
interface Entry {
  id: string;
  category: string;
  categoryLabel: string;
  rating: number | null;
  comment: string;
  status: 'NEW' | 'REVIEWED' | 'CLOSED';
  from: { name: string };
  createdAt: string;
}
const ISSUE_LABEL: Record<string, string> = {
  UNSAFE_DRIVING: 'Unsafe driving',
  HARASSMENT: 'Harassment or conduct',
  LATE_OR_NO_SHOW: 'Late or no-show',
  ROUTE: 'Route problem',
  COST: 'Cost or payment question',
  APP_BUG: 'App problem',
  OTHER: 'Other',
};

/** What employees tell the company, and the trends behind it (web Manage → Feedback). */
export default function ManageFeedback() {
  const [tab, setTab] = useState<'insights' | 'entries'>('insights');
  return (
    <ManageScreen title="Feedback" sub="What your employees tell you, and the trends behind it." roles={['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN']}>
      <ChipRow>
        <Chip label="Insights" selected={tab === 'insights'} onPress={() => setTab('insights')} />
        <Chip label="All feedback" selected={tab === 'entries'} onPress={() => setTab('entries')} />
      </ChipRow>
      {tab === 'insights' ? <InsightsView /> : <Entries />}
    </ManageScreen>
  );
}

function InsightsView() {
  const [days, setDays] = useState('90');
  const { data, error } = useData(() => api<Insights>('GET', `/admin/feedback/insights?days=${days}`), [days]);
  return (
    <>
      <ChipRow>
        {[
          ['30', '30 days'],
          ['90', '90 days'],
          ['365', '1 year'],
        ].map(([v, l]) => (
          <Chip key={v} label={l} selected={days === v} onPress={() => setDays(v)} />
        ))}
      </ChipRow>
      {error && !data ? <Notice tone="error">{errText(error)}</Notice> : null}
      {!data ? (
        !error ? <Loading /> : null
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Average ride rating" value={data.rides.averageRating ? `${data.rides.averageRating} ★` : '–'} sub={`${data.rides.ratings} ratings`} />
            <StatTile label="Feedback received" value={data.feedback.total} sub={`${data.feedback.byStatus.NEW ?? 0} new`} />
            <StatTile label="Issue resolution" value={data.issues.avgHours != null ? `${data.issues.avgHours} h` : '–'} sub={`${data.issues.open} open · ${data.issues.inProgress} in progress · ${data.issues.resolved} resolved`} />
            <StatTile label="Survey response rate" value={data.surveys.avgResponseRate != null ? `${Math.round(data.surveys.avgResponseRate * 100)}%` : '–'} sub={`${data.surveys.published} surveys`} />
          </View>
          <Card style={{ gap: 10 }}>
            <Label>Ride rating by week</Label>
            {data.rides.trend.length ? <Bars rows={data.rides.trend.map((t) => ({ label: t.week, value: t.avg }))} unit=" ★" /> : <Text style={s.small}>No ratings in this period.</Text>}
          </Card>
          <Card style={{ gap: 10 }}>
            <Label>Feedback by topic</Label>
            {data.feedback.byCategory.length ? <Bars rows={data.feedback.byCategory.map((c) => ({ label: c.label, value: c.count }))} /> : <Text style={s.small}>No feedback yet.</Text>}
          </Card>
          <Card style={{ gap: 10 }}>
            <Label>Issues by type</Label>
            {data.issues.byCategory.length ? <Bars rows={data.issues.byCategory.map((c) => ({ label: ISSUE_LABEL[c.category] ?? c.category, value: c.total }))} /> : <Text style={s.small}>No issues reported.</Text>}
          </Card>
          <Card style={{ gap: 10 }}>
            <Label>Hours to resolve, by week</Label>
            {data.issues.resolutionTrend.length ? <Bars rows={data.issues.resolutionTrend.map((t) => ({ label: t.week, value: t.avgHours }))} unit=" h" /> : <Text style={s.small}>Nothing resolved in this period.</Text>}
          </Card>
          <Card style={{ gap: 10 }}>
            <Label>Words people keep using</Label>
            {data.themes.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {data.themes.map((t) => <Badge key={t.word} tone="neutral">{`${t.word} · ${t.mentions}`}</Badge>)}
              </View>
            ) : (
              <Text style={s.small}>Not enough text yet to spot patterns.</Text>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function Entries() {
  const [status, setStatus] = useState<'' | Entry['status']>('');
  const [items, setItems] = useState<Entry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState<string>();
  const page = (cursor?: string) => apiWithMeta<Entry[], { nextCursor: string | null }>('GET', `/admin/feedback?limit=20${status ? `&status=${status}` : ''}${cursor ? `&cursor=${cursor}` : ''}`);
  const { reload } = useData(async () => {
    const r = await page();
    setItems(r.data);
    setNext(r.meta.nextCursor);
    setErr(undefined);
    return true;
  }, [status]);
  const more = async () => {
    if (!next) return;
    try {
      const r = await page(next);
      setItems((cur) => [...(cur ?? []), ...r.data]);
      setNext(r.meta.nextCursor);
    } catch (e) {
      setErr(errText(e));
    }
  };
  const mark = async (id: string, s: Entry['status']) => {
    try {
      await api('PATCH', `/admin/feedback/${id}`, { status: s });
      await reload();
    } catch (e) {
      setErr(errText(e));
    }
  };

  return (
    <>
      <ChipRow>
        {(
          [
            ['', 'All'],
            ['NEW', 'New'],
            ['REVIEWED', 'Reviewed'],
            ['CLOSED', 'Closed'],
          ] as const
        ).map(([v, l]) => (
          <Chip key={v} label={l} selected={status === v} onPress={() => setStatus(v)} />
        ))}
      </ChipRow>
      {err ? <Notice tone="error">{err}</Notice> : null}
      {!items && !err ? <Loading /> : null}
      {items?.length === 0 ? <Empty title="No feedback here" /> : null}
      {items?.map((f) => (
        <Card key={f.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.strong, { flex: 1 }]}>{f.categoryLabel}</Text>
            {f.rating ? <Text style={s.small}>{'★'.repeat(f.rating)}</Text> : null}
            <Badge tone={f.status === 'NEW' ? 'warning' : 'success'}>{f.status.toLowerCase()}</Badge>
          </View>
          <Text style={[s.small, { fontSize: 12 }]}>{f.from.name} · {fmtWhen(f.createdAt)}</Text>
          <Text style={s.body}>{f.comment}</Text>
          {f.status !== 'CLOSED' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {f.status === 'NEW' ? <Button small variant="ghost" label="Mark reviewed" style={{ flex: 1 }} onPress={() => mark(f.id, 'REVIEWED')} /> : null}
              <Button small variant="ghost" label="Close" style={{ flex: 1 }} onPress={() => mark(f.id, 'CLOSED')} />
            </View>
          ) : null}
        </Card>
      ))}
      {next ? <Button small variant="ghost" label="Load more" onPress={more} /> : null}
    </>
  );
}
