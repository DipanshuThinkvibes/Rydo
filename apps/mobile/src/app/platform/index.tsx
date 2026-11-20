import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { api, errText } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { num } from '@/lib/platform';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { Icon, type IconName } from '@/components/icons';
import { Kpi, PlatformScreen } from '@/components/platform-screen';
import { BackButton, Badge, Button, Card, Empty, Loading, Notice, s } from '@/components/ui';

interface Health {
  totals: Record<string, number>;
  expiring: { id: string; kind: string; expiresAt: string; driverName: string; organizationId: string; organizationName: string }[];
  pending: { id: string; name: string; members: number; drivers: number }[];
  jobs: { states: Record<string, number>; failed: { name: string; at: string }[] } | null;
}
interface Impact {
  days: number;
  sharedTrips: number;
  ridesShared: number;
  sharedKm: number;
  co2SavedKg: number;
  fuelSavedLitres: number;
  adoptionPct: number;
  activePeople: number;
  members: number;
  clients: number;
  weeks: { week: string; trips: number }[];
  topClients: { id: string; name: string; members: number; activePeople: number; sharedTrips: number; adoptionPct: number; co2SavedKg: number }[];
  quietClients: { id: string; name: string; members: number }[];
  newInquiries: number;
}
interface Safety { openReports: number; activeSos: number; blocked: number; flaggedPeople: number; repeatRule: { reports: number; days: number } }
interface Licences { active: number; expiringSoon: number; expired: number; suspended: number; clientsWithoutShare: number; expiringDays: number }
interface Flagged { id: string; name: string; organization: { id: string; name: string }; blocked: boolean; recentReportsAgainst: number }

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const client = (id: string) => ({ pathname: '/platform/clients/[id]', params: { id } }) as Href;

/** Web /platform: how much carpooling is happening across all clients, who needs a nudge, and what needs attention. */
export default function PlatformOverview() {
  const { me } = useSession();
  const { data, reload, error } = useData(async () => {
    const [impact, safety, lic, flagged, h] = await Promise.all([
      api<Impact>('GET', '/admin/platform/impact').catch(() => null),
      api<Safety>('GET', '/admin/platform/reports/summary').catch(() => null),
      api<Licences>('GET', '/admin/platform/licenses/summary').catch(() => null),
      api<{ rows: Flagged[] }>('GET', '/admin/platform/people?flagged=true').then((r) => r.rows, () => [] as Flagged[]),
      api<Health>('GET', '/admin/platform/health'),
    ]);
    return { impact, safety, lic, flagged, h };
  }, [], 60_000);

  const impact = data?.impact;
  const safety = data?.safety;
  const lic = data?.lic;
  const h = data?.h;
  const t = h?.totals ?? {};
  const first = me?.user.name?.split(' ')[0] ?? 'there';
  const failedJobs = h?.jobs?.states.failed ?? 0;
  const maxWeek = Math.max(1, ...(impact?.weeks.map((w) => w.trips) ?? [1]));

  const kpis: { k: string; v: string; sub?: string; tone: string }[] = [
    { k: 'Active clients', v: num(impact?.clients ?? t.activeClients), tone: '#2563EB', sub: t.inactiveClients ? `${t.inactiveClients} paused` : undefined },
    { k: 'Employees on RYDO', v: num(impact?.members ?? t.activeMembers), tone: colors.lime, sub: t.pendingMembers ? `${t.pendingMembers} waiting for HR` : undefined },
    { k: 'Using carpool', v: `${impact?.adoptionPct ?? 0}%`, tone: '#EA580C', sub: impact ? `${num(impact.activePeople)} people, last ${impact.days} days` : undefined },
    { k: 'Trips shared', v: num(impact?.sharedTrips), tone: '#2563EB', sub: impact ? `${num(impact.sharedKm)} km together` : undefined },
    { k: 'CO₂ saved', v: `${num(impact?.co2SavedKg)} kg`, tone: colors.successText, sub: 'cars kept off the road' },
    { k: 'Fuel saved', v: `${num(impact?.fuelSavedLitres)} L`, tone: colors.warningText, sub: `last ${impact?.days ?? 30} days` },
  ];

  const attention: { icon: IconName; text: string; href: Href; warn?: boolean }[] = [];
  if (lic && lic.clientsWithoutShare > 0) attention.push({ icon: 'badge', text: `${lic.clientsWithoutShare} ${lic.clientsWithoutShare === 1 ? 'client has' : 'clients have'} no valid Share licence. Their employees cannot carpool.`, href: { pathname: '/platform/licenses', params: { state: 'EXPIRED' } } as Href, warn: true });
  if (lic && lic.expiringSoon > 0) attention.push({ icon: 'badge', text: `${lic.expiringSoon} ${lic.expiringSoon === 1 ? 'licence ends' : 'licences end'} within ${lic.expiringDays} days`, href: { pathname: '/platform/licenses', params: { state: 'EXPIRING' } } as Href, warn: true });
  if (impact && impact.newInquiries > 0) attention.push({ icon: 'clipboard', text: `${impact.newInquiries} new onboarding ${impact.newInquiries === 1 ? 'request' : 'requests'} from companies`, href: '/platform/inquiries' });
  for (const p of h?.pending ?? []) attention.push({ icon: 'building', text: `${p.name}: ${[p.members && `${p.members} waiting for HR`, p.drivers && `${p.drivers} ${p.drivers === 1 ? 'driver' : 'drivers'} to verify`].filter(Boolean).join(' · ')}`, href: client(p.id) });
  for (const c of impact?.quietClients ?? []) attention.push({ icon: 'clock', text: `${c.name} has ${c.members} ${c.members === 1 ? 'person' : 'people'} but no shared trip yet. Time for a nudge.`, href: client(c.id), warn: true });
  if (safety && safety.activeSos > 0) attention.push({ icon: 'alert', text: `${safety.activeSos} SOS ${safety.activeSos === 1 ? 'alert is' : 'alerts are'} not resolved`, href: '/platform/reports', warn: true });
  if (failedJobs > 0) attention.push({ icon: 'alert', text: `${failedJobs} background ${failedJobs === 1 ? 'job' : 'jobs'} failed in the last 24 hours`, href: '/platform/activity', warn: true });

  return (
    <PlatformScreen
      title="RYDO overview"
      onRefresh={reload}
      header={
        <View style={{ borderRadius: 26, padding: 20, gap: 12, backgroundColor: colors.panel, overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: colors.lime, opacity: 0.18 }} />
          <BackButton dark />
          <Text style={{ color: colors.panelMuted, fontWeight: '700' }}>{greeting()}, {first}</Text>
          <Text accessibilityRole="header" style={{ color: colors.onPanel, fontSize: 28, fontWeight: '800' }}>RYDO overview</Text>
          {impact ? (
            <Text style={{ color: colors.panelMuted, fontSize: 15, lineHeight: 22 }}>
              In the last {impact.days} days, colleagues at {impact.clients} {impact.clients === 1 ? 'company' : 'companies'} shared <Text style={{ color: colors.panelAccent, fontWeight: '800' }}>{num(impact.sharedTrips)}</Text> trips and saved{' '}
              <Text style={{ color: colors.panelAccent, fontWeight: '800' }}>{num(impact.co2SavedKg)} kg</Text> of CO₂.
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button small variant="lime" label="+ Add client" onPress={() => router.push('/platform/clients/new')} />
            <Button small variant="ghost" label={lic ? `Licences · ${lic.active} active` : 'Licences'} onPress={() => router.push('/platform/licenses')} />
            <Button small variant="ghost" label="Reports" onPress={() => router.push('/platform/reports')} />
          </View>
        </View>
      }
    >
      {error && !data ? <Notice tone="error">{errText(error, 'Could not load.')}</Notice> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {kpis.map((k) => (
              <Kpi key={k.k} label={k.k} value={k.v} sub={k.sub} tone={k.tone} />
            ))}
          </View>

          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="car" size={18} />
              <Text style={[s.strong, { flex: 1 }]}>Shared trips, week by week</Text>
              <Badge tone="neutral">last 8 weeks</Badge>
            </View>
            {impact && impact.weeks.every((w) => w.trips === 0) ? <Text style={s.small}>No shared trips yet. They appear here as soon as colleagues start carpooling.</Text> : null}
            {impact && impact.weeks.some((w) => w.trips > 0) ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 150 }}>
                {impact.weeks.map((w) => (
                  <View key={w.week} style={{ flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                    <Text style={[s.small, { fontSize: 11, fontWeight: '800', color: colors.ink }]}>{w.trips}</Text>
                    <View style={{ width: '100%', height: `${Math.max(4, (w.trips / maxWeek) * 80)}%`, borderRadius: 6, backgroundColor: colors.lime }} />
                    <Text style={[s.small, { fontSize: 10 }]} numberOfLines={1}>{w.week}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="badge" size={18} />
              <Text style={s.strong}>Top clients</Text>
            </View>
            {impact && impact.topClients.length === 0 ? <Text style={s.small}>No clients yet.</Text> : null}
            {impact?.topClients.map((c, i) => (
              <Pressable key={c.id} accessibilityRole="link" onPress={() => router.push(client(c.id))} style={{ gap: 6, paddingVertical: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ width: 22, fontWeight: '800', color: colors.muted }}>{i + 1}</Text>
                  <Text style={[s.strong, { flex: 1, fontSize: 15 }]} numberOfLines={1}>{c.name}</Text>
                  <Text style={s.small}>{c.sharedTrips} trips</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2, marginLeft: 32 }}>
                  <View style={{ width: `${Math.max(c.adoptionPct, c.adoptionPct > 0 ? 4 : 0)}%`, height: 6, borderRadius: 3, backgroundColor: colors.lime }} />
                </View>
                <Text style={[s.small, { fontSize: 12, marginLeft: 32 }]}>{c.adoptionPct}% of {c.members} use it</Text>
              </Pressable>
            ))}
          </Card>

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="alert" size={18} />
              <Text style={s.strong}>Needs attention</Text>
            </View>
            {attention.length === 0 && (!h || h.expiring.length === 0) ? <Text style={s.small}>All clear. Nothing is waiting on you.</Text> : null}
            {attention.map((a, i) => (
              <Pressable key={i} accessibilityRole="link" onPress={() => router.push(a.href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: a.warn ? colors.warningBg : colors.surface }}>
                <Icon name={a.icon} size={16} color={a.warn ? colors.warningText : colors.ink} />
                <Text style={[s.small, { flex: 1, color: a.warn ? colors.warningText : colors.ink, fontWeight: '600' }]}>{a.text}</Text>
                <Icon name="next" size={16} color={colors.muted} />
              </Pressable>
            ))}
            {h && h.expiring.length > 0 ? (
              <>
                <Text style={[s.strong, { fontSize: 15, marginTop: 4 }]}>Driver documents ending in 30 days</Text>
                {h.expiring.map((d) => (
                  <Pressable key={d.id} accessibilityRole="link" onPress={() => router.push(client(d.organizationId))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[s.small, { flex: 1, color: colors.ink }]}>
                      <Text style={{ fontWeight: '800' }}>{d.driverName}</Text> · {d.kind === 'DRIVING_LICENSE' ? 'driving licence' : d.kind === 'VEHICLE_RC' ? 'vehicle RC' : d.kind.toLowerCase().replace(/_/g, ' ')} · {d.organizationName}
                    </Text>
                    <Badge tone="warning">{`ends ${d.expiresAt}`}</Badge>
                  </Pressable>
                ))}
              </>
            ) : null}
          </Card>

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="shield" size={18} />
              <Text style={[s.strong, { flex: 1 }]}>Safety and reports</Text>
              <Pressable accessibilityRole="link" onPress={() => router.push('/platform/reports')}>
                <Text style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>Open all</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { n: safety?.openReports, t: 'open reports', href: '/platform/reports' as Href },
                { n: safety?.activeSos, t: 'SOS not resolved', href: '/platform/reports' as Href },
                { n: safety?.flaggedPeople, t: safety ? `reported ${safety.repeatRule.reports}+ times in ${safety.repeatRule.days} days` : 'reported again', href: { pathname: '/platform/people', params: { filter: 'flagged' } } as Href },
                { n: safety?.blocked, t: 'blocked by RYDO', href: { pathname: '/platform/people', params: { filter: 'blocked' } } as Href },
              ].map((x) => (
                <Pressable key={x.t} accessibilityRole="link" onPress={() => router.push(x.href)} style={{ flexBasis: '47%', flexGrow: 1, padding: 12, borderRadius: 14, backgroundColor: colors.surface }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>{x.n ?? 0}</Text>
                  <Text style={[s.small, { fontSize: 12 }]}>{x.t}</Text>
                </Pressable>
              ))}
            </View>
            {data.flagged.length > 0 ? (
              <>
                <Text style={[s.small, { fontWeight: '800' }]}>People to look at</Text>
                {data.flagged.slice(0, 4).map((p) => (
                  <Pressable key={p.id} accessibilityRole="link" onPress={() => router.push({ pathname: '/platform/people', params: { q: p.name.split(' ')[0], org: p.organization.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <Text style={[s.strong, { fontSize: 14 }]}>{p.name}</Text>
                    <Text style={[s.small, { flex: 1 }]} numberOfLines={1}>{p.organization.name}</Text>
                    <Text style={[s.small, { color: colors.danger, fontWeight: '700' }]}>reported {p.recentReportsAgainst}×{p.blocked ? ' · blocked' : ''}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </Card>

          {h && t.activeClients === 0 ? (
            <>
              <Empty title="No clients yet">Add your first client to set up their company on RYDO.</Empty>
              <Button label="Add your first client" onPress={() => router.push('/platform/clients/new')} />
            </>
          ) : null}
        </>
      ) : null}
    </PlatformScreen>
  );
}
