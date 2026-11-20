import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { colors } from '@rydo/ui-tokens';
import { apiWithMeta, errText } from '@/lib/api';
import { fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { ManageScreen } from '@/components/manage-screen';
import { Badge, Button, Card, Empty, Loading, Notice, s } from '@/components/ui';

interface AuditRow {
  id: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { name: string | null; email: string | null } | null;
}
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
/** "MEMBER_APPROVED" → "Member approved" (same as the web). */
const actionLabel = (a: string) => a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, ' ');

/** The company's own activity log, newest first (web Activity). It can't be edited or deleted. */
export default function Activity() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const query = (before?: string) => apiWithMeta<AuditRow[], { next: string | null }>('GET', `/admin/audit?limit=40${before ? `&before=${encodeURIComponent(before)}` : ''}`);
  const { reload, error } = useData(async () => {
    const r = await query();
    setRows(r.data);
    setNext(r.meta.next);
    return true;
  }, []);

  return (
    <ManageScreen title="Activity" sub="Every admin action in your company, newest first. RYDO support visits show here too." roles={['ORG_ADMIN', 'HR_ADMIN']} onRefresh={reload}>
      {error && !rows ? <Notice tone="error">{errText(error)}</Notice> : null}
      {!rows && !error ? <Loading /> : null}
      {rows?.length === 0 ? <Empty title="No activity yet" /> : null}
      {rows?.length ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {rows.map((r, i) => {
            const alert = r.action.startsWith('SOS_') || r.action.startsWith('SUPPORT_');
            return (
              <View key={r.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === r.id }} onPress={() => setOpen(open === r.id ? null : r.id)} style={[s.row, { paddingVertical: 12 }]}>
                  <Icon name={alert ? 'shield' : 'clock'} size={18} color={alert ? colors.danger : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.strong}>{actionLabel(r.action)}</Text>
                    <Text style={[s.small, { fontSize: 12 }]}>{r.actor?.name ?? 'System'} · {fmtWhen(r.createdAt)}</Text>
                  </View>
                  {r.actor?.name === 'RYDO team' ? <Badge tone="ink">RYDO</Badge> : null}
                </Pressable>
                {open === r.id ? (
                  <View style={{ gap: 6, paddingBottom: 12 }}>
                    {r.before != null ? <Text style={[s.small, { fontFamily: MONO, fontSize: 12 }]}>Before{'\n'}{JSON.stringify(r.before, null, 2)}</Text> : null}
                    {r.after != null ? <Text style={[s.small, { fontFamily: MONO, fontSize: 12 }]}>After{'\n'}{JSON.stringify(r.after, null, 2)}</Text> : null}
                    {r.before == null && r.after == null ? <Text style={s.small}>No details recorded.</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}
      {next ? (
        <Button
          small
          variant="ghost"
          label="Load more"
          loading={more}
          onPress={async () => {
            setMore(true);
            try {
              const r = await query(next);
              setRows((x) => [...(x ?? []), ...r.data]);
              setNext(r.meta.next);
            } finally {
              setMore(false);
            }
          }}
        />
      ) : null}
    </ManageScreen>
  );
}
