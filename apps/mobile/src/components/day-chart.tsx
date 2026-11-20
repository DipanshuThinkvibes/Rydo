import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { isoDay } from '@/lib/format';
import { colors, isDark } from '@/lib/theme';
import { Card, s } from './ui';

/** Same pair as the web DayChart: blue = rides, green = booked seats (lighter shades on dark). */
const ridesColor = () => (isDark() ? '#60A5FA' : '#2563EB');
const bookingsColor = () => (isDark() ? '#A3E635' : '#65A30D');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/** Web DayChart: two counts per day on one axis; tap a day for its numbers. */
export function DayChart({ series, title = 'Rides and booked seats by day' }: { series: { day: string; rides: number; bookings: number }[]; title?: string }) {
  const today = isoDay(0);
  const [pick, setPick] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((d) => Math.max(d.rides, d.bookings)));
  const top = max <= 2 ? 2 : Math.ceil(max / 4) * 4;
  const shown = pick ?? series.findIndex((d) => d.day === today);
  const sel = shown >= 0 ? series[shown] : null;
  const every = Math.max(1, Math.ceil(series.length / 6));
  return (
    <Card style={{ gap: 12 }}>
      <Text style={s.strong}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {[
          ['Rides', ridesColor()],
          ['Booked seats', bookingsColor()],
        ].map(([l, c]) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />
            <Text style={[s.small, { fontSize: 12 }]}>{l}</Text>
          </View>
        ))}
        <Text style={[s.small, { fontSize: 12, marginLeft: 'auto' }]}>max {top}</Text>
      </View>
      <View accessible accessibilityLabel={`${title}. ${series.map((d) => `${label(d.day)}: ${d.rides} rides, ${d.bookings} booked seats`).join('; ')}`} style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {series.map((d, i) => (
          <Pressable key={d.day} onPress={() => setPick(i)} style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1, borderRadius: 4, backgroundColor: i === shown ? colors.surface2 : 'transparent' }}>
            <View style={{ flex: 1, maxWidth: 8, height: `${(d.rides / top) * 100}%`, minHeight: d.rides ? 3 : 0, backgroundColor: ridesColor(), borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
            <View style={{ flex: 1, maxWidth: 8, height: `${(d.bookings / top) * 100}%`, minHeight: d.bookings ? 3 : 0, backgroundColor: bookingsColor(), borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {series.map((d, i) => (
          <Text key={d.day} style={{ flex: 1, fontSize: 9, color: colors.muted, textAlign: 'center' }} numberOfLines={1}>
            {i % every === 0 ? label(d.day).split(' ')[0] : ''}
          </Text>
        ))}
      </View>
      {sel ? (
        <Text style={[s.small, { color: colors.ink }]}>
          <Text style={{ fontWeight: '800' }}>{label(sel.day)}{sel.day === today ? ' · today' : ''}</Text> · {sel.rides} rides · {sel.bookings} booked seats
        </Text>
      ) : null}
    </Card>
  );
}
