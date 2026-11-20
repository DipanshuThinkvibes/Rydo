import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { api, errText } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import type { Client } from '@/lib/platform';
import { colors } from '@/lib/theme';
import { PlatformScreen } from '@/components/platform-screen';
import { Select } from '@/components/select';
import { Badge, Button, Card, Empty, Loading, Notice, s } from '@/components/ui';

interface Report {
  id: string;
  organization: string;
  category: string;
  status: string;
  description: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: string;
  against: { membershipId: string; name: string; blocked: boolean; reportsAgainst: number; flagged: boolean } | null;
}
interface Result {
  total: number;
  page: number;
  pageSize: number;
  rows: Report[];
}
interface Summary {
  openReports: number;
  activeSos: number;
  blocked: number;
  flaggedPeople: number;
  repeatRule: { reports: number; days: number };
}
const label = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');

/** Web /platform/reports: complaints from every client in one queue, so a repeat problem is easy to spot. */
export default function Reports() {
  const [org, setOrg] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data: clients } = useData(() => api<Client[]>('GET', '/admin/platform/organizations').catch(() => [] as Client[]), []);
  const { data: summary, reload: reloadSummary } = useData(() => api<Summary>('GET', '/admin/platform/reports/summary').catch(() => null), []);
  const { data, setData, reload, error } = useData(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (org) p.set('orgId', org);
    if (status) p.set('status', status);
    return api<Result>('GET', `/admin/platform/reports?${p}`);
  }, [org, status, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const tiles = summary
    ? [
        { n: summary.openReports, t: 'open reports' },
        { n: summary.activeSos, t: 'SOS alerts not resolved' },
        { n: summary.flaggedPeople, t: `reported ${summary.repeatRule.reports}+ times in ${summary.repeatRule.days} days`, href: { pathname: '/platform/people', params: { filter: 'flagged' } } as Href },
        { n: summary.blocked, t: 'blocked by RYDO', href: { pathname: '/platform/people', params: { filter: 'blocked' } } as Href },
      ]
    : [];

  return (
    <PlatformScreen
      title="Reports and safety"
      sub="Complaints from every client. When the same person is reported again, they are flagged so you can look closer and block them if needed."
      onRefresh={() => Promise.all([reload(), reloadSummary()])}
    >
      {error ? <Notice tone="error">{errText(error, 'Could not load.')}</Notice> : null}
      {summary === undefined ? <Loading /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t) => (
          <Pressable key={t.t} disabled={!t.href} accessibilityRole={t.href ? 'link' : undefined} onPress={() => t.href && router.push(t.href)} style={[s.card, { flexBasis: '47%', flexGrow: 1, gap: 2 }]}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{t.n}</Text>
            <Text style={[s.small, { fontSize: 12 }]}>{t.t}</Text>
          </Pressable>
        ))}
      </View>
      <Select label="Client" value={org} options={[{ value: '', label: 'All clients' }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]} onChange={(v) => (setData(undefined), setPage(1), setOrg(v))} />
      <Select
        label="Status"
        value={status}
        options={[
          { value: '', label: 'All' },
          { value: 'OPEN', label: 'Open' },
          { value: 'IN_PROGRESS', label: 'In progress' },
          { value: 'RESOLVED', label: 'Resolved' },
        ]}
        onChange={(v) => (setData(undefined), setPage(1), setStatus(v))}
      />
      {!data && !error ? <Loading /> : null}
      {data && data.rows.length === 0 ? <Empty title="No reports">Nothing matches these filters.</Empty> : null}
      {data?.rows.map((r) => (
        <Card key={r.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Text style={[s.strong, { fontSize: 15 }]}>{label(r.category)}</Text>
            <Badge tone={r.status === 'RESOLVED' ? 'success' : r.status === 'OPEN' ? 'warning' : 'neutral'}>{label(r.status)}</Badge>
          </View>
          <Text style={[s.small, { fontSize: 12 }]}>{r.organization} · {fmtWhen(r.createdAt)}</Text>
          <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 21 }}>{r.description}</Text>
          <Text style={s.small}>
            Reported by <Text style={{ fontWeight: '800', color: colors.ink }}>{r.reporter}</Text>
            {r.against ? (
              <>
                {' '}against <Text style={{ fontWeight: '800', color: colors.ink }}>{r.against.name}</Text>
              </>
            ) : null}
          </Text>
          {r.against ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {r.against.flagged ? <Badge tone="warning">{`reported ${r.against.reportsAgainst}× — look closer`}</Badge> : null}
              {r.against.blocked ? <Badge tone="warning">blocked</Badge> : null}
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/platform/people', params: { q: r.against!.name.split(' ')[0] } })}>
                <Text style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>Open in People</Text>
              </Pressable>
            </View>
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
