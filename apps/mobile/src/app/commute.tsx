import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CommuteDayView, LegState, Place } from '@rydo/shared';
import { colors } from '@rydo/ui-tokens';
import { api, errText } from '@/lib/api';
import { dayNum, fmtClock, isoDow, monthShort, shortName, weekdayShort } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { getOffices, officePlace } from '@/lib/places';
import type { Office } from '@/lib/types';
import { PlacePicker, type Saved } from '@/components/place-picker';
import { AccountButton } from '@/components/account-button';
import { TabBar } from '@/components/tab-bar';
import { Button, Card, Loading, Notice, s, Switch } from '@/components/ui';

type Status = 'OFFICE' | 'WFH' | 'LEAVE';
const NEXT: Record<Status, Status> = { OFFICE: 'WFH', WFH: 'LEAVE', LEAVE: 'OFFICE' };

interface Data {
  week: CommuteDayView[];
  home: Place | null;
  offices: Office[];
}

/** Prototype screen 13: My commute. Office / WFH / Leave per day, auto-booked rides. */
export default function Commute() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [picking, setPicking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data, setData, reload } = useData<Data>(async () => {
    const [week, home, offices] = await Promise.all([
      api<CommuteDayView[]>('GET', '/me/commute?days=14'),
      api<Place | null>('GET', '/me/home').catch(() => null),
      getOffices().catch(() => [] as Office[]),
    ]);
    return { week, home, offices };
  }, []);

  if (!data) return <Loading />;

  // The next five working days from today.
  const days = data.week.filter((d) => isoDow(d.date) <= 5).slice(0, 5);
  const usual = data.week.find((d) => d.status === 'OFFICE');
  const toOffice = usual?.toOfficeTime ?? '09:00';
  const toHome = usual?.toHomeTime ?? '18:30';
  const officeDays = days.filter((d) => d.status === 'OFFICE').length;
  const autoOn = days.some((d) => d.planned) ? days.filter((d) => d.status === 'OFFICE').every((d) => d.autoBook) : true;
  const range = days.length ? `${dayNum(days[0].date)}–${dayNum(days[days.length - 1].date)} ${monthShort(days[days.length - 1].date)}` : '';

  async function act<T>(key: string, fn: () => Promise<T>, ok?: (r: T) => string) {
    setBusy(key);
    setMsg(undefined);
    try {
      const r = await fn();
      if (ok) setMsg({ tone: 'ok', text: ok(r) });
      return r;
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const save = (list: { date: string; status: Status; autoBook: boolean }[]) =>
    act('save', () =>
      api<CommuteDayView[]>('PUT', '/me/commute', {
        days: list.map((d) => ({ date: d.date, status: d.status, toOfficeTime: d.status === 'OFFICE' ? toOffice : null, toHomeTime: d.status === 'OFFICE' ? toHome : null, autoBook: d.autoBook })),
      }),
    ).then((w) => w && setData({ ...data, week: w }));

  const cycle = (d: CommuteDayView) => save([{ date: d.date, status: d.status ? NEXT[d.status] : 'OFFICE', autoBook: d.autoBook ?? true }]);
  const setAuto = (on: boolean) => save(days.map((d) => ({ date: d.date, status: (d.status ?? (isoDow(d.date) <= 5 ? 'OFFICE' : 'WFH')) as Status, autoBook: on })));
  const plan = () =>
    act('plan', () => api<{ requested: number; booked: number; waitlisted: number }>('POST', '/me/commute/plan'), (r) => {
      const parts = [r.booked && `${r.booked} booked`, r.requested && `${r.requested} requested`, r.waitlisted && `${r.waitlisted} on the waitlist`].filter(Boolean);
      return parts.length ? `Done: ${parts.join(', ')}.` : 'Every office day already has a ride or a waitlist place.';
    }).then(reload);

  const saved: Saved[] = data.offices.map((o) => ({ key: o.id, title: `Office · ${o.name}`, sub: o.address ?? undefined, icon: 'building' as const, place: officePlace(o) }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await reload(), setRefreshing(false))} />}>
          <View>
            <Text style={s.small}>Week of {range}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text accessibilityRole="header" style={s.h1}>My commute</Text>
                <Text style={s.small}>{officeDays} office {officeDays === 1 ? 'day' : 'days'}</Text>
              </View>
              <AccountButton />
            </View>
          </View>

          {!data.home ? (
            <Card style={{ gap: 10 }}>
              <Text style={s.strong}>Where is home?</Text>
              <Text style={s.small}>RYDO needs your home pickup point to find rides for your office days. Only the matching uses it.</Text>
              <Button small label="Set home" onPress={() => setPicking(true)} />
            </Card>
          ) : null}

          <Card dark style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.white, fontSize: 18, fontWeight: '800' }}>Auto-book office days</Text>
              <Text style={{ color: colors.mutedOnDark, fontSize: 14, lineHeight: 20 }}>RYDO books your best match for each office day as you plan it. You can change any day.</Text>
            </View>
            <Switch label="Auto-book office days" value={autoOn} disabled={busy !== null} onChange={setAuto} />
          </Card>

          <Button label="Find rides for my week now" variant="lime" loading={busy === 'plan'} disabled={!data.home || officeDays === 0} onPress={plan} />
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

          <Text style={s.small}>Tap a day&apos;s label to switch Office, WFH or Leave</Text>
          {days.map((d) => (
            <DayCard key={d.date} d={d} busy={busy === 'save'} onCycle={() => cycle(d)} />
          ))}

          {data.home ? (
            <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={{ paddingVertical: 8 }}>
              <Text style={s.small}>
                Home pickup: <Text style={{ color: colors.ink, fontWeight: '700' }}>{data.home.label}</Text> · <Text style={{ textDecorationLine: 'underline' }}>change</Text>
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <TabBar active="commute" />

      <PlacePicker
        visible={picking}
        title="Home pickup point"
        saved={saved}
        onClose={() => setPicking(false)}
        onPick={async (p) => {
          setPicking(false);
          try {
            const h = await api<Place>('PUT', '/me/home', p);
            setData({ ...data, home: h });
          } catch (e) {
            Alert.alert('Could not save home', errText(e));
          }
        }}
      />
    </View>
  );
}

function legText(leg: LegState) {
  if (leg.state === 'BOOKED') return { who: shortName(leg.driverName), tag: 'booked' };
  if (leg.state === 'REQUESTED') return { who: shortName(leg.driverName), tag: 'requested' };
  if (leg.state === 'WAITLISTED') return { who: null, tag: 'waitlist' };
  return { who: null, tag: 'none' };
}

function DayCard({ d, onCycle, busy }: { d: CommuteDayView; onCycle: () => void; busy: boolean }) {
  const status = d.status;
  const a = legText(d.toOffice);
  const b = legText(d.toHome);
  const booked = a.tag === 'booked' && (b.tag === 'booked' || !d.toHomeTime);
  const label = status === 'OFFICE' ? 'Office' : status === 'WFH' ? 'WFH' : status === 'LEAVE' ? 'Leave' : 'Set day';
  const chip =
    status === 'OFFICE' ? { bg: colors.ink, fg: colors.white } : status === 'WFH' ? { bg: '#E3E9FF', fg: '#2B3FA8' } : status === 'LEAVE' ? { bg: colors.warningBg, fg: colors.warningText } : { bg: colors.surface2, fg: colors.ink };

  const line = (time: string | null, where: string, leg: ReturnType<typeof legText>) =>
    time ? (
      <Text style={{ fontSize: 15, color: colors.muted }}>
        <Text style={{ color: colors.ink, fontWeight: '800' }}>{fmtClock(time)}</Text> {where}
        {leg.who ? (
          <>
            {' '}with <Text style={{ color: colors.ink, fontWeight: '800' }}>{leg.who}</Text>
            {leg.tag === 'requested' ? ' (asked)' : ''}
          </>
        ) : leg.tag === 'waitlist' ? ' · on the waitlist' : ' · not booked yet'}
      </Text>
    ) : null;

  return (
    <View style={{ flexDirection: 'row', gap: 16, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }}>
      <View style={{ alignItems: 'center', width: 40 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>{weekdayShort(d.date)}</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>{dayNum(d.date)}</Text>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${weekdayShort(d.date)} ${dayNum(d.date)}: ${label}. Tap to change.`} disabled={busy} onPress={onCycle} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: chip.bg }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: chip.fg }}>{label}</Text>
          </Pressable>
          {status === 'OFFICE' ? (
            <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: booked ? colors.successText : colors.warningText }}>
              {booked ? (d.autoBook ? 'AUTO-BOOKED' : 'BOOKED') : a.tag === 'requested' || b.tag === 'requested' ? 'ASKED DRIVERS' : d.autoBook ? 'WILL AUTO-BOOK' : 'NOT BOOKED'}
            </Text>
          ) : null}
        </View>
        {status === 'OFFICE' ? (
          <>
            {line(d.toOfficeTime, 'to office', a)}
            {line(d.toHomeTime, 'home', b)}
          </>
        ) : (
          <Text style={{ fontSize: 15, color: colors.muted }}>{status === 'WFH' ? 'Working from home · no rides booked' : status === 'LEAVE' ? 'On leave · no rides booked' : 'Tap the label to plan this day'}</Text>
        )}
      </View>
    </View>
  );
}
