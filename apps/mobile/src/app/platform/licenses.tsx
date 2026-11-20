import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { LICENSE_INFO, LICENSE_PRODUCTS, type LicenseProduct } from '@rydo/shared';
import { api, errText } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { dayLabel, leftLabel, STATE_LABEL, stateTone, type Client, type LicenseRow, type LicenseSummary } from '@/lib/platform';
import { colors } from '@/lib/theme';
import { Icon } from '@/components/icons';
import { LicenceControls } from '@/components/licence-controls';
import { PlatformScreen } from '@/components/platform-screen';
import { Select } from '@/components/select';
import { Badge, Card, Empty, Loading, Notice, s } from '@/components/ui';

const STATES = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING', label: 'Ending soon' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUSPENDED', label: 'Paused' },
  { value: 'SCHEDULED', label: 'Starts later' },
  { value: 'REVOKED', label: 'Revoked' },
];
const PRODUCTS = LICENSE_PRODUCTS.map((p) => ({ value: p, label: LICENSE_INFO[p].label }));

/** Web /platform/licenses: every client's licences. RYDO decides what each company may use, and until when. */
export default function Licences() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState(params.state ?? '');
  const [product, setProduct] = useState('');
  const [org, setOrg] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [issueFor, setIssueFor] = useState('');
  const [issueProduct, setIssueProduct] = useState<LicenseProduct>('SHARE');

  const { data: clients } = useData(() => api<Client[]>('GET', '/admin/platform/organizations').catch(() => [] as Client[]), []);
  const { data: summary, reload: reloadSummary } = useData(() => api<LicenseSummary>('GET', '/admin/platform/licenses/summary').catch(() => null), []);
  const { data: rows, setData: setRows, reload: reloadRows, error } = useData(() => {
    const p = new URLSearchParams();
    if (state) p.set('state', state);
    if (product) p.set('product', product);
    if (org) p.set('orgId', org);
    return api<LicenseRow[]>('GET', `/admin/platform/licenses?${p}`);
  }, [state, product, org]);
  const load = async () => {
    await Promise.all([reloadRows(), reloadSummary()]);
  };
  const change = (fn: () => void) => {
    setRows(undefined);
    fn();
  };
  const clientOptions = [{ value: '', label: 'All clients' }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))];

  const tiles = [
    { k: 'Active licences', v: summary?.active, tone: colors.successText, filter: 'ACTIVE' },
    { k: `Ending in ${summary?.expiringDays ?? 30} days`, v: summary?.expiringSoon, tone: colors.warningText, filter: 'EXPIRING' },
    { k: 'Expired', v: summary?.expired, tone: colors.danger, filter: 'EXPIRED' },
    { k: 'Paused', v: summary?.suspended, tone: colors.warningText, filter: 'SUSPENDED' },
  ];

  return (
    <PlatformScreen title="Licences" sub="What each client can use, and until when. A product stops for a client the moment its licence ends or is paused." onRefresh={load}>
      {error ? <Notice tone="error">{errText(error, 'Could not load.')}</Notice> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t) => (
          <Pressable
            key={t.k}
            accessibilityRole="button"
            accessibilityState={{ selected: state === t.filter }}
            onPress={() => change(() => setState(state === t.filter ? '' : t.filter))}
            style={[s.card, { flexBasis: '47%', flexGrow: 1, gap: 2, borderWidth: 2, borderColor: state === t.filter ? colors.ink : 'transparent' }]}
          >
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.tone }}>{summary ? (t.v ?? 0) : '–'}</Text>
            <Text style={[s.small, { fontWeight: '700' }]}>{t.k}</Text>
          </Pressable>
        ))}
      </View>
      {summary && summary.clientsWithoutShare > 0 ? (
        <Notice tone="error">{summary.clientsWithoutShare} {summary.clientsWithoutShare === 1 ? 'client has' : 'clients have'} no valid RYDO Share licence, so their employees cannot carpool right now.</Notice>
      ) : null}

      <Select label="Client" value={org} options={clientOptions} onChange={(v) => change(() => setOrg(v))} />
      <Select label="Product" value={product} options={[{ value: '', label: 'All products' }, ...PRODUCTS]} onChange={(v) => change(() => setProduct(v))} />
      <Select label="Status" value={state} options={STATES} onChange={(v) => change(() => setState(v))} />

      {!rows && !error ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty title="No licences here">Try another filter, or issue one below.</Empty> : null}
      {rows?.map((l) => {
        const key = l.id ?? `${l.organization?.id}-${l.product}`;
        const isOpen = open === key;
        return (
          <Card key={key} style={{ gap: 10 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="badge" size={17} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.strong, { fontSize: 15 }]} numberOfLines={1}>{l.organization?.name}</Text>
                <Text style={[s.small, { fontSize: 12 }]}>{LICENSE_INFO[l.product].label}</Text>
                <Text style={[s.small, { fontSize: 12 }]}>{dayLabel(l.expiresAt)}{leftLabel(l) ? ` · ${leftLabel(l)}` : ''}</Text>
              </View>
              <Badge tone={stateTone(l.state, l.daysLeft)}>{STATE_LABEL[l.state]}</Badge>
            </Pressable>
            {isOpen && l.organization ? (
              <View style={{ gap: 10 }}>
                {l.statusReason ? <Text style={s.small}>Reason: {l.statusReason}</Text> : null}
                <LicenceControls orgId={l.organization.id} product={l.product} state={l.state} endsOn={l.expiresAt} onChanged={load} />
                <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/platform/clients/[id]', params: { id: l.organization!.id } } as Href)}>
                  <Text style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>Open {l.organization.name}</Text>
                </Pressable>
              </View>
            ) : null}
          </Card>
        );
      })}

      <Card style={{ gap: 10 }}>
        <Text style={s.strong}>Issue a licence</Text>
        <Text style={s.small}>Give a client a product it does not have yet, with an end date.</Text>
        <Select label="Client" value={issueFor} options={[{ value: '', label: 'Choose a client…' }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]} onChange={setIssueFor} />
        <Select label="Product" value={issueProduct} options={PRODUCTS} onChange={(v) => setIssueProduct(v as LicenseProduct)} />
        {issueFor ? (
          <LicenceControls
            key={issueFor + issueProduct}
            orgId={issueFor}
            product={issueProduct}
            state="NONE"
            onChanged={() => {
              setIssueFor('');
              load();
            }}
          />
        ) : null}
      </Card>
    </PlatformScreen>
  );
}
