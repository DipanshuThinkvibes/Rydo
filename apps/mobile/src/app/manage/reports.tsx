import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, errText } from '@/lib/api';
import { isoDay } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { Bars, ManageScreen, StatTile } from '@/components/manage-screen';
import { Badge, Card, Chip, ChipRow, Empty, Label, Loading, Notice, s } from '@/components/ui';

interface Summary {
  totals: Record<string, number>;
  series: { day: string; rides: number; bookings: number }[];
  drivers: { name: string; rides: number; riders: number; rating: number | null }[];
  departments: { department: string; trips: number; riders: number }[];
}
type Preset = 'month' | 'last' | '30';

function rangeFor(p: Preset) {
  const today = isoDay(0);
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (p === 'month') return { from: `${y}-${pad(m)}-01`, to: today };
  if (p === 'last') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` };
  }
  return { from: isoDay(-29), to: today };
}

/** How the company uses RYDO (web Reports). CSV downloads stay on the web. */
export default function Reports() {
  const [preset, setPreset] = useState<Preset>('month');
  const range = rangeFor(preset);
  const { data, error, reload } = useData(() => api<Summary>('GET', `/admin/reports/summary?from=${range.from}&to=${range.to}`), [preset]);
  const t = data?.totals ?? {};
  const fill = t.seatsOffered ? Math.round(((t.seatsBooked ?? 0) / t.seatsOffered) * 100) : 0;
  const busiest = data ? [...data.series].sort((a, b) => b.bookings - a.bookings).slice(0, 7) : [];

  return (
    <ManageScreen title="Reports" sub="How your company uses RYDO. CSV exports for HR and finance are on the web Reports page." roles={['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN']} onRefresh={reload}>
      <ChipRow>
        {(
          [
            ['month', 'This month'],
            ['last', 'Last month'],
            ['30', 'Last 30 days'],
          ] as const
        ).map(([v, l]) => (
          <Chip key={v} label={l} selected={preset === v} onPress={() => setPreset(v)} />
        ))}
      </ChipRow>
      {error && !data ? <Notice tone="error">{errText(error)}</Notice> : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Rides offered" value={t.ridesOffered ?? 0} sub={`${t.ridesCompleted ?? 0} completed`} />
            <StatTile label="Seats booked" value={t.seatsBooked ?? 0} sub={`${fill}% of ${t.seatsOffered ?? 0} offered`} />
            <StatTile label="Trips taken" value={t.tripsCompleted ?? 0} sub={`${t.activeRiders ?? 0} riders · ${t.activeDrivers ?? 0} drivers`} />
            <StatTile label="Km shared" value={(t.sharedKm ?? 0).toLocaleString('en-IN')} sub="seat-km not driven alone" />
            <StatTile label="CO₂ saved (est.)" value={`${(t.co2SavedKg ?? 0).toLocaleString('en-IN')} kg`} sub="at 120 g per car-km" />
            <StatTile label="No-shows · late cancels" value={`${t.noShows ?? 0} · ${t.lateCancels ?? 0}`} sub={t.sosRaised ? `${t.sosRaised} SOS raised` : 'no SOS'} />
          </View>
          <Card style={{ gap: 10 }}>
            <Label>Busiest days (bookings)</Label>
            {busiest.some((d) => d.bookings > 0) ? <Bars rows={busiest.map((d) => ({ label: d.day, value: d.bookings }))} /> : <Text style={s.small}>No bookings in this period.</Text>}
          </Card>
          <Card style={{ gap: 10 }}>
            <Label>Top drivers</Label>
            {data.drivers.length === 0 ? <Empty title="No completed rides yet">Drivers appear here after their first completed ride.</Empty> : null}
            {data.drivers.map((d, i) => (
              <View key={d.name + i} style={[s.row, { paddingVertical: 4 }]}>
                <Text style={[s.strong, { flex: 1 }]}>{d.name}</Text>
                {i === 0 ? <Badge tone="lime">top</Badge> : null}
                <Text style={s.small}>{d.rides} rides · {d.riders} riders{d.rating ? ` · ★ ${d.rating.toFixed(1)}` : ''}</Text>
              </View>
            ))}
          </Card>
          <Card style={{ gap: 10 }}>
            <Label>By department</Label>
            {data.departments.length === 0 ? <Text style={s.small}>Trips taken show up here by the rider&apos;s department.</Text> : <Bars rows={data.departments.map((d) => ({ label: `${d.department} (${d.riders} riders)`, value: d.trips }))} unit=" trips" />}
          </Card>
        </>
      ) : null}
    </ManageScreen>
  );
}
