import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { api, errText } from '@/lib/api';
import { fmtKm, fmtMin, fmtTime, fmtWhen, isoDay, toPath, weekdayShort, dayNum } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import { Icon, type IconName } from '@/components/icons';
import { ManageScreen } from '@/components/manage-screen';
import { RouteMap } from '@/components/route-map';
import type { MapMarker, MapRoute } from '@/components/route-map-types';
import { Badge, Button, Chip, ChipRow, Empty, Loading, Notice, Plate, s, Switch } from '@/components/ui';

interface LiveRow { id: string; driverName: string; plateNumber: string; lat: number | null; lng: number | null; openSos: number; lastEvent: string | null }
interface Sos { id: string; status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'; createdAt: string; lat: number | null; lng: number | null; rideId: string; raisedBy: string; byDriver: boolean; driverName: string; plateNumber: string; from: string; to: string }
interface Rider { name: string; pickupLabel: string; status: string; seats: number; lat: number; lng: number }
interface OpsRide {
  id: string;
  direction: 'TO_OFFICE' | 'TO_HOME' | 'OTHER';
  status: 'SCHEDULED' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  departAt: string;
  originLabel: string;
  destinationLabel: string;
  seatsTotal: number;
  seatsBooked: number;
  womenOnly: boolean;
  distanceMeters: number | null;
  durationSeconds: number | null;
  driverName: string;
  plateNumber: string;
  vehicle: string;
  route: string | null;
  pendingRequests: number;
  riders: Rider[];
}
type Filter = 'all' | 'office' | 'home' | 'requests' | 'cancelled';

/** Web Admin → Rides (/ops): every carpool of one day on a map, with seats, riders, waiting requests, SOS and cars on the road. */
export default function OpsRides() {
  const days = useMemo(() => Array.from({ length: 9 }, (_, i) => isoDay(i - 1)), []);
  const [date, setDate] = useState(() => isoDay(0));
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [showLive, setShowLive] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sosBusy, setSosBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const { data: rides, reload: reloadRides, error: loadError } = useData(() => api<OpsRide[]>('GET', `/admin/rides?date=${date}`), [date], 30_000);
  const { data: live, reload: reloadLive } = useData(async () => {
    const [board, sos] = await Promise.all([api<LiveRow[]>('GET', '/admin/rides/live').catch(() => [] as LiveRow[]), api<Sos[]>('GET', '/admin/sos').catch(() => [] as Sos[])]);
    return { board, sos: sos.filter((x) => x.status !== 'RESOLVED') };
  }, [], 30_000);

  const sosAct = async (id: string, action: 'ack' | 'resolve') => {
    setSosBusy(id + action);
    try {
      await api('POST', `/admin/sos/${id}/${action}`, action === 'resolve' ? { notes: notes[id] ?? '' } : undefined);
      await reloadLive();
    } catch (e) {
      setError(errText(e));
    } finally {
      setSosBusy(null);
    }
  };

  const list = rides ?? [];
  const shown = list.filter((r) =>
    filter === 'office' ? r.direction === 'TO_OFFICE' && r.status !== 'CANCELLED' : filter === 'home' ? r.direction === 'TO_HOME' && r.status !== 'CANCELLED' : filter === 'requests' ? r.pendingRequests > 0 : filter === 'cancelled' ? r.status === 'CANCELLED' : true,
  );
  const active = list.filter((r) => r.status !== 'CANCELLED');
  const offered = active.reduce((a, r) => a + r.seatsTotal, 0);
  const booked = active.reduce((a, r) => a + r.seatsBooked, 0);
  const tiles: { k: string; v: string | number; icon: IconName; sub?: string; hot?: boolean }[] = [
    { k: 'Rides', v: active.length, icon: 'car', sub: list.length - active.length ? `${list.length - active.length} cancelled` : undefined },
    { k: 'Seats booked', v: `${booked}/${offered}`, icon: 'users', sub: offered ? `${Math.round((booked / offered) * 100)}% full` : undefined },
    { k: 'Riders', v: active.reduce((a, r) => a + r.riders.length, 0), icon: 'ticket' },
    { k: 'Waiting requests', v: active.reduce((a, r) => a + r.pendingRequests, 0), icon: 'clock', hot: active.some((r) => r.pendingRequests > 0) },
  ];

  const sel = list.find((r) => r.id === selected);
  const routes: MapRoute[] = shown.filter((r) => r.status !== 'CANCELLED').map((r) => ({ id: r.id, path: toPath(r.route), active: r.id === selected }));
  const markers: MapMarker[] = [];
  sel?.riders.forEach((p, i) => markers.push({ id: `p-${i}`, at: { lat: p.lat, lng: p.lng }, kind: 'person', label: p.name }));
  if (showLive) live?.board.forEach((b) => b.lat != null && b.lng != null && markers.push({ id: `car-${b.id}`, at: { lat: b.lat, lng: b.lng }, kind: 'car', inkCar: true }));
  live?.sos.forEach((x) => x.lat != null && x.lng != null && markers.push({ id: `sos-${x.id}`, at: { lat: x.lat, lng: x.lng }, kind: 'pickup', label: `SOS · ${x.raisedBy}` }));

  return (
    <ManageScreen title="Rides" sub="Every carpool in your company for the day. Refreshes every 30 seconds." roles={['ORG_ADMIN', 'OPS_ADMIN', 'HR_ADMIN']} onRefresh={() => Promise.all([reloadRides(), reloadLive()])}>
      <ChipRow>
        {days.map((d) => (
          <Pressable key={d} accessibilityRole="radio" accessibilityState={{ checked: d === date }} onPress={() => (setSelected(null), setDate(d))} style={{ width: 62, paddingVertical: 8, borderRadius: 14, alignItems: 'center', backgroundColor: d === date ? colors.inkBg : colors.white, borderWidth: 1.5, borderColor: d === date ? colors.inkBg : colors.lineStrong }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: d === date ? colors.lime : colors.muted }}>{d === isoDay(-1) ? 'YDAY' : d === isoDay(0) ? 'TODAY' : weekdayShort(d)}</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: d === date ? colors.onInk : colors.ink }}>{dayNum(d)}</Text>
          </Pressable>
        ))}
      </ChipRow>
      {error || loadError ? <Notice tone="error">{error ?? errText(loadError)}</Notice> : null}

      {live && live.sos.length > 0 ? (
        <View accessibilityRole="alert" style={{ gap: 10, padding: 16, borderRadius: 20, backgroundColor: colors.dangerBg }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.danger }}>SOS · {live.sos.length} open</Text>
          {live.sos.map((x) => (
            <View key={x.id} style={{ gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.white }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.strong, { flex: 1, fontSize: 15 }]}>
                  {x.raisedBy} <Text style={s.small}>{x.byDriver ? '(driver)' : '(rider)'} · {x.driverName}</Text>
                </Text>
                <Badge tone={x.status === 'ACTIVE' ? 'warning' : 'neutral'}>{x.status.toLowerCase()}</Badge>
              </View>
              <Text style={s.small}>{x.from} → {x.to} · {fmtWhen(x.createdAt)}</Text>
              <Plate plate={x.plateNumber} />
              {x.status === 'ACTIVE' ? <Button small label="I'm on it" loading={sosBusy === x.id + 'ack'} onPress={() => sosAct(x.id, 'ack')} /> : null}
              <TextInput value={notes[x.id] ?? ''} onChangeText={(v) => setNotes({ ...notes, [x.id]: v })} placeholder="What happened? (to close it)" placeholderTextColor={colors.muted} accessibilityLabel="What happened" style={s.input} />
              <Button small variant="ghost" label="Resolve" disabled={(notes[x.id] ?? '').trim().length < 3} loading={sosBusy === x.id + 'resolve'} onPress={() => sosAct(x.id, 'resolve')} />
            </View>
          ))}
        </View>
      ) : null}

      {live && live.board.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.successBg }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.successText }} />
          <Text style={{ flex: 1, fontWeight: '700', color: colors.successText }}>{live.board.length} {live.board.length === 1 ? 'ride is' : 'rides are'} on the road right now</Text>
          <Text style={[s.small, { color: colors.successText }]}>Show cars</Text>
          <Switch label="Show cars" value={showLive} onChange={setShowLive} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t) => (
          <View key={t.k} style={[s.card, { flexBasis: '47%', flexGrow: 1, gap: 4 }, t.hot ? { borderColor: colors.warningText } : null]}>
            <Icon name={t.icon} size={18} color={t.hot ? colors.warningText : colors.ink} />
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>{rides ? t.v : '–'}</Text>
            <Text style={[s.small, { color: colors.ink, fontWeight: '700' }]}>{t.k}</Text>
            {t.sub ? <Text style={[s.small, { fontSize: 12 }]}>{t.sub}</Text> : null}
          </View>
        ))}
      </View>

      <View style={{ height: 260, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
        <RouteMap style={{ flex: 1 }} routes={routes} markers={markers} />
      </View>

      <ChipRow>
        {(
          [
            ['all', 'All'],
            ['office', 'To office'],
            ['home', 'Back home'],
            ['requests', 'Waiting requests'],
            ['cancelled', 'Cancelled'],
          ] as const
        ).map(([v, l]) => (
          <Chip key={v} label={l} selected={filter === v} onPress={() => setFilter(v)} />
        ))}
      </ChipRow>

      {!rides && !loadError ? <Loading /> : null}
      {rides && shown.length === 0 ? <Empty title="No rides here">{list.length ? 'Try another filter.' : 'Nobody has published a ride for this day yet.'}</Empty> : null}
      {shown.map((r) => {
        const open = r.id === selected;
        const cancelled = r.status === 'CANCELLED';
        return (
          <Pressable key={r.id} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setSelected(open ? null : r.id)} style={[s.card, { gap: 10, opacity: cancelled ? 0.6 : 1 }, open ? { borderColor: colors.ink, borderWidth: 2 } : null]}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surface2, paddingVertical: 6 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{fmtTime(r.departAt).replace(/\s?[AP]M/i, '')}</Text>
                <Text style={[s.small, { fontSize: 11, fontWeight: '800' }]}>{fmtTime(r.departAt).slice(-2)}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={s.strong}>{r.driverName}</Text>
                  <Plate plate={r.plateNumber} />
                </View>
                <Text style={s.small} numberOfLines={2}>
                  {r.originLabel} → {r.destinationLabel}
                  {r.distanceMeters ? ` · ${fmtKm(r.distanceMeters)} · ${fmtMin(r.durationSeconds)}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {cancelled ? <Badge tone="neutral">cancelled</Badge> : null}
                  {r.status === 'FULL' ? <Badge tone="success">full</Badge> : null}
                  {r.womenOnly ? <Badge tone="women">women-only</Badge> : null}
                  {r.pendingRequests > 0 ? <Badge tone="warning">{`${r.pendingRequests} waiting`}</Badge> : null}
                  <Text style={[s.small, { fontWeight: '800', color: colors.ink }]}>{r.seatsBooked}/{r.seatsTotal} seats</Text>
                </View>
              </View>
            </View>
            {open ? (
              <View style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
                <Text style={[s.small, { fontWeight: '800' }]}>{r.vehicle} · riders</Text>
                {r.riders.length === 0 ? <Text style={s.small}>No riders booked yet.</Text> : null}
                {r.riders.map((p, j) => (
                  <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[s.small, { flex: 1, color: colors.ink }]} numberOfLines={1}>
                      <Text style={{ fontWeight: '800' }}>{p.name}</Text> · {p.pickupLabel}
                    </Text>
                    <Badge tone={p.status === 'NO_SHOW' ? 'warning' : 'neutral'}>{p.status.toLowerCase().replace('_', ' ')}</Badge>
                  </View>
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ManageScreen>
  );
}
