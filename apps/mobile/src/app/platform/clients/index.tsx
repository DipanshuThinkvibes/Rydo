import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { api, errText } from '@/lib/api';
import { dayOf } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { statusTone, type Client } from '@/lib/platform';
import { colors } from '@/lib/theme';
import { PlatformScreen } from '@/components/platform-screen';
import { Avatar, Badge, Button, Card, Chip, ChipRow, Empty, Field, Loading, Notice, s } from '@/components/ui';

/** Web /platform/clients: all RYDO clients with live numbers. */
export default function Clients() {
  const { data: clients, reload, error } = useData(() => api<Client[]>('GET', '/admin/platform/organizations'), []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'ACTIVE' | 'SUSPENDED'>('all');

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (clients ?? []).filter((c) => (status === 'all' || c.status === status) && (!term || c.name.toLowerCase().includes(term) || c.emailDomains.some((d) => d.includes(term)) || c.slug.includes(term)));
  }, [clients, q, status]);

  return (
    <PlatformScreen title="Clients" sub="Companies using RYDO. Open one to change its plan, features or admins." onRefresh={reload}>
      <Button variant="lime" label="+ Add client" onPress={() => router.push('/platform/clients/new')} />
      {error ? <Notice tone="error">{errText(error, 'Could not load clients.')}</Notice> : null}
      <Field label="Search clients" placeholder="Search name or email domain" autoCapitalize="none" value={q} onChangeText={setQ} />
      <ChipRow>
        {([['all', 'All'], ['ACTIVE', 'Active'], ['SUSPENDED', 'Paused']] as const).map(([v, l]) => (
          <Chip key={v} label={l} selected={status === v} onPress={() => setStatus(v)} />
        ))}
      </ChipRow>
      {!clients && !error ? <Loading /> : null}
      {clients && shown.length === 0 ? <Empty title={clients.length ? 'No client matches' : 'No clients yet'}>{clients.length ? 'Try another name or domain.' : 'Add your first client to set them up on RYDO.'}</Empty> : null}
      {shown.map((c) => {
        const st = c.stats;
        const nearLimit = c.maxEmployees && st ? st.activeMembers / c.maxEmployees >= 0.9 : false;
        return (
          <Card key={c.id} style={{ gap: 10 }} onPress={() => router.push({ pathname: '/platform/clients/[id]', params: { id: c.id } } as Href)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={c.name} tone="ink" size={42} />
              <View style={{ flex: 1 }}>
                <Text style={s.strong} numberOfLines={1}>{c.name}</Text>
                <Text style={[s.small, { fontSize: 12 }]} numberOfLines={1}>{c.emailDomains.join(', ')}</Text>
              </View>
              <Badge tone={statusTone(c.status)}>{c.status === 'SUSPENDED' ? 'paused' : c.status.toLowerCase()}</Badge>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { k: 'Employees', v: `${st?.activeMembers ?? 0}${c.maxEmployees ? ` / ${c.maxEmployees}` : ''}`, sub: st?.pendingMembers ? `${st.pendingMembers} waiting` : undefined, warn: nearLimit },
                { k: 'Drivers', v: `${st?.verifiedDrivers ?? 0}`, sub: st?.pendingDrivers ? `${st.pendingDrivers} to check` : undefined },
                { k: 'Rides next 7 days', v: `${st?.ridesNext7 ?? 0}` },
                { k: 'Bookings 7 days', v: `${st?.bookingsLast7 ?? 0}` },
              ].map((x) => (
                <View key={x.k} style={{ flexBasis: '47%', flexGrow: 1, padding: 10, borderRadius: 12, backgroundColor: colors.surface }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: x.warn ? colors.warningText : colors.ink }}>{x.v}</Text>
                  <Text style={[s.small, { fontSize: 12 }]}>{x.k}</Text>
                  {x.sub ? <Text style={{ fontSize: 12, fontWeight: '700', color: colors.warningText }}>{x.sub}</Text> : null}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {c.features.share ? <Badge tone="lime">Share</Badge> : null}
              {c.features.enterprise ? <Badge tone="neutral">Enterprise</Badge> : null}
              {c.features.campus ? <Badge tone="neutral">Campus</Badge> : null}
              {!c.features.share && !c.features.enterprise && !c.features.campus ? <Text style={s.small}>No modules</Text> : null}
              <Text style={[s.small, { fontSize: 12, marginLeft: 'auto' }]}>Last activity {st?.lastActivityAt ? dayOf(st.lastActivityAt) : '—'}</Text>
            </View>
          </Card>
        );
      })}
    </PlatformScreen>
  );
}
