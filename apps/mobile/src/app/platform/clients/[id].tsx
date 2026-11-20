import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { LICENSE_INFO, ORG_FEATURE_INFO, type OrgFeatures } from '@rydo/shared';
import { api, errText } from '@/lib/api';
import { Alert } from '@/lib/dialog';
import { fmtTime, fmtWhen } from '@/lib/format';
import { useData } from '@/lib/hooks';
import { actionLabel, dayLabel, leftLabel, STATE_LABEL, stateTone, statusTone, type ClientDetail, type LicenseRow } from '@/lib/platform';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { DayChart } from '@/components/day-chart';
import { Icon, type IconName } from '@/components/icons';
import { LicenceControls } from '@/components/licence-controls';
import { PlatformScreen } from '@/components/platform-screen';
import { RouteMap } from '@/components/route-map';
import { Avatar, BackButton, Badge, Button, Card, Chip, ChipRow, Field, Loading, Notice, s, SwitchRow } from '@/components/ui';

type Msg = { tone: 'ok' | 'error'; text: string } | undefined;

function Title({ icon, children, right }: { icon: IconName; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={18} />
      <Text style={[s.strong, { flex: 1 }]}>{children}</Text>
      {right}
    </View>
  );
}

/** Web /platform/clients/[id]: one client's numbers, licences, options, plan, admins, offices, rules and activity. */
export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { startSupport } = useSession();
  const { data: c, setData, error } = useData(() => api<ClientDetail>('GET', `/admin/platform/organizations/${id}`), [id]);
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string | null>(null);
  const [supportForm, setSupportForm] = useState<{ reason: string; minutes: string } | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(undefined);
    try {
      await fn();
      setData(await api<ClientDetail>('GET', `/admin/platform/organizations/${id}`));
      if (ok) setMsg({ tone: 'ok', text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e, "That didn't work.") });
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!c) {
    return (
      <PlatformScreen title="Client">
        {error ? <Notice tone="error">{errText(error, 'Could not load this client.')}</Notice> : <Loading />}
      </PlatformScreen>
    );
  }

  const st = c.stats;
  const patch = (body: object, ok: string) => act('patch', () => api('PATCH', `/admin/platform/organizations/${c.id}`, body), ok);
  const openSupport = async (reason: string, minutes: number) => {
    if (reason.trim().length < 5) return setMsg({ tone: 'error', text: 'Write why you need to look (5 characters or more).' });
    setBusy('support');
    try {
      const g = await api<{ expiresAt: string }>('POST', `/admin/platform/organizations/${c.id}/support`, { reason: reason.trim(), minutes });
      startSupport({ orgId: c.id, orgName: c.name, expiresAt: g.expiresAt });
      router.push('/manage/employees');
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e, 'Could not start support view.') });
    } finally {
      setBusy(null);
    }
  };
  const tiles: { k: string; v: string | number; sub?: string; icon: IconName; warn?: boolean }[] = [
    { k: 'Employees', v: c.maxEmployees ? `${st?.activeMembers ?? 0}/${c.maxEmployees}` : st?.activeMembers ?? 0, sub: st?.pendingMembers ? `${st.pendingMembers} waiting for HR` : undefined, icon: 'users', warn: !!c.maxEmployees && (st?.activeMembers ?? 0) >= c.maxEmployees * 0.9 },
    { k: 'Verified drivers', v: st?.verifiedDrivers ?? 0, sub: st?.pendingDrivers ? `${st.pendingDrivers} to check` : undefined, icon: 'badge' },
    { k: 'Rides next 7 days', v: st?.ridesNext7 ?? 0, sub: `${st?.ridesLast7 ?? 0} in the last 7`, icon: 'car' },
    { k: 'Bookings, 7 days', v: st?.bookingsLast7 ?? 0, icon: 'ticket' },
  ];

  return (
    <PlatformScreen
      title={c.name}
      header={
        <View style={{ borderRadius: 26, padding: 20, gap: 12, backgroundColor: colors.panel, overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: -60, top: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.lime, opacity: 0.18 }} />
          <BackButton dark />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={c.name} tone="lime" size={56} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text accessibilityRole="header" style={{ color: colors.onPanel, fontSize: 24, fontWeight: '800' }} numberOfLines={2}>{c.name}</Text>
              <View style={{ alignSelf: 'flex-start' }}>
                <Badge tone={c.status === 'ACTIVE' ? 'lime' : statusTone(c.status)}>{c.status === 'SUSPENDED' ? 'paused' : c.status.toLowerCase()}</Badge>
              </View>
            </View>
          </View>
          <Text style={{ color: colors.panelMuted, fontSize: 13 }}>{c.emailDomains.join(', ')} · {c.timezone} · client since {dayLabel(c.createdAt)}</Text>
          {c.contact.name ? (
            <Text style={{ color: colors.panelMuted, fontSize: 13 }}>
              Contact: <Text style={{ color: colors.onPanel, fontWeight: '700' }}>{c.contact.name}</Text> · {c.contact.email}{c.contact.phone ? ` · ${c.contact.phone}` : ''}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button small variant="lime" label="Open support view" disabled={c.status !== 'ACTIVE'} onPress={() => setSupportForm(supportForm ? null : { reason: '', minutes: '60' })} />
            {c.status === 'ACTIVE' ? (
              <Button
                small
                variant="ghost"
                label="Pause client"
                loading={busy === 'patch'}
                onPress={() =>
                  Alert.alert('Pause client?', `Pause ${c.name}? Nobody at the company can use RYDO until you activate it again.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Pause', style: 'destructive', onPress: () => patch({ status: 'SUSPENDED' }, 'Client paused.') },
                  ])
                }
              />
            ) : (
              <Button small variant="ghost" label="Activate" loading={busy === 'patch'} onPress={() => patch({ status: 'ACTIVE' }, 'Client is active again.')} />
            )}
          </View>
          {c.status !== 'ACTIVE' ? <Text style={{ color: colors.panelMuted, fontSize: 12 }}>Activate the client first to open a support view.</Text> : null}
          {supportForm ? (
            <View style={{ gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.panel2 }}>
              <Text style={{ color: colors.onPanel, fontWeight: '700' }}>Why do you need to look inside {c.name}?</Text>
              <TextInput
                autoFocus
                maxLength={300}
                value={supportForm.reason}
                onChangeText={(reason) => setSupportForm({ ...supportForm, reason })}
                placeholder="e.g. HR asked why an approval fails"
                placeholderTextColor={colors.panelMuted}
                style={{ color: colors.onPanel, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 12, padding: 12, fontSize: 15 }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ color: colors.panelMuted, fontWeight: '700' }}>For</Text>
                {['30', '60', '120'].map((m) => (
                  <Chip key={m} tone="lime" label={m === '120' ? '2 hours' : `${m} min`} selected={supportForm.minutes === m} onPress={() => setSupportForm({ ...supportForm, minutes: m })} />
                ))}
              </View>
              <Button variant="lime" label="Start read-only view" loading={busy === 'support'} onPress={() => openSupport(supportForm.reason, Number(supportForm.minutes))} />
              <Text style={{ color: colors.panelMuted, fontSize: 12 }}>You will see their admin screens but can&apos;t change anything. The reason and times are saved in the activity log, which the client can see.</Text>
            </View>
          ) : null}
          {c.support ? (
            <Text style={{ color: colors.panelAccent, fontSize: 13, fontWeight: '700' }}>Your support session is open until {fmtTime(c.support.expiresAt)}.</Text>
          ) : null}
        </View>
      }
    >
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t) => (
          <View key={t.k} style={[s.card, { flexBasis: '47%', flexGrow: 1, gap: 4 }]}>
            <Icon name={t.icon} size={18} color={t.warn ? colors.warningText : colors.ink} />
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.warn ? colors.warningText : colors.ink }}>{t.v}</Text>
            <Text style={[s.small, { fontWeight: '700', color: colors.ink }]}>{t.k}</Text>
            {t.sub ? <Text style={[s.small, { fontSize: 12 }]}>{t.sub}</Text> : null}
          </View>
        ))}
      </View>

      <DayChart series={c.series} />
      <LicensesCard orgId={c.id} />

      <Card style={{ gap: 10 }}>
        <Title icon="layers" right={busy === 'patch' ? <Text style={s.small}>saving…</Text> : undefined}>Options</Title>
        <Text style={s.small}>Only RYDO can change these. Products themselves are controlled by the licences above.</Text>
        {(Object.keys(ORG_FEATURE_INFO) as (keyof OrgFeatures)[])
          .filter((k) => !ORG_FEATURE_INFO[k].module)
          .map((k) => (
            <View key={k} style={{ gap: 2 }}>
              <SwitchRow
                label={ORG_FEATURE_INFO[k].label + (ORG_FEATURE_INFO[k].soon ? ' (coming later)' : '')}
                value={c.features[k]}
                disabled={busy === 'patch'}
                onChange={(v) => patch({ features: { [k]: v } }, `${ORG_FEATURE_INFO[k].label} switched ${v ? 'on' : 'off'}.`)}
              />
              <Text style={[s.small, { fontSize: 12 }]}>{ORG_FEATURE_INFO[k].hint}</Text>
            </View>
          ))}
      </Card>

      <PlanForm key={`${c.id}-${c.maxEmployees}-${c.notes}`} c={c} busy={busy === 'plan'} onSave={(body) => act('plan', () => api('PATCH', `/admin/platform/organizations/${c.id}`, body), 'Saved.')} />
      <Admins c={c} busy={busy === 'admin'} onAdd={(body) => act('admin', () => api('POST', `/admin/platform/organizations/${c.id}/admins`, body), `${body.name} is now an admin.`)} />

      <Card style={{ gap: 10 }}>
        <Title icon="building" right={<Badge tone="neutral">{String(c.offices.length)}</Badge>}>Offices</Title>
        {c.offices.length === 0 ? (
          <Text style={s.small}>No offices yet. The company admin adds them under Offices &amp; teams.</Text>
        ) : (
          <>
            <View style={{ height: 180, borderRadius: 16, overflow: 'hidden' }}>
              <RouteMap style={{ flex: 1 }} markers={c.offices.map((o) => ({ id: o.id, at: { lat: o.lat, lng: o.lng }, kind: 'end' as const, label: o.name }))} />
            </View>
            {c.offices.map((o) => (
              <Pressable key={o.id} accessibilityRole="link" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${o.lat},${o.lng}`)} style={{ gap: 2, paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.strong, { fontSize: 15 }]}>{o.name}</Text>
                  {o.isDefault ? <Badge tone="lime">main</Badge> : null}
                </View>
                <Text style={s.small}>{o.address}</Text>
              </Pressable>
            ))}
          </>
        )}
      </Card>

      <Card style={{ gap: 8 }}>
        <Title icon="route" right={<Text style={[s.small, { fontSize: 12 }]}>set by the client</Text>}>Ride rules</Title>
        {[
          ['Pickup distance', `${c.settings.pickupRadiusMeters} m`],
          ['Free cancel window', `${c.settings.freeCancelHours} h`],
          ['Driver pop-up', `${c.settings.driverPopupSeconds} s`],
          ['Request timeout', `${c.settings.requestTimeoutMinutes} min`],
          ['Women-only allowed', c.settings.womenOnlyEnabled && c.features.womenOnly ? 'Yes' : 'No'],
          ['Fuel cost per km', c.settings.costPerKmEstimate && c.features.costShare ? `₹${c.settings.costPerKmEstimate}` : 'Not shown'],
        ].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Text style={s.small}>{k}</Text>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{v}</Text>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 8 }}>
        <Title
          icon="clock"
          right={
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/platform/activity', params: { org: c.id } } as Href)}>
              <Text style={{ fontWeight: '800', color: colors.ink, textDecorationLine: 'underline' }}>See all</Text>
            </Pressable>
          }
        >
          Recent activity
        </Title>
        {c.recent.length === 0 ? <Text style={s.small}>Nothing yet.</Text> : null}
        {c.recent.map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
            <Text style={[s.small, { flex: 1, color: colors.ink }]}>
              <Text style={{ fontWeight: '700' }}>{actionLabel(a.action)}</Text>
              {a.actor ? ` · ${a.actor.name}` : ''}
            </Text>
            <Text style={[s.small, { fontSize: 12 }]}>{fmtWhen(a.createdAt)}</Text>
          </View>
        ))}
      </Card>
    </PlatformScreen>
  );
}

/** What this client may use. Each product works only while its licence is valid. */
function LicensesCard({ orgId }: { orgId: string }) {
  const { data: rows, reload } = useData(() => api<LicenseRow[]>('GET', `/admin/platform/organizations/${orgId}/licenses`).catch(() => [] as LicenseRow[]), [orgId]);
  return (
    <Card style={{ gap: 12 }}>
      <Title icon="badge">Licences</Title>
      <Text style={s.small}>This client can use a product only while its licence is valid. When a licence ends or is paused, that product stops for every employee right away.</Text>
      {!rows ? <Loading /> : null}
      {rows?.map((l) => (
        <View key={l.product} style={{ gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.strong, { fontSize: 15 }]}>{LICENSE_INFO[l.product].label}{LICENSE_INFO[l.product].soon ? ' (coming later)' : ''}</Text>
              <Text style={[s.small, { fontSize: 12 }]}>{LICENSE_INFO[l.product].hint}</Text>
            </View>
            <Badge tone={stateTone(l.state, l.daysLeft)}>{STATE_LABEL[l.state]}</Badge>
          </View>
          {l.state !== 'NONE' ? (
            <Text style={s.small}>
              Valid until <Text style={{ fontWeight: '800', color: colors.ink }}>{dayLabel(l.expiresAt)}</Text>
              {leftLabel(l) ? ` · ${leftLabel(l)}` : ''}
              {l.statusReason && (l.state === 'SUSPENDED' || l.state === 'REVOKED') ? ` · ${l.statusReason}` : ''}
            </Text>
          ) : null}
          <LicenceControls orgId={orgId} product={l.product} state={l.state} endsOn={l.expiresAt} onChanged={reload} />
        </View>
      ))}
    </Card>
  );
}

function PlanForm({ c, busy, onSave }: { c: ClientDetail; busy: boolean; onSave: (body: object) => Promise<boolean> }) {
  const [f, setF] = useState({ limit: c.maxEmployees ? String(c.maxEmployees) : '', name: c.contact.name ?? '', email: c.contact.email ?? '', phone: c.contact.phone ?? '', notes: c.notes ?? '' });
  return (
    <Card style={{ gap: 10 }}>
      <Title icon="ticket">Plan and contact</Title>
      <Field label="Seat limit (active employees)" keyboardType="number-pad" placeholder="No limit" value={f.limit} onChangeText={(v) => setF({ ...f, limit: v.replace(/\D/g, '') })} />
      <Field label="Contact name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
      <Field label="Contact email" autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} />
      <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
      <Field label="Internal notes (RYDO only)" multiline maxLength={2000} placeholder="Contract dates, special terms, who to call…" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Button label="Save" loading={busy} onPress={() => onSave({ maxEmployees: f.limit ? Number(f.limit) : null, contactName: f.name || null, contactEmail: f.email || null, contactPhone: f.phone || null, notes: f.notes || null })} />
    </Card>
  );
}

function Admins({ c, busy, onAdd }: { c: ClientDetail; busy: boolean; onAdd: (body: { name: string; email: string; password?: string }) => Promise<boolean> }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: 10 }}>
      <Title icon="users" right={<Button small variant="soft" label={open ? 'Close' : '+ Add admin'} onPress={() => setOpen((o) => !o)} />}>Company admins</Title>
      {c.admins.map((a) => (
        <View key={a.membershipId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={a.name} size={36} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.strong, { fontSize: 15 }]} numberOfLines={1}>{a.name}</Text>
            <Text style={[s.small, { fontSize: 12 }]} numberOfLines={1}>{a.email}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {a.roles.filter((r) => r.endsWith('ADMIN')).map((r) => <Badge key={r} tone="neutral">{r.replace('_ADMIN', '').toLowerCase()}</Badge>)}
              {!a.hasPassword ? <Badge tone="warning">no password yet</Badge> : null}
              {a.status !== 'ACTIVE' ? <Badge tone="warning">{a.status.toLowerCase()}</Badge> : null}
            </View>
          </View>
        </View>
      ))}
      {open ? (
        <View style={{ gap: 10, paddingTop: 6 }}>
          <Field label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <Field label={`Work email (${c.emailDomains[0]})`} autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} />
          <Field label="Temporary password (optional)" autoCapitalize="none" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} />
          <Button
            label="Add admin"
            loading={busy}
            disabled={!f.name.trim() || !f.email.trim()}
            onPress={async () => {
              if (await onAdd({ name: f.name.trim(), email: f.email.trim(), password: f.password || undefined })) {
                setF({ name: '', email: '', password: '' });
                setOpen(false);
              }
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}
