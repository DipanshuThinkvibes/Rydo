import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { api, apiWithMeta, errText } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { actionLabel, type AuditRow, type Client } from '@/lib/platform';
import { colors } from '@/lib/theme';
import { Icon } from '@/components/icons';
import { PlatformScreen } from '@/components/platform-screen';
import { Select } from '@/components/select';
import { Badge, Button, Card, Empty, Loading, Notice, s } from '@/components/ui';

/** Web /platform/activity: who did what, across every client. Newest first. */
export default function Activity() {
  const params = useLocalSearchParams<{ org?: string }>();
  const [org, setOrg] = useState(params.org ?? '');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const query = (before?: string) => {
    const q = new URLSearchParams({ limit: '40' });
    if (org === 'rydo') q.set('platformOnly', 'true');
    else if (org) q.set('organizationId', org);
    if (action) q.set('action', action);
    if (before) q.set('before', before);
    return apiWithMeta<AuditRow[], { next: string | null }>('GET', `/admin/platform/audit?${q}`);
  };
  const { data: clients } = useData(() => api<Client[]>('GET', '/admin/platform/organizations').catch(() => [] as Client[]), []);
  const { data: actions } = useData(() => api<string[]>('GET', '/admin/platform/audit/actions').catch(() => [] as string[]), []);
  const { data, setData, reload, error } = useData(() => query(), [org, action]);

  const loadMore = async () => {
    if (!data?.meta.next) return;
    setMore(true);
    try {
      const r = await query(data.meta.next);
      setData({ data: [...data.data, ...r.data], meta: r.meta });
    } finally {
      setMore(false);
    }
  };

  return (
    <PlatformScreen title="Activity" sub="Every admin action on RYDO, across all clients. Nothing here can be edited or deleted." onRefresh={reload}>
      {error ? <Notice tone="error">{errText(error, 'Could not load.')}</Notice> : null}
      <Select
        label="Client"
        value={org}
        options={[{ value: '', label: 'All clients' }, { value: 'rydo', label: 'RYDO only (no client)' }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
        onChange={(v) => (setData(undefined), setOrg(v))}
      />
      <Select label="Action" value={action} options={[{ value: '', label: 'All actions' }, ...(actions ?? []).map((a) => ({ value: a, label: actionLabel(a) }))]} onChange={(v) => (setData(undefined), setAction(v))} />
      {!data && !error ? <Loading /> : null}
      {data && data.data.length === 0 ? <Empty title="No activity">Try another client or action.</Empty> : null}
      {data?.data.map((r) => {
        const support = r.action.startsWith('SUPPORT_');
        const isOpen = open === r.id;
        return (
          <Card key={r.id} style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : r.id)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: support ? colors.warningBg : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={support ? 'shield' : r.organization ? 'building' : 'globe'} size={15} color={support ? colors.warningText : colors.ink} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[s.small, { color: colors.ink }]}>
                  <Text style={{ fontWeight: '800' }}>{actionLabel(r.action)}</Text> · {r.actor?.name ?? 'System'}
                  {r.actor?.email ? ` (${r.actor.email})` : ''}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  {r.organization ? (
                    <Text accessibilityRole="link" onPress={() => router.push({ pathname: '/platform/clients/[id]', params: { id: r.organization!.id } } as Href)} style={{ fontSize: 12, fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>
                      {r.organization.name}
                    </Text>
                  ) : (
                    <Badge tone="ink">RYDO</Badge>
                  )}
                  <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(r.createdAt)}</Text>
                </View>
              </View>
              <Icon name="next" size={14} color={colors.muted} />
            </Pressable>
            {isOpen ? (
              <View style={{ gap: 6 }}>
                <Text style={[s.small, { fontSize: 12 }]}>{r.entityType} · {r.entityId}</Text>
                {r.before != null ? <Json title="Before" value={r.before} /> : null}
                {r.after != null ? <Json title="After" value={r.after} /> : null}
                {r.before == null && r.after == null ? <Text style={s.small}>No details recorded.</Text> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
      {data?.meta.next ? <Button variant="ghost" label="Load more" loading={more} onPress={loadMore} /> : null}
    </PlatformScreen>
  );
}

function Json({ title, value }: { title: string; value: unknown }) {
  return (
    <View style={{ padding: 10, borderRadius: 12, backgroundColor: colors.surface }}>
      <Text style={[s.small, { fontSize: 11, fontWeight: '800' }]}>{title}</Text>
      <Text selectable style={{ fontFamily: 'monospace', fontSize: 11, color: colors.ink }}>{JSON.stringify(value, null, 2)}</Text>
    </View>
  );
}
